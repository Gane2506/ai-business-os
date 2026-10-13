import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { betterAuth } from "better-auth/minimal";
import { memoryAdapter } from "better-auth/adapters/memory";
import { runWithTransaction } from "@better-auth/core/context";
import { protectedVerificationAdapter, ProtectedVerificationError } from "./protected-verification-adapter.mjs";

const keys = () => ({ identifierKey: randomBytes(32), encryptionKey: randomBytes(32) });
const identifier = () => "password-reset:" + randomBytes(24).toString("base64url");
const secretValue = () => JSON.stringify({ userId: randomUUID(), otp: randomBytes(12).toString("hex") });
const where = (value) => [{ field: "identifier", value }];
const row = (id = identifier(), value = secretValue()) => ({ id: randomUUID(), identifier: id, value, expiresAt: new Date(Date.now() + 60000), createdAt: new Date(), updatedAt: new Date() });
async function fixture(db = { user: [], account: [], session: [], AuthVerification: [] }, cryptoKeys = keys()) {
  const calls = [];
  const options = {
    baseURL: "http://127.0.0.1:4998", secret: randomBytes(48).toString("base64url"),
    database: protectedVerificationAdapter((config) => {
      const underlying = memoryAdapter(db)(config);
      const record = (adapter) => new Proxy(adapter, { get(target, method) {
        const fn = target[method];
        if (method === "transaction") return (cb) => fn.call(target, (tx) => cb(record(tx)));
        if (typeof fn !== "function") return fn;
        return (...args) => { calls.push(structuredClone({ method, args })); return fn.apply(target, args); };
      } });
      return record(underlying);
    }, cryptoKeys),
    verification: { modelName: "AuthVerification", fields: { identifier: "identifierHash", value: "valueEncrypted" }, storeIdentifier: "plain" },
    emailAndPassword: { enabled: true, disableSignUp: true },
    advanced: { database: { generateId: "uuid" }, disableOriginCheck: false, disableCSRFCheck: false },
    trustedOrigins: ["http://127.0.0.1:4998"], telemetry: { enabled: false }, logger: { disabled: true },
  };
  const auth = betterAuth(options), ctx = await auth.$context;
  return { db, calls, auth, ctx, adapter: ctx.adapter, options, cryptoKeys };
}
function assertProtected(f, raws) {
  for (const stored of f.db.AuthVerification) {
    assert.match(stored.identifierHash, /^vh1\.[0-9a-f]{64}$/);
    assert.match(stored.valueEncrypted, /^vg1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(Object.hasOwn(stored, "identifier"), false);
    assert.equal(Object.hasOwn(stored, "value"), false);
  }
  const storage = JSON.stringify([f.db, f.calls]);
  for (const raw of raws) assert.equal(storage.includes(raw), false, "Plain verification material crossed storage boundary");
}

test("pinned internal CRUD uses mapped HMAC identifiers and authenticated ciphertext", async () => {
  const f = await fixture(), data = row();
  const created = await f.ctx.internalAdapter.createVerificationValue(data);
  assert.equal(created.id, data.id); assert.equal(created.identifier, data.identifier); assert.equal(created.value, data.value);
  const found = await f.ctx.internalAdapter.findVerificationValue(data.identifier);
  assert.equal(found.value, data.value);
  const next = secretValue(), expiry = new Date(Date.now() + 120000), before = f.db.AuthVerification[0].valueEncrypted;
  const updated = await f.ctx.internalAdapter.updateVerificationByIdentifier(data.identifier, { value: next, expiresAt: expiry });
  assert.equal(updated.value, next); assert.equal(updated.expiresAt.getTime(), expiry.getTime());
  assert.notEqual(f.db.AuthVerification[0].valueEncrypted, before);
  assertProtected(f, [data.identifier, data.value, next]);
  await f.ctx.internalAdapter.deleteVerificationByIdentifier(data.identifier);
  assert.equal(await f.ctx.internalAdapter.findVerificationValue(data.identifier), null);
});

test("random nonces, independent keys and identity binding defeat copied or modified rows", async () => {
  const f = await fixture(), a = row(), b = row();
  await f.adapter.create({ model: "verification", data: a });
  await f.adapter.create({ model: "verification", data: { ...a, id: randomUUID() } });
  assert.equal(f.db.AuthVerification[0].identifierHash, f.db.AuthVerification[1].identifierHash);
  assert.notEqual(f.db.AuthVerification[0].valueEncrypted.split(".")[1], f.db.AuthVerification[1].valueEncrypted.split(".")[1]);
  await f.adapter.create({ model: "verification", data: b });
  const stored = f.db.AuthVerification[0], original = structuredClone(stored);
  const check = () => f.adapter.findOne({ model: "verification", where: [{ field: "id", value: a.id }] });
  for (const mutate of [
    () => { stored.valueEncrypted = "plaintext"; },
    () => { const p = stored.valueEncrypted.split("."); p[3] = (p[3][0] === "A" ? "B" : "A") + p[3].slice(1); stored.valueEncrypted = p.join("."); },
    () => { stored.expiresAt = new Date(stored.expiresAt.getTime() + 1); },
    () => { stored.createdAt = new Date(stored.createdAt.getTime() - 1); },
    () => { stored.identifierHash = f.db.AuthVerification[2].identifierHash; },
    () => { stored.valueEncrypted = f.db.AuthVerification[1].valueEncrypted; },
  ]) {
    Object.assign(stored, structuredClone(original)); mutate();
    await assert.rejects(check(), { name: "ProtectedVerificationError", message: "Protected verification operation rejected" });
  }
  Object.assign(stored, original);
  const wrongCipher = await fixture(f.db, { identifierKey: f.cryptoKeys.identifierKey, encryptionKey: randomBytes(32) });
  await assert.rejects(wrongCipher.adapter.findOne({ model: "verification", where: [{ field: "id", value: a.id }] }), ProtectedVerificationError);
  const wrongHmac = await fixture(f.db, { identifierKey: randomBytes(32), encryptionKey: f.cryptoKeys.encryptionKey });
  assert.equal(await wrongHmac.ctx.internalAdapter.findVerificationValue(a.identifier), null);
  await assert.rejects(wrongHmac.adapter.findOne({ model: "verification", where: [{ field: "id", value: a.id }] }), ProtectedVerificationError);
  assertProtected(f, [a.identifier, a.value, b.identifier, b.value]);
});

test("actual consumeVerificationValue is single use and invalidates stale duplicate rows", async () => {
  const f = await fixture(), first = row(), second = { ...row(first.identifier), createdAt: new Date(first.createdAt.getTime() + 1) };
  await f.ctx.internalAdapter.createVerificationValue(first);
  await f.ctx.internalAdapter.createVerificationValue(second);
  const results = await Promise.all(Array.from({ length: 12 }, () => f.ctx.internalAdapter.consumeVerificationValue(first.identifier)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(results.find(Boolean).value, second.value);
  assert.equal(await f.ctx.internalAdapter.consumeVerificationValue(first.identifier), null);
  assert.equal(f.db.AuthVerification.length, 0);
  assertProtected(f, [first.identifier, first.value, second.value]);
});

test("expiry is authenticated, unreadable after expiry, and cleaned through pinned find lifecycle", async () => {
  const f = await fixture(), data = row(); data.expiresAt = new Date(Date.now() + 100);
  await f.ctx.internalAdapter.createVerificationValue(data);
  await delay(130);
  assert.equal(await f.adapter.findOne({ model: "verification", where: where(data.identifier) }), null);
  assert.equal(await f.ctx.internalAdapter.consumeVerificationValue(data.identifier), null);
  assert.equal(await f.ctx.internalAdapter.findVerificationValue(data.identifier), null);
  assert.equal(f.db.AuthVerification.length, 0);
  await assert.rejects(f.ctx.internalAdapter.createVerificationValue(data), ProtectedVerificationError);
});

test("transaction context remains protected and rolls back creates and consumes", async () => {
  const f = await fixture(), data = row();
  await runWithTransaction(f.adapter, () => f.ctx.internalAdapter.createVerificationValue(data));
  await assert.rejects(runWithTransaction(f.adapter, async () => {
    const consumed = await f.ctx.internalAdapter.consumeVerificationValue(data.identifier);
    assert.equal(consumed.value, data.value);
    throw new Error("rollback consume");
  }), /rollback consume/);
  assert.equal((await f.ctx.internalAdapter.findVerificationValue(data.identifier)).value, data.value);
  const abandoned = row();
  await assert.rejects(f.adapter.transaction(async (tx) => {
    await tx.create({ model: "verification", data: abandoned });
    assert.equal((await tx.findOne({ model: "verification", where: where(abandoned.identifier) })).value, abandoned.value);
    throw new Error("rollback create");
  }), /rollback create/);
  assert.equal(await f.ctx.internalAdapter.findVerificationValue(abandoned.identifier), null);
  assertProtected(f, [data.identifier, data.value, abandoned.identifier, abandoned.value]);
});

test("unsupported predicates, aliases, projection, bulk updates and digest credentials fail closed", async () => {
  const f = await fixture(), data = row(); await f.ctx.internalAdapter.createVerificationValue(data);
  const stored = JSON.stringify(f.db);
  const bad = [
    ["findMany", { where: [] }],
    ["findOne", { where: where(f.db.AuthVerification[0].identifierHash) }],
    ["findOne", { where: [{ field: "identifier", value: data.identifier, operator: "contains" }] }],
    ["findOne", { where: [{ ...where(data.identifier)[0], connector: "OR" }] }],
    ["findOne", { where: [{ ...where(data.identifier)[0], mode: "insensitive" }] }],
    ["findOne", { where: where(data.identifier), select: ["value"] }],
    ["findOne", { where: where(data.identifier), join: { user: true } }],
    ["findMany", { where: where(data.identifier), sortBy: { field: "identifier", direction: "asc" } }],
    ["updateMany", { where: where(data.identifier), update: { value: secretValue() } }],
    ["update", { where: where(data.identifier), update: { id: randomUUID() } }],
    ["deleteMany", { where: [] }],
    ["findOne", { model: "AuthVerification", where: [{ field: "id", value: data.id }] }],
    ["findOne", { model: "user", where: [{ field: "id", value: randomUUID() }], join: { hidden: { verification: true } } }],
  ];
  for (const [method, args] of bad) await assert.rejects(f.adapter[method]({ model: "verification", ...args }), ProtectedVerificationError);
  assert.equal(JSON.stringify(f.db), stored);
});

test("identifier rotation, IN queries, count and transaction deletion retain contract", async () => {
  const f = await fixture(), a = row(), b = row();
  await f.ctx.internalAdapter.createVerificationValue(a); await f.ctx.internalAdapter.createVerificationValue(b);
  const next = identifier();
  await f.ctx.internalAdapter.updateVerificationByIdentifier(a.identifier, { identifier: next });
  assert.equal(await f.ctx.internalAdapter.findVerificationValue(a.identifier), null);
  assert.equal((await f.ctx.internalAdapter.findVerificationValue(next)).value, a.value);
  const query = [{ field: "identifier", operator: "in", value: [next, b.identifier] }];
  assert.equal((await f.adapter.findMany({ model: "verification", where: query })).length, 2);
  assert.equal(await f.adapter.count({ model: "verification", where: query }), 2);
  await f.adapter.transaction((tx) => tx.deleteMany({ model: "verification", where: query }));
  assert.equal(f.db.AuthVerification.length, 0);
  assertProtected(f, [a.identifier, b.identifier, next, a.value, b.value]);
});

test("configuration guards prevent alternate storage paths and key reuse; signup stays closed", async () => {
  const f = await fixture();
  const factory = protectedVerificationAdapter(() => ({}), keys());
  for (const changes of [{ secondaryStorage: {} }, { plugins: [{}] }, { experimental: { joins: true } }, { databaseHooks: { verification: {} } }, { verification: { ...f.options.verification, storeIdentifier: "hashed" } }, { verification: { modelName: "verification" } }])
    assert.throws(() => factory({ ...f.options, ...changes }), ProtectedVerificationError);
  const key = randomBytes(32);
  assert.throws(() => protectedVerificationAdapter(() => ({}), { identifierKey: key, encryptionKey: key }), ProtectedVerificationError);
  assert.throws(() => protectedVerificationAdapter(() => ({}), { identifierKey: randomBytes(16), encryptionKey: randomBytes(32) }), ProtectedVerificationError);
  await assert.rejects(f.ctx.internalAdapter.reserveVerificationValue(row()), ProtectedVerificationError);
  const response = await f.auth.handler(new Request("http://127.0.0.1:4998/api/auth/sign-up/email", {
    method: "POST", headers: { origin: "http://127.0.0.1:4998", "content-type": "application/json" },
    body: JSON.stringify({ name: "Closed", email: "closed@example.invalid", password: randomBytes(24).toString("base64url") }),
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "EMAIL_PASSWORD_SIGN_UP_DISABLED");
  assert.equal(f.db.user.length, 0);
});

test("serialized payload byte limits reject oversized escaped input before storing a row", async () => {
  const f = await fixture(), huge = row();
  huge.value = "\u0000".repeat(65536);
  await assert.rejects(f.ctx.internalAdapter.createVerificationValue(huge), ProtectedVerificationError);
  assert.equal(f.db.AuthVerification.length, 0);
  const valid = row(); valid.value = "界".repeat(65000);
  await f.ctx.internalAdapter.createVerificationValue(valid);
  assert.equal((await f.ctx.internalAdapter.findVerificationValue(valid.identifier)).value, valid.value);
  const invalidUnicode = row("\ud800");
  await assert.rejects(f.ctx.internalAdapter.createVerificationValue(invalidUnicode), ProtectedVerificationError);
});
