import { createHash } from "node:crypto";

const PREFIX = "h1.";
const METHODS = new Set(["create", "findOne", "findMany", "update", "delete", "deleteMany", "count"]);
export class UnsupportedSessionOperation extends Error {
  constructor() { super("Session operation requires the explicit management boundary"); this.name = "UnsupportedSessionOperation"; }
}
export function digestSessionToken(token) {
  if (typeof token !== "string" || token.length < 16 || token.length > 512 || token.startsWith(PREFIX)) {
    throw new UnsupportedSessionOperation();
  }
  return PREFIX + createHash("sha256").update("ringee:session:v1\0").update(token).digest("hex");
}

function tokenPredicate(where) {
  if (!Array.isArray(where) || !where.length) throw new UnsupportedSessionOperation();
  const originals = new Map();
  let constrained = false;
  const transformed = where.map((clause) => {
    // No OR branch may select a row whose original token was never presented.
    if (clause.connector !== undefined && clause.connector !== "AND") throw new UnsupportedSessionOperation();
    if (clause.field !== "token") return { ...clause };
    const operator = clause.operator ?? "eq";
    if (clause.mode === "insensitive" || !["eq", "in"].includes(operator)) throw new UnsupportedSessionOperation();
    const values = operator === "in" ? clause.value : [clause.value];
    if (!Array.isArray(values) || !values.length) throw new UnsupportedSessionOperation();
    const digests = values.map((raw) => {
      const digest = digestSessionToken(raw);
      originals.set(digest, raw);
      return digest;
    });
    constrained = true;
    return { ...clause, value: operator === "in" ? digests : digests[0] };
  });
  if (!constrained) throw new UnsupportedSessionOperation();
  return { transformed, originals };
}
function restore(row, originals) {
  if (row == null) return row;
  const original = originals.get(row.token);
  if (original === undefined) throw new UnsupportedSessionOperation();
  return { ...row, token: original };
}

/**
 * Proof-only outer wrapper of a Better Auth DBAdapter. All raw-token maps are
 * per invocation. Never persist them, cache them, or infer a bearer from a hash.
 */
export function wrapSessionAdapter(adapter) {
  return new Proxy(adapter, {
    get(target, property) {
      if (property === "transaction" && typeof target.transaction === "function") {
        return (callback) => target.transaction((tx) => callback(wrapSessionAdapter(tx)));
      }
      const value = Reflect.get(target, property);
      if (typeof value !== "function") return value;
      return async (args, ...rest) => {
        // Core 1.7.7 always supplies these shallow joins, even without experimental joins.
        // Any other shape could expose a nested session hash outside restoration.
        if (args?.join != null) {
          const keys = Object.keys(args.join);
          const allowed = property === "findOne" && (
            (args.model === "session" && keys.length === 1 && keys[0] === "user" && args.join.user === true) ||
            (args.model === "user" && keys.length === 1 && keys[0] === "account" && args.join.account === true)
          );
          if (keys.length && !allowed) throw new UnsupportedSessionOperation();
        }
        if (args?.model !== "session") return value.call(target, args, ...rest);
        if (!METHODS.has(property) || args.select || args.sortBy?.field === "token") throw new UnsupportedSessionOperation();
        if (property === "create") {
          const raw = args.data?.token;
          const digest = digestSessionToken(raw);
          const row = await value.call(target, { ...args, data: { ...args.data, token: digest } }, ...rest);
          return restore(row, new Map([[digest, raw]]));
        }
        const { transformed, originals } = tokenPredicate(args.where);
        const call = { ...args, where: transformed };
        if (property === "update" && Object.hasOwn(args.update ?? {}, "token")) {
          const raw = args.update.token;
          const digest = digestSessionToken(raw);
          call.update = { ...args.update, token: digest };
          // A rotation response must contain the new token, never the old one.
          originals.clear();
          originals.set(digest, raw);
        }
        const result = await value.call(target, call, ...rest);
        if (property === "findMany") return result.map((row) => restore(row, originals));
        if (["findOne", "update"].includes(property)) return restore(result, originals);
        // Delete/count methods return no session objects in the pinned contract.
        return result;
      };
    },
  });
}

export const DISABLED_SESSION_ROUTES = [
  "/list-sessions", "/revoke-session", "/revoke-sessions", "/revoke-other-sessions",
  "/change-password", "/reset-password", "/delete-user",
];
export function hashedSessionAdapter(factory) {
  return (options) => {
    // These features carry raw tokens or depend on token-based enumeration/hooks.
    if (options.secondaryStorage || options.experimental?.joins || options.session?.cookieCache?.enabled ||
        options.plugins?.length || options.databaseHooks?.session ||
        DISABLED_SESSION_ROUTES.some((path) => !options.disabledPaths?.includes(path))) {
      throw new UnsupportedSessionOperation();
    }
    return wrapSessionAdapter(factory(options));
  };
}
