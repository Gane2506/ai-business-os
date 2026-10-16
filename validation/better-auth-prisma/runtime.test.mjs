import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";

assert.equal(process.env.AUTH_PRISMA_PROOF, "disposable");
const databaseURL = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(databaseURL.hostname));
assert.equal(databaseURL.pathname, "/auth_prisma_ci");
assert.ok(process.env.RINGEE_DATABASE_PACKAGE_FILE?.startsWith("/"));
const root = resolve(
  dirname(process.env.RINGEE_DATABASE_PACKAGE_FILE),
  "../..",
);
const requireDatabase = createRequire(process.env.RINGEE_DATABASE_PACKAGE_FILE);
const { PrismaClient } = requireDatabase("@prisma/client");
const emitted = resolve(root, "apps/backend/dist");
const requireApplication = createRequire(
  resolve(root, "apps/backend/package.json"),
);
const { AuthSessionRepository } = requireApplication(
  resolve(
    emitted,
    "packages/database/src/database/repositories/auth-session.repository.js",
  ),
);
const { AuthPrincipalService } = requireApplication(
  resolve(emitted, "packages/services/src/services/auth-principal.service.js"),
);
const { createRuntime } = await import(
  pathToFileURL(
    resolve(emitted, "packages/platform/src/auth/better-auth/runtime.mjs"),
  )
);
const baseURL = "https://calls-api.connectxmedia.com";
const appOrigin = "https://calls.connectxmedia.com";
function request(path, body, cookie, origin = appOrigin) {
  return new Request(baseURL + "/api/auth/" + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
async function fixture(t) {
  const prisma = new PrismaClient();
  const id = randomUUID(),
    email = id + "@example.invalid",
    password = randomBytes(32).toString("base64url");
  const organizations = [];
  t.after(async () => {
    try {
      await prisma.organization.deleteMany({
        where: { id: { in: organizations } },
      });
      await prisma.user.deleteMany({ where: { id } });
    } finally {
      await prisma.$disconnect();
    }
  });
  await prisma.user.create({
    data: {
      id,
      authName: "Fixture",
      authEmail: email,
      authEmailVerified: true,
      encryptionKey: randomBytes(32).toString("hex"),
      phoneNumber: "+1416" + String(Date.now()).slice(-7),
      phoneRequired: true,
      phoneVerified: true,
      emails: { create: { email, isPrimary: true, status: "verified" } },
    },
  });
  await prisma.authAccount.create({
    data: {
      id: randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      passwordHash: await hashPassword(password),
    },
  });
  const runtime = createRuntime(prisma, {
    baseURL,
    secret: randomBytes(48).toString("base64url"),
    trustedOrigins: [
      baseURL,
      appOrigin,
      "https://os.connectxmedia.com",
      "https://marketing.connectxmedia.com",
    ],
  });
  const principal = new AuthPrincipalService(new AuthSessionRepository(prisma));
  async function signIn() {
    const response = await runtime.handle(
      request("sign-in/email", { email, password }),
    );
    assert.equal(response.status, 200);
    const cookies = response.headers.getSetCookie();
    const cookie = cookies.map((line) => line.split(";")[0]).join("; ");
    return { response, cookies, cookie, headers: new Headers({ cookie }) };
  }
  return {
    prisma,
    id,
    email,
    password,
    runtime,
    principal,
    signIn,
    organizations,
  };
}
test("actual application runtime uses shared secure cookies, strips bearer JSON and denies unauthorized origins/routes", async (t) => {
  const f = await fixture(t),
    login = await f.signIn();
  assert.deepEqual(await login.response.json(), { success: true });
  assert.equal(login.response.headers.get("cache-control"), "no-store");
  const sessionCookie = login.cookies.find((line) =>
    line.includes("session_token="),
  );
  assert.ok(sessionCookie);
  for (const attribute of [
    "domain=connectxmedia.com",
    "secure",
    "httponly",
    "samesite=lax",
    "path=/",
  ])
    assert.ok(sessionCookie.toLowerCase().includes(attribute));
  const session = await f.runtime.getVerifiedSession(login.headers);
  assert.deepEqual(Object.keys(session).sort(), ["id", "userId"]);
  assert.equal(session.userId, f.id);
  const stored = await f.prisma.authSession.findUnique({
    where: { id: session.id },
  });
  assert.match(stored.tokenHash, /^h1\.[0-9a-f]{64}$/);
  assert.ok(
    !JSON.stringify(
      await f.principal.resolve(f.runtime, login.headers),
    ).includes(stored.tokenHash),
  );
  for (const origin of ["https://evil.connectxmedia.com", null]) {
    assert.equal(
      (await f.runtime.handle(request("sign-out", {}, login.cookie, origin)))
        .status,
      403,
    );
  }
  for (const path of [
    "sign-up/email",
    "request-password-reset",
    "reset-password",
    "get-session",
    "organization/create",
  ]) {
    assert.equal(
      (await f.runtime.handle(request(path, {}, login.cookie))).status,
      404,
    );
  }
  assert.equal(
    (await f.runtime.handle(request("sign-out", {}, login.cookie))).status,
    200,
  );
  assert.equal(await f.runtime.getVerifiedSession(login.headers), null);
});
test("actual principal observes blocks, stored phone waiver, membership downgrade and removal on each request", async (t) => {
  const f = await fixture(t),
    login = await f.signIn();
  let p = await f.principal.resolve(f.runtime, login.headers);
  assert.equal(p.id, f.id);
  assert.equal(p.activeOrgId, null);
  const organizationId = randomUUID();
  f.organizations.push(organizationId);
  await f.prisma.organization.create({
    data: { id: organizationId, name: "Fixture Org" },
  });
  const member = await f.prisma.organizationMembership.create({
    data: { organizationId, userId: f.id, role: "org:admin" },
  });
  await f.prisma.authSession.update({
    where: { id: p.sessionId },
    data: { activeOrganizationId: organizationId },
  });
  assert.equal(
    (await f.principal.resolve(f.runtime, login.headers)).activeOrgRole,
    "org:admin",
  );
  await f.prisma.organizationMembership.update({
    where: { id: member.id },
    data: { role: "org:member" },
  });
  assert.equal(
    (await f.principal.resolve(f.runtime, login.headers)).activeOrgRole,
    "org:member",
  );
  await f.prisma.organizationMembership.delete({ where: { id: member.id } });
  await assert.rejects(
    f.principal.resolve(f.runtime, login.headers),
    /Workspace unavailable/,
  );
  await f.prisma.authSession.update({
    where: { id: p.sessionId },
    data: { activeOrganizationId: null },
  });
  await f.prisma.user.update({
    where: { id: f.id },
    data: { blockedAt: new Date() },
  });
  await assert.rejects(
    f.principal.resolve(f.runtime, login.headers),
    /Account unavailable/,
  );
  await f.prisma.user.update({
    where: { id: f.id },
    data: { blockedAt: null, phoneVerified: false },
  });
  p = await f.principal.resolve(f.runtime, login.headers);
  assert.throws(
    () => f.principal.requireProductAccess(p),
    /Phone verification required/,
  );
  await f.prisma.user.update({
    where: { id: f.id },
    data: { phoneRequired: false },
  });
  p = await f.principal.resolve(f.runtime, login.headers);
  assert.doesNotThrow(() => f.principal.requireProductAccess(p));
  assert.doesNotMatch(
    JSON.stringify(p),
    /clerkId|encryptionKey|password|tokenHash|privateMetadata/,
  );
  await f.prisma.authSession.deleteMany({ where: { userId: f.id } });
  await assert.rejects(
    f.principal.resolve(f.runtime, login.headers),
    /Session unavailable/,
  );
});
test("unverified email sign-in cannot create a session or plaintext verification record", async (t) => {
  const f = await fixture(t);
  await f.prisma.user.update({
    where: { id: f.id },
    data: { authEmailVerified: false },
  });
  const before = await f.prisma.authVerification.count();
  const response = await f.runtime.handle(
    request("sign-in/email", { email: f.email, password: f.password }),
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "Authentication failed" });
  assert.equal(
    await f.prisma.authSession.count({ where: { userId: f.id } }),
    0,
  );
  assert.equal(await f.prisma.authVerification.count(), before);
});
