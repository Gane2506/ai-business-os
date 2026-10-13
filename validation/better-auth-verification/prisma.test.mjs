import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { betterAuth } from "better-auth/minimal";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { runWithTransaction } from "@better-auth/core/context";
import { protectedVerificationAdapter, ProtectedVerificationError } from "./protected-verification-adapter.mjs";

assert.equal(process.env.AUTH_PRISMA_PROOF, "disposable");
const databaseURL = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(databaseURL.hostname));
assert.equal(databaseURL.pathname, "/auth_prisma_ci");
assert.ok(process.env.RINGEE_DATABASE_PACKAGE_FILE?.startsWith("/"));
const { PrismaClient } = createRequire(process.env.RINGEE_DATABASE_PACKAGE_FILE)("@prisma/client");
const data = (identifier = "password-reset:" + randomBytes(24).toString("base64url")) => ({
  id: randomUUID(), identifier, value: JSON.stringify({ userId: randomUUID(), otp: randomBytes(16).toString("hex") }),
  expiresAt: new Date(Date.now() + 60000), createdAt: new Date(), updatedAt: new Date(),
});
const where = (identifier) => [{ field: "identifier", value: identifier }];
async function fixture(t) {
  const queries = [], ids = [];
  const prisma = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  prisma.$on("query", (event) => queries.push(event.params));
  t.after(async () => {
    try { await prisma.authVerification.deleteMany({ where: { id: { in: ids } } }); }
    finally { await prisma.$disconnect(); }
  });
  const cryptoKeys = { identifierKey: randomBytes(32), encryptionKey: randomBytes(32) };
  const makeAuth = () => betterAuth({
    baseURL: "http://127.0.0.1:4998", secret: randomBytes(48).toString("base64url"),
    database: protectedVerificationAdapter(prismaAdapter(prisma, { provider: "postgresql", transaction: true }), cryptoKeys),
    user: { modelName: "User", fields: { name: "authName", email: "authEmail", emailVerified: "authEmailVerified", image: "imageUrl" } },
    session: { modelName: "AuthSession", fields: { token: "tokenHash" }, cookieCache: { enabled: false } },
    account: { modelName: "AuthAccount", fields: { password: "passwordHash", accessToken: "accessTokenEncrypted", refreshToken: "refreshTokenEncrypted", idToken: "idTokenEncrypted" } },
    verification: { modelName: "AuthVerification", fields: { identifier: "identifierHash", value: "valueEncrypted" }, storeIdentifier: "plain" },
    advanced: { database: { generateId: "uuid" }, disableOriginCheck: false, disableCSRFCheck: false },
    emailAndPassword: { enabled: true, disableSignUp: true },
    telemetry: { enabled: false }, logger: { disabled: true },
  });
  // Two auth contexts have independent local consume locks. PostgreSQL must be the race gate.
  const ctx = await makeAuth().$context, other = await makeAuth().$context;
  async function create(item) { ids.push(item.id); return ctx.internalAdapter.createVerificationValue(item); }
  async function assertProtected(raws) {
    const rows = await prisma.authVerification.findMany({ where: { id: { in: ids } } });
    for (const row of rows) {
      assert.match(row.identifierHash, /^vh1\.[0-9a-f]{64}$/);
      assert.match(row.valueEncrypted, /^vg1\./);
      assert.equal(Object.hasOwn(row, "identifier"), false);
      assert.equal(Object.hasOwn(row, "value"), false);
    }
    const storage = JSON.stringify([rows, queries]);
    for (const raw of raws) assert.equal(storage.includes(raw), false, "Plain verification material reached PostgreSQL");
    return rows;
  }
  return { prisma, ctx, other, queries, ids, create, assertProtected };
}

test("real generated Prisma client protects verification CRUD, rotation, count and expiry binding", async (t) => {
  const f = await fixture(t), a = data(), b = data(a.identifier);
  assert.equal((await f.create(a)).value, a.value);
  await f.create(b);
  let rows = await f.assertProtected([a.identifier, a.value, b.value]);
  assert.equal(rows[0].identifierHash, rows[1].identifierHash);
  assert.notEqual(rows[0].valueEncrypted.split(".")[1], rows[1].valueEncrypted.split(".")[1]);
  assert.equal(await f.ctx.adapter.count({ model: "verification", where: where(a.identifier) }), 2);
  const updatedValue = data().value;
  const updated = await f.ctx.adapter.update({ model: "verification", where: [{ field: "id", value: a.id }], update: { value: updatedValue, expiresAt: new Date(Date.now() + 120000) } });
  assert.equal(updated.value, updatedValue);
  const nextIdentifier = data().identifier;
  await f.ctx.adapter.update({ model: "verification", where: [{ field: "id", value: a.id }], update: { identifier: nextIdentifier } });
  assert.equal((await f.ctx.internalAdapter.findVerificationValue(nextIdentifier)).value, updatedValue);
  rows = await f.assertProtected([a.identifier, a.value, b.value, updatedValue, nextIdentifier]);
  const stored = rows.find((r) => r.id === a.id);
  await f.prisma.authVerification.update({ where: { id: a.id }, data: { expiresAt: new Date(stored.expiresAt.getTime() + 1) } });
  await assert.rejects(f.ctx.internalAdapter.findVerificationValue(nextIdentifier), ProtectedVerificationError);
  await f.prisma.authVerification.update({ where: { id: a.id }, data: { expiresAt: stored.expiresAt } });
  await f.ctx.internalAdapter.deleteVerificationByIdentifier(nextIdentifier);
  assert.equal(await f.ctx.internalAdapter.findVerificationValue(nextIdentifier), null);
  await f.ctx.adapter.deleteMany({ model: "verification", where: where(b.identifier) });
  assert.equal((await f.assertProtected([a.identifier, a.value, b.value, updatedValue, nextIdentifier])).length, 0);
});

test("two independent auth contexts atomically consume once and invalidate stale duplicates", async (t) => {
  const f = await fixture(t), a = data();
  const newer = { ...data(a.identifier), createdAt: new Date(a.createdAt.getTime() + 10) };
  await f.create(a); await f.create(newer);
  const results = await Promise.all(Array.from({ length: 16 }, (_, index) =>
    (index % 2 ? f.ctx : f.other).internalAdapter.consumeVerificationValue(a.identifier)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(results.find(Boolean).value, newer.value);
  assert.equal(await f.other.internalAdapter.consumeVerificationValue(a.identifier), null);
  assert.equal(await f.ctx.internalAdapter.findVerificationValue(a.identifier), null);
  assert.equal((await f.assertProtected([a.identifier, a.value, newer.value])).length, 0);
});

test("real PostgreSQL transactions roll back both protected writes and single-use consumption", async (t) => {
  const f = await fixture(t), a = data(), abandoned = data(); await f.create(a); f.ids.push(abandoned.id);
  await assert.rejects(runWithTransaction(f.ctx.adapter, async () => {
    await f.ctx.internalAdapter.createVerificationValue(abandoned);
    assert.equal((await f.ctx.internalAdapter.findVerificationValue(abandoned.identifier)).value, abandoned.value);
    throw new Error("rollback protected insert");
  }), /rollback protected insert/);
  assert.equal(await f.prisma.authVerification.findUnique({ where: { id: abandoned.id } }), null);
  await assert.rejects(runWithTransaction(f.ctx.adapter, async () => {
    assert.equal((await f.ctx.internalAdapter.consumeVerificationValue(a.identifier)).value, a.value);
    throw new Error("rollback protected consume");
  }), /rollback protected consume/);
  assert.equal((await f.ctx.internalAdapter.findVerificationValue(a.identifier)).value, a.value);
  await f.assertProtected([a.identifier, a.value, abandoned.identifier, abandoned.value]);
});

test("expired verification cleanup uses mapped expiry and a stored digest never becomes a credential", async (t) => {
  const f = await fixture(t), a = data();
  a.expiresAt = new Date(Date.now() + 250);
  await f.create(a);
  const stored = (await f.assertProtected([a.identifier, a.value]))[0];
  await assert.rejects(f.ctx.internalAdapter.findVerificationValue(stored.identifierHash), ProtectedVerificationError);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(await f.ctx.internalAdapter.findVerificationValue(a.identifier), null);
  assert.equal(await f.ctx.internalAdapter.consumeVerificationValue(a.identifier), null);
  assert.equal(await f.prisma.authVerification.findUnique({ where: { id: a.id } }), null);
});

test("conditional encrypted updates cannot resurrect a concurrently consumed record", async (t) => {
  const f = await fixture(t), a = data(); await f.create(a);
  const next = data().value;
  const result = await Promise.allSettled([
    f.ctx.adapter.update({ model: "verification", where: where(a.identifier), update: { value: next } }),
    f.other.internalAdapter.consumeVerificationValue(a.identifier),
  ]);
  // Prisma reports a missing conditional-update match as P2025; either null or that conflict is safe.
  if (result[0].status === "rejected") assert.equal(result[0].reason.code, "P2025");
  assert.equal(result[1].status, "fulfilled");
  assert.ok(result[1].value);
  assert.ok([a.value, next].includes(result[1].value.value));
  assert.equal(await f.ctx.internalAdapter.consumeVerificationValue(a.identifier), null);
  assert.equal(await f.prisma.authVerification.findUnique({ where: { id: a.id } }), null);
  await f.assertProtected([a.identifier, a.value, next]);
});
