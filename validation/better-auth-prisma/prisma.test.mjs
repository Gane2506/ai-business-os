import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { betterAuth } from "better-auth/minimal";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { hashPassword } from "better-auth/crypto";
import { runWithTransaction } from "@better-auth/core/context";
import { hashedSessionAdapter, digestSessionToken, DISABLED_SESSION_ROUTES, UnsupportedSessionOperation } from "../better-auth-sessions/hashed-session-adapter.mjs";
import { sessionManagement } from "../better-auth-sessions/session-management.mjs";

assert.equal(process.env.AUTH_PRISMA_PROOF, "disposable", "Explicit disposable proof mode required");
const databaseURL = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(databaseURL.hostname));
assert.equal(databaseURL.pathname, "/auth_prisma_ci");
assert.ok(process.env.RINGEE_DATABASE_PACKAGE_FILE?.startsWith("/"));
const requireDatabase = createRequire(process.env.RINGEE_DATABASE_PACKAGE_FILE);
const { PrismaClient } = requireDatabase("@prisma/client");

const origin = "http://127.0.0.1:4999";
const token = () => randomBytes(24).toString("base64url");
const whereToken = (raw) => [{ field: "token", value: raw }];
function request(path, body, cookie, requestOrigin = origin) {
  return new Request(origin + "/api/auth/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: requestOrigin, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function fixture(t) {
  const queries = [];
  const prisma = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  prisma.$on("query", (event) => queries.push(event.params));
  const users = new Map();
  t.after(async () => {
    try { await prisma.user.deleteMany({ where: { id: { in: [...users.values()].map((u) => u.id) } } }); }
    finally { await prisma.$disconnect(); }
  });
  const factory = prismaAdapter(prisma, { provider: "postgresql", transaction: true });
  let underlying;
  const options = {
    baseURL: origin,
    secret: randomBytes(48).toString("base64url"),
    database: hashedSessionAdapter((configuration) => {
      underlying = factory(configuration);
      return underlying;
    }),
    user: { modelName: "User", fields: { name: "authName", email: "authEmail", emailVerified: "authEmailVerified", image: "imageUrl" } },
    session: { modelName: "AuthSession", fields: { token: "tokenHash" }, cookieCache: { enabled: false } },
    account: { modelName: "AuthAccount", fields: { password: "passwordHash", accessToken: "accessTokenEncrypted", refreshToken: "refreshTokenEncrypted", idToken: "idTokenEncrypted" } },
    verification: { modelName: "AuthVerification", fields: { identifier: "identifierHash", value: "valueEncrypted" } },
    advanced: { database: { generateId: "uuid" }, disableOriginCheck: false, disableCSRFCheck: false },
    emailAndPassword: { enabled: true, disableSignUp: true },
    disabledPaths: DISABLED_SESSION_ROUTES,
    trustedOrigins: [origin], telemetry: { enabled: false }, logger: { disabled: true },
  };
  const auth = betterAuth(options);
  const ctx = await auth.$context;
  for (const name of ["alice", "bob"]) {
    const id = randomUUID(), email = name + "-" + id + "@example.invalid", password = token();
    users.set(name, { id, email, password });
    await prisma.user.create({ data: { id, clerkId: "fixture-" + id, authName: name, authEmail: email, authEmailVerified: true } });
    await prisma.userEmail.create({ data: { userId: id, email, isPrimary: true, status: "verified" } });
    await prisma.authAccount.create({ data: { id: randomUUID(), userId: id, accountId: id, providerId: "credential", passwordHash: await hashPassword(password) } });
  }
  async function signIn(name) {
    const user = users.get(name);
    const response = await auth.handler(request("sign-in/email", { email: user.email, password: user.password }));
    assert.equal(response.status, 200);
    const data = await response.json();
    const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    assert.ok(cookie);
    assert.equal(data.user.id, user.id);
    return { token: data.token, cookie, headers: new Headers({ cookie, origin }), userId: user.id };
  }
  async function assertProtected(rawTokens) {
    const rows = await prisma.authSession.findMany({ where: { userId: { in: [...users.values()].map((u) => u.id) } } });
    for (const row of rows) {
      assert.match(row.tokenHash, /^h1\.[0-9a-f]{64}$/);
      assert.equal(Object.hasOwn(row, "token"), false);
    }
    for (const raw of rawTokens) {
      assert.equal(JSON.stringify(rows).includes(raw), false);
      assert.equal(JSON.stringify(queries).includes(raw), false, "Raw bearer reached PostgreSQL query parameters");
    }
    return rows;
  }
  return { prisma, auth, ctx, adapter: ctx.adapter, underlying, options, users, signIn, assertProtected, management: sessionManagement(auth, underlying, origin) };
}

test("real Prisma session login preserves seeded UUIDs, verified aliases and closed signup", async (t) => {
  const f = await fixture(t), a = await f.signIn("alice");
  const session = await f.auth.api.getSession({ headers: a.headers });
  assert.equal(session.user.id, a.userId);
  assert.equal(session.session.token, a.token);
  const rows = await f.assertProtected([a.token]);
  assert.equal(rows[0].tokenHash, digestSessionToken(a.token));
  assert.equal((await f.prisma.userEmail.findFirst({ where: { userId: a.userId } })).status, "verified");
  const wrong = await f.auth.handler(request("sign-in/email", { email: f.users.get("alice").email, password: token() }));
  assert.equal(wrong.status, 401);
  const signup = await f.auth.handler(request("sign-up/email", { name: "Closed", email: "closed@example.invalid", password: token() }));
  assert.equal(signup.status, 400);
  assert.equal((await signup.json()).code, "EMAIL_PASSWORD_SIGN_UP_DISABLED");
  const foreign = await f.auth.handler(request("sign-out", {}, a.cookie, "https://foreign.example.invalid"));
  assert.equal(foreign.status, 403);
  assert.equal(await f.auth.api.getSession({ headers: new Headers({ cookie: a.cookie + "broken" }) }), null);
  assert.equal((await f.auth.handler(request("sign-out", {}, a.cookie))).status, 200);
  assert.equal(await f.auth.api.getSession({ headers: a.headers }), null);
  assert.equal(await f.prisma.authSession.count({ where: { userId: a.userId } }), 0);
});

test("physical PostgreSQL digest cannot authenticate even inside a correctly signed cookie", async (t) => {
  const f = await fixture(t), a = await f.signIn("alice");
  const rows = await f.assertProtected([a.token]), digest = rows[0].tokenHash;
  const cookieName = a.cookie.split("=")[0];
  const signed = (value) => cookieName + "=" + encodeURIComponent(value + "." + createHmac("sha256", f.options.secret).update(value).digest("base64"));
  assert.equal((await f.auth.api.getSession({ headers: new Headers({ cookie: signed(a.token) }) })).user.id, a.userId);
  const response = await f.auth.handler(request("get-session", undefined, signed(digest)));
  const body = await response.json();
  assert.ok(response.status >= 400 || body === null);
  assert.ok(!body?.user && !body?.session);
  await assert.rejects(f.ctx.internalAdapter.findSession(digest), UnsupportedSessionOperation);
  assert.equal(await f.auth.api.getSession({ headers: new Headers({ authorization: "Bearer " + digest }) }), null);
  assert.equal(await f.prisma.authSession.count({ where: { userId: a.userId } }), 1);
});

test("Prisma transactions protect token writes and roll back user, account and session together", async (t) => {
  const f = await fixture(t), a = await f.signIn("alice");
  const created = await runWithTransaction(f.adapter, () => f.ctx.internalAdapter.createSession(a.userId));
  assert.ok(created.token);
  await f.assertProtected([a.token, created.token]);
  const abandonedUserId = randomUUID(), abandonedRaw = token(), now = new Date();
  await assert.rejects(f.adapter.transaction(async (tx) => {
    await tx.create({ model: "user", forceAllowId: true, data: { id: abandonedUserId, name: "Rollback", email: abandonedUserId + "@example.invalid", emailVerified: true, createdAt: now, updatedAt: now } });
    await tx.create({ model: "account", forceAllowId: true, data: { id: randomUUID(), userId: abandonedUserId, accountId: abandonedUserId, providerId: "credential", password: await hashPassword(token()), createdAt: now, updatedAt: now } });
    const row = await tx.create({ model: "session", forceAllowId: true, data: { id: randomUUID(), userId: abandonedUserId, token: abandonedRaw, expiresAt: new Date(Date.now() + 3600000), createdAt: now, updatedAt: now } });
    assert.equal(row.token, abandonedRaw);
    assert.equal((await tx.findOne({ model: "session", where: whereToken(abandonedRaw) })).token, abandonedRaw);
    throw new Error("rollback fixture");
  }), /rollback fixture/);
  assert.equal(await f.prisma.user.findUnique({ where: { id: abandonedUserId } }), null);
  assert.equal(await f.prisma.authAccount.count({ where: { userId: abandonedUserId } }), 0);
  assert.equal(await f.prisma.authSession.count({ where: { userId: abandonedUserId } }), 0);
  assert.equal(await f.ctx.internalAdapter.findSession(abandonedRaw), null);
  await f.assertProtected([a.token, created.token, abandonedRaw]);
});

test("rotation and expiry use the mapped digest field in the generated Prisma client", async (t) => {
  const f = await fixture(t), a = await f.signIn("alice"), next = token();
  const before = await f.ctx.internalAdapter.findSession(a.token);
  const changed = await f.ctx.internalAdapter.updateSession(a.token, { token: next });
  assert.equal(changed.token, next);
  assert.equal(await f.ctx.internalAdapter.findSession(a.token), null);
  assert.equal((await f.ctx.internalAdapter.findSession(next)).session.id, before.session.id);
  await f.assertProtected([a.token, next]);
  await f.prisma.authSession.update({ where: { id: before.session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const cookieName = a.cookie.split("=")[0];
  const cookie = cookieName + "=" + encodeURIComponent(next + "." + createHmac("sha256", f.options.secret).update(next).digest("base64"));
  assert.equal(await f.auth.api.getSession({ headers: new Headers({ cookie, origin }) }), null);
  assert.equal(await f.prisma.authSession.count({ where: { id: before.session.id } }), 0);
});

test("UUID revocation is user scoped and is immediately visible to a second auth instance", async (t) => {
  const f = await fixture(t), a = await f.signIn("alice"), other = await f.signIn("alice"), b = await f.signIn("bob");
  const secondAuth = betterAuth(f.options);
  assert.equal((await secondAuth.api.getSession({ headers: a.headers })).user.id, a.userId);
  const sessions = await f.management.list(a.headers);
  assert.equal(sessions.length, 2);
  assert.ok(sessions.every((row) => !Object.hasOwn(row, "token") && !Object.hasOwn(row, "tokenHash")));
  const bobId = (await f.auth.api.getSession({ headers: b.headers })).session.id;
  await assert.rejects(f.management.revoke(a.headers, bobId), /Session unavailable/);
  await assert.rejects(f.management.revokeAll(new Headers({ cookie: a.cookie })), /Untrusted origin/);
  await assert.rejects(f.management.revokeAll(new Headers({ cookie: a.cookie, origin: "https://foreign.example.invalid" })), /Untrusted origin/);
  assert.equal(await f.management.revokeOthers(a.headers), 1);
  assert.equal(await f.auth.api.getSession({ headers: other.headers }), null);
  assert.equal((await secondAuth.api.getSession({ headers: a.headers })).user.id, a.userId);
  assert.equal(await f.management.revokeAll(a.headers), 1);
  assert.equal(await secondAuth.api.getSession({ headers: a.headers }), null);
  assert.equal((await f.auth.api.getSession({ headers: b.headers })).user.id, b.userId);
  await f.assertProtected([a.token, other.token, b.token]);
});
