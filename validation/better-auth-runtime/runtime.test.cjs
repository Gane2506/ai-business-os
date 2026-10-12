const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const { createRuntimeProof } = require("./dist/proof.js");

test("compiled CommonJS loads real Better Auth ESM and preserves closed signup", async (t) => {
  const emitted = fs.readFileSync(require.resolve("./dist/proof.js"), "utf8");
  assert.match(emitted, /exports\.createRuntimeProof/);
  assert.doesNotMatch(emitted, /require\(["']better-auth(?:\/node)?["']\)/);
  const { auth, nodeHandler } = await createRuntimeProof("http://127.0.0.1:4100");
  assert.equal(await auth.api.getSession({ headers: new Headers() }), null);
  const session = await auth.handler(new Request("http://127.0.0.1:4100/api/auth/get-session"));
  assert.equal(session.status, 200);
  assert.equal(await session.json(), null);
  const signup = await auth.handler(new Request("http://127.0.0.1:4100/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Fixture", email: "fixture@example.invalid", password: "test-only-password-0123456789" }),
  }));
  assert.equal(signup.status, 400);
  assert.equal((await signup.json()).code, "EMAIL_PASSWORD_SIGN_UP_DISABLED");

  // Exercise the actual Node handler, not a mocked package or an external service.
  const server = http.createServer(nodeHandler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const response = await fetch("http://127.0.0.1:" + port + "/api/auth/get-session");
  assert.equal(response.status, 200);
  assert.equal(await response.json(), null);
});
