import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { runWithTransaction } from "@better-auth/core/context";
import { betterAuth } from "better-auth/minimal";
import { memoryAdapter } from "better-auth/adapters/memory";
import { hashPassword } from "better-auth/crypto";
import { wrapSessionAdapter, hashedSessionAdapter, digestSessionToken, DISABLED_SESSION_ROUTES, UnsupportedSessionOperation } from "./hashed-session-adapter.mjs";
import { sessionManagement } from "./session-management.mjs";

const origin = "http://127.0.0.1:4999";
const token = () => randomBytes(24).toString("base64url");
const eq = (field, value) => ({ field, value });
const sessionWhere = (raw) => [eq("token", raw)];
function request(path, body, cookie, originHeader = origin) {
  return new Request(origin + "/api/auth/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: originHeader, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function fixture() {
  const db = { user: [], account: [], AuthSession: [], verification: [] };
  let underlying;
  const options = {
    baseURL: origin, secret: randomBytes(48).toString("base64url"),
    database: hashedSessionAdapter((configuration) => {
      underlying = memoryAdapter(db)(configuration);
      return underlying;
    }),
    session: { modelName: "AuthSession", fields: { token: "tokenHash" }, cookieCache: { enabled: false } },
    advanced: { database: { generateId: "uuid" }, disableOriginCheck: false, disableCSRFCheck: false },
    emailAndPassword: { enabled: true, disableSignUp: true },
    disabledPaths: DISABLED_SESSION_ROUTES,
    trustedOrigins: [origin], telemetry: { enabled: false }, logger: { disabled: true },
  };
  const auth = betterAuth(options);
  const ctx = await auth.$context;
  const passwords = new Map();
  for (const name of ["alice", "bob"]) {
    const userId = randomUUID();
    const password = token();
    passwords.set(name, password);
    const now = new Date();
    db.user.push({ id: userId, name, email: name + "@example.invalid", emailVerified: true, createdAt: now, updatedAt: now });
    db.account.push({ id: randomUUID(), userId, accountId: userId, providerId: "credential", password: await hashPassword(password), createdAt: now, updatedAt: now });
  }
  async function signIn(name) {
    const response = await auth.handler(request("sign-in/email", { email: name + "@example.invalid", password: passwords.get(name) }));
    assert.equal(response.status, 200);
    const data = await response.json();
    const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    assert.ok(cookie);
    return { token: data.token, cookie, headers: new Headers({ cookie, origin }), userId: data.user.id };
  }
  return { db, auth, ctx, underlying, adapter: ctx.adapter, management: sessionManagement(auth, underlying, origin), secret: options.secret, signIn };
}
function storedOnlyHashes(db, knownTokens) {
  for (const row of db.AuthSession) {
    assert.match(row.tokenHash, /^h1\.[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(row, "token"), false);
  }
  const serialized = JSON.stringify(db);
  for (const raw of knownTokens) assert.equal(serialized.includes(raw), false);
}

test("real Better Auth signed-cookie lifecycle stores only hashes and preserves UUIDs", async () => {
  const f = await fixture();
  const alice = await f.signIn("alice");
  const current = await f.auth.api.getSession({ headers: alice.headers });
  assert.equal(current.user.id, alice.userId);
  assert.equal(current.session.token, alice.token);
  assert.match(current.session.id, /^[a-f0-9-]{36}$/);
  storedOnlyHashes(f.db, [alice.token]);
  assert.equal(f.db.AuthSession[0].tokenHash, digestSessionToken(alice.token));
  assert.equal(await f.ctx.internalAdapter.findSession(token()), null);
  await assert.rejects(f.ctx.internalAdapter.findSession(f.db.AuthSession[0].tokenHash), UnsupportedSessionOperation);
  const wrong = await f.auth.handler(request("sign-in/email", { email: "alice@example.invalid", password: token() }));
  assert.equal(wrong.status, 401);
  const foreign = await f.auth.handler(request("sign-out", {}, alice.cookie, "https://foreign.example.invalid"));
  assert.equal(foreign.status, 403);
  const tampered = new Headers({ cookie: alice.cookie + "broken" });
  assert.equal(await f.auth.api.getSession({ headers: tampered }), null);
  const signup = await f.auth.handler(request("sign-up/email", { name: "Closed", email: "closed@example.invalid", password: token() }));
  assert.equal(signup.status, 400);
  assert.equal((await signup.json()).code, "EMAIL_PASSWORD_SIGN_UP_DISABLED");
  assert.equal(f.db.user.length, 2);
  const signedOut = await f.auth.handler(request("sign-out", {}, alice.cookie));
  assert.equal(signedOut.status, 200);
  assert.equal(await f.auth.api.getSession({ headers: alice.headers }), null);
  assert.equal(f.db.AuthSession.length, 0);
});

test("rotation, expiry, token-constrained batch lookup and deletion preserve digest semantics", async () => {
  const f = await fixture();
  const first = await f.signIn("alice");
  const second = await f.signIn("alice");
  const next = token();
  const updated = await f.ctx.internalAdapter.updateSession(first.token, { token: next });
  assert.equal(updated.token, next);
  assert.equal(await f.ctx.internalAdapter.findSession(first.token), null);
  assert.equal((await f.ctx.internalAdapter.findSession(next)).session.token, next);
  storedOnlyHashes(f.db, [first.token, second.token, next]);
  const rows = await f.adapter.findMany({ model: "session", where: [{ field: "token", value: [next, second.token], operator: "in" }] });
  assert.deepEqual(new Set(rows.map((row) => row.token)), new Set([next, second.token]));
  await f.ctx.internalAdapter.updateSession(second.token, { expiresAt: new Date(Date.now() - 1000) });
  assert.equal(await f.auth.api.getSession({ headers: second.headers }), null);
  await f.adapter.deleteMany({ model: "session", where: sessionWhere(next) });
  assert.equal(await f.ctx.internalAdapter.findSession(next), null);
});

test("explicit management lists safe IDs and scopes revocation to the authenticated user", async () => {
  const f = await fixture();
  const a1 = await f.signIn("alice");
  const a2 = await f.signIn("alice");
  const b1 = await f.signIn("bob");
  const b2 = await f.signIn("bob");
  const bob = await f.auth.api.getSession({ headers: b1.headers });
  const listed = await f.management.list(a1.headers);
  assert.equal(listed.length, 2);
  assert.equal(listed.filter((row) => row.current).length, 1);
  assert.equal(JSON.stringify(listed).includes("h1."), false);
  assert.equal(JSON.stringify(listed).includes(a1.token), false);
  assert.deepEqual(Object.keys(listed[0]).sort(), ["createdAt", "current", "expiresAt", "id"]);
  await assert.rejects(f.management.revoke(a1.headers, bob.session.id), /Session unavailable/);
  const foreign = new Headers(a1.headers);
  foreign.set("origin", "https://foreign.example.invalid");
  await assert.rejects(f.management.revokeOthers(foreign), /Untrusted origin/);
  const missingOrigin = new Headers(a1.headers);
  missingOrigin.delete("origin");
  await assert.rejects(f.management.revokeAll(missingOrigin), /Untrusted origin/);
  assert.equal((await f.management.list(a1.headers)).length, 2);
  assert.ok(await f.auth.api.getSession({ headers: b1.headers }));
  assert.equal(await f.management.revokeOthers(a1.headers), 1);
  assert.ok(await f.auth.api.getSession({ headers: a1.headers }));
  assert.equal(await f.auth.api.getSession({ headers: a2.headers }), null);
  assert.ok(await f.auth.api.getSession({ headers: b2.headers }));
  const aCurrent = await f.auth.api.getSession({ headers: a1.headers });
  assert.equal(await f.management.revoke(a1.headers, aCurrent.session.id), 1);
  assert.equal(await f.auth.api.getSession({ headers: a1.headers }), null);
  await assert.rejects(f.management.list(a1.headers), /Unauthenticated/);
  assert.equal(await f.management.revokeAll(b1.headers), 2);
  assert.equal(await f.auth.api.getSession({ headers: b2.headers }), null);
  assert.equal(f.db.AuthSession.length, 0);
});

test("unsupported built-in management routes and broad adapter operations fail closed", async () => {
  const f = await fixture();
  const a = await f.signIn("alice");
  const before = JSON.stringify(f.db.AuthSession);
  for (const path of DISABLED_SESSION_ROUTES) {
    const response = await f.auth.handler(request(path.slice(1), path === "/list-sessions" ? undefined : {}, a.cookie));
    assert.equal(response.status, 404, path);
  }
  await assert.rejects(f.adapter.findMany({ model: "session", where: [eq("userId", a.userId)] }), UnsupportedSessionOperation);
  await assert.rejects(f.adapter.deleteMany({ model: "session", where: [eq("userId", a.userId)] }), UnsupportedSessionOperation);
  await assert.rejects(f.adapter.updateMany({ model: "session", where: sessionWhere(a.token), update: { token: token() } }), UnsupportedSessionOperation);
  await assert.rejects(f.adapter.findOne({ model: "session", where: [{ field: "token", value: a.token, operator: "contains" }] }), UnsupportedSessionOperation);
  await assert.rejects(f.adapter.findOne({ model: "session", where: [...sessionWhere(a.token), { field: "userId", value: a.userId, connector: "OR" }] }), UnsupportedSessionOperation);
  await assert.rejects(f.adapter.findOne({ model: "user", where: [eq("id", a.userId)], join: { session: true } }), UnsupportedSessionOperation);
  await assert.rejects(f.adapter.findOne({ model: "session", where: [{ field: "token", value: a.token, connector: "UNRECOGNIZED" }] }), UnsupportedSessionOperation);
  await assert.rejects(f.adapter.findOne({ model: "user", where: [eq("id", a.userId)], join: { aliased: { session: true } } }), UnsupportedSessionOperation);
  await assert.rejects(f.adapter.update({ model: "session", where: sessionWhere(a.token), update: { token: f.db.AuthSession[0].tokenHash } }), UnsupportedSessionOperation);
  await assert.rejects(f.auth.api.revokeOtherSessions({ headers: a.headers }), UnsupportedSessionOperation);
  assert.equal(JSON.stringify(f.db.AuthSession), before);
});

test("transaction-scoped adapters hash writes, restore request tokens and roll back", async () => {
  const f = await fixture();
  const userId = f.db.user[0].id;
  const raw = token();
  const row = { id: randomUUID(), userId, token: raw, expiresAt: new Date(Date.now() + 3600000), createdAt: new Date(), updatedAt: new Date() };
  const created = await f.adapter.transaction(async (tx) => {
    const result = await tx.create({ model: "session", data: row, forceAllowId: true });
    assert.equal(result.token, raw);
    assert.equal((await tx.findOne({ model: "session", where: sessionWhere(raw) })).token, raw);
    await assert.rejects(tx.findOne({ model: "session", where: sessionWhere(digestSessionToken(raw)) }), UnsupportedSessionOperation);
    return result;
  });
  assert.equal(created.id, row.id);
  storedOnlyHashes(f.db, [raw]);
  const abandoned = token();
  await assert.rejects(f.adapter.transaction(async (tx) => {
    await tx.create({ model: "session", data: { ...row, id: randomUUID(), token: abandoned }, forceAllowId: true });
    throw new Error("rollback fixture");
  }), /rollback fixture/);
  assert.equal(f.db.AuthSession.length, 1);
  assert.equal(await f.ctx.internalAdapter.findSession(abandoned), null);
  await f.adapter.transaction((tx) => tx.delete({ model: "session", where: sessionWhere(raw) }));
  assert.equal(f.db.AuthSession.length, 0);
});

test("configuration rejects raw-token caches, plugins, session hooks and enabled token-list routes", () => {
  const factory = hashedSessionAdapter(() => ({}));
  const minimal = { disabledPaths: DISABLED_SESSION_ROUTES };
  for (const options of [{}, { ...minimal, experimental: { joins: true } }, { ...minimal, secondaryStorage: {} }, { ...minimal, session: { cookieCache: { enabled: true } } }, { ...minimal, plugins: [{}] }, { ...minimal, databaseHooks: { session: {} } }]) {
    assert.throws(() => factory(options), UnsupportedSessionOperation);
  }
  assert.doesNotThrow(() => factory(minimal));
});

test("concurrent lookups never exchange request-local raw tokens", async () => {
  const f = await fixture();
  const a = await f.signIn("alice");
  const b = await f.signIn("bob");
  const requests = Array.from({ length: 30 }, (_, index) => index % 2 ? a : b);
  const results = await Promise.all(requests.map((item) => f.ctx.internalAdapter.findSession(item.token)));
  results.forEach((result, index) => {
    assert.equal(result.session.token, requests[index].token);
    assert.equal(result.user.id, requests[index].userId);
  });
  storedOnlyHashes(f.db, [a.token, b.token]);
});

test("Better Auth context uses the wrapped transaction adapter and rolls back", async () => {
  const f = await fixture();
  const userId = f.db.user[0].id;
  const created = await runWithTransaction(f.adapter, () => f.ctx.internalAdapter.createSession(userId));
  assert.ok(created.token);
  storedOnlyHashes(f.db, [created.token]);
  assert.equal((await f.ctx.internalAdapter.findSession(created.token)).session.id, created.id);
  let abandoned;
  await assert.rejects(runWithTransaction(f.adapter, async () => {
    abandoned = await f.ctx.internalAdapter.createSession(userId);
    throw new Error("context rollback");
  }), /context rollback/);
  assert.equal(f.db.AuthSession.length, 1);
  assert.equal(await f.ctx.internalAdapter.findSession(abandoned.token), null);
});

test("a database digest is never a bearer, including a correctly signed cookie", async () => {
  const f = await fixture();
  const alice = await f.signIn("alice");
  const digest = f.db.AuthSession[0].tokenHash;
  const cookieName = alice.cookie.split("=")[0];
  const signedCookie = (value) => cookieName + "=" + encodeURIComponent(value + "." +
    createHmac("sha256", f.secret).update(value).digest("base64"));
  // Establish the synthetic cookie uses the real signing format first.
  const good = await f.auth.api.getSession({ headers: new Headers({ cookie: signedCookie(alice.token) }) });
  assert.equal(good.user.id, alice.userId);
  const response = await f.auth.handler(request("get-session", undefined, signedCookie(digest)));
  const body = await response.json();
  assert.ok(response.status >= 400 || body === null);
  assert.ok(!body?.user && !body?.session);
  const bearerOnly = new Headers({ authorization: "Bearer " + digest, origin });
  assert.equal(await f.auth.api.getSession({ headers: bearerOnly }), null);
  await assert.rejects(f.management.list(bearerOnly), /Unauthenticated/);
  await assert.rejects(f.ctx.internalAdapter.findSession(digest), UnsupportedSessionOperation);
  assert.equal(f.db.AuthSession.length, 1);
  storedOnlyHashes(f.db, [alice.token]);
});
