import { createHmac, createCipheriv, createDecipheriv, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export class ProtectedVerificationError extends Error {
  constructor() { super("Protected verification operation rejected"); this.name = "ProtectedVerificationError"; }
}
const fail = () => { throw new ProtectedVerificationError(); };
const HASH = /^vh1\.[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = new Set(["id", "identifier", "value", "expiresAt", "createdAt", "updatedAt"]);
const METHODS = new Set(["create", "findOne", "findMany", "update", "delete", "deleteMany", "count", "consumeOne"]);
function rawIdentifier(value) {
  if (typeof value !== "string" || !value.length || value.length > 8192 || Buffer.from(value, "utf8").toString("utf8") !== value || value.startsWith("vh1.")) fail();
  return value;
}
function timestamp(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail();
  return value.getTime();
}
function knownFields(data) {
  if (!data || Object.keys(data).some((key) => !FIELDS.has(key))) fail();
}

/** Proof-only DBAdapter factory. Keys are independent 32-byte Buffers, copied on construction. */
export function protectedVerificationAdapter(factory, { identifierKey, encryptionKey }) {
  if (!Buffer.isBuffer(identifierKey) || identifierKey.length !== 32 ||
      !Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32 ||
      timingSafeEqual(identifierKey, encryptionKey)) fail();
  const macKey = Buffer.from(identifierKey), cipherKey = Buffer.from(encryptionKey);
  const digest = (identifier) => "vh1." + createHmac("sha256", macKey)
    .update("ringee:verification:identifier:v1\0").update(rawIdentifier(identifier), "utf8").digest("hex");
  const aad = (row) => {
    if (!UUID.test(row.id) || !HASH.test(row.identifier)) fail();
    return Buffer.from(JSON.stringify(["ringee:verification:value:v1", row.id, row.identifier, timestamp(row.expiresAt), timestamp(row.createdAt)]));
  };
  function seal(row) {
    knownFields(row);
    if (typeof row.value !== "string" || row.value.length > 65536) fail();
    const identifier = rawIdentifier(row.identifier), value = row.value;
    const stored = { ...row, identifier: digest(identifier) };
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", cipherKey, nonce);
    cipher.setAAD(aad(stored));
    const payload = Buffer.from(JSON.stringify({ identifier, value }), "utf8");
    if (payload.length > 300000) fail();
    const body = Buffer.concat([cipher.update(payload), cipher.final()]);
    return { ...stored, value: ["vg1", nonce.toString("base64url"), body.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".") };
  }
  function open(row, allowExpired = false) {
    if (row == null) return row;
    try {
      const parts = row.value.split(".");
      if (parts.length !== 4 || parts[0] !== "vg1") fail();
      const [nonce, body, tag] = parts.slice(1).map((part) => {
        if (!/^[A-Za-z0-9_-]+$/.test(part)) fail();
        const bytes = Buffer.from(part, "base64url");
        if (bytes.toString("base64url") !== part) fail();
        return bytes;
      });
      if (nonce.length !== 12 || tag.length !== 16 || body.length > 300000) fail();
      const decipher = createDecipheriv("aes-256-gcm", cipherKey, nonce);
      decipher.setAAD(aad(row)); decipher.setAuthTag(tag);
      const payload = JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"));
      if (typeof payload.value !== "string" || digest(payload.identifier) !== row.identifier) fail();
      if (!allowExpired && timestamp(row.expiresAt) <= Date.now()) return null;
      return { ...row, identifier: payload.identifier, value: payload.value };
    } catch { fail(); }
  }
  function predicate(where) {
    if (!Array.isArray(where) || !where.length) fail();
    let constrained = false;
    const transformed = where.map((item) => {
      if (!item || Object.keys(item).some((key) => !["field", "value", "operator", "connector", "mode"].includes(key)) ||
          (item.connector !== undefined && item.connector !== "AND") || item.mode !== undefined) fail();
      const op = item.operator ?? "eq";
      if (["id", "identifier"].includes(item.field)) {
        if (!["eq", "in"].includes(op)) fail();
        const values = op === "in" ? item.value : [item.value];
        if (!Array.isArray(values) || !values.length) fail();
        const mapped = values.map((v) => item.field === "identifier" ? digest(v) : (typeof v === "string" && UUID.test(v) ? v : fail()));
        constrained = true;
        return { ...item, value: op === "in" ? mapped : mapped[0] };
      }
      // The pinned internal adapter invokes expiry-only cleanup via deleteManyWithHooks.
      if (item.field === "expiresAt" && ["lt", "lte", "gt", "gte", "eq"].includes(op)) {
        timestamp(item.value); return { ...item };
      }
      fail();
    });
    const cleanup = where.length === 1 && where[0].field === "expiresAt" &&
      ["lt", "lte"].includes(where[0].operator) && timestamp(where[0].value) <= Date.now();
    if (!constrained && !cleanup) fail();
    return transformed;
  }
  function wrap(adapter) {
    return new Proxy(adapter, {
      get(target, property) {
        if (property === "transaction" && typeof target.transaction === "function")
          return (callback) => target.transaction((tx) => callback(wrap(tx)));
        const value = Reflect.get(target, property);
        if (typeof value !== "function") return value;
        return async (args, ...rest) => {
          // Reject aliases and joins that could bypass the canonical verification boundary.
          if (args?.model === "AuthVerification") fail();
          if (args?.join && Object.keys(args.join).length) {
            const keys = Object.keys(args.join);
            const safe = property === "findOne" && keys.length === 1 &&
              ((args.model === "session" && args.join.user === true && keys[0] === "user") ||
               (args.model === "user" && args.join.account === true && keys[0] === "account"));
            if (!safe) fail();
          }
          if (args?.model !== "verification") return value.call(target, args, ...rest);
          if (!METHODS.has(property) || args.select || args.join ||
              (args.sortBy && !["createdAt", "updatedAt", "expiresAt", "id"].includes(args.sortBy.field))) fail();
          if (property === "create") {
            knownFields(args.data);
            const data = { ...args.data, id: args.data.id ?? randomUUID() };
            if (timestamp(data.expiresAt) <= Date.now()) fail();
            return open(await value.call(target, { ...args, forceAllowId: true, data: seal(data) }, ...rest));
          }
          const where = predicate(args.where);
          if (property === "update") {
            knownFields(args.update);
            if (Object.hasOwn(args.update, "id")) fail();
            const current = await target.findOne({ model: "verification", where });
            if (!current) return null;
            const plaintext = open(current);
            if (!plaintext) return null;
            const changed = { ...plaintext, ...args.update };
            if (timestamp(changed.expiresAt) <= Date.now()) fail();
            const sealed = seal(changed);
            // Bind the write to the row version read, so a competing consume/update wins safely.
            const updated = await target.update({
              ...args,
              where: [...where, { field: "id", value: current.id }, { field: "value", value: current.value }],
              update: { ...args.update, identifier: sealed.identifier, value: sealed.value, expiresAt: sealed.expiresAt },
            });
            return open(updated);
          }
          const result = await value.call(target, { ...args, where }, ...rest);
          if (property === "findMany") return result.map((row) => open(row)).filter(Boolean);
          if (["findOne", "consumeOne"].includes(property)) return open(result);
          return result;
        };
      },
    });
  }
  return (options) => {
    if (options.secondaryStorage || options.plugins?.length || options.experimental?.joins ||
        options.databaseHooks?.verification || options.verification?.storeIdentifier !== "plain" ||
        options.verification?.modelName !== "AuthVerification" ||
        options.verification?.fields?.identifier !== "identifierHash" ||
        options.verification?.fields?.value !== "valueEncrypted") fail();
    return wrap(factory(options));
  };
}
