import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const temporary = mkdtempSync(join(tmpdir(), "ringee-frontend-auth-"));
const changed = [
  "apps/frontend/src/features/auth/components/user-auth-form.tsx",
  "apps/frontend/src/features/auth/lib/principal.server.ts",
  "apps/frontend/src/i18n/locales/en/auth.json",
  "apps/frontend/src/i18n/locales/es/auth.json",
  "packages/frontend-shared/src/auth/__tests__/auth-client.test.ts",
  "packages/frontend-shared/src/auth/client.ts",
  "packages/frontend-shared/src/auth/contracts.ts",
  "packages/frontend-shared/src/hooks/use.api.ts",
  "packages/frontend-shared/src/lib/api.server.ts",
  "packages/frontend-shared/src/lib/api.ts",
  "packages/frontend-shared/src/lib/auth.client.ts",
  "packages/frontend-shared/src/lib/auth.contracts.ts"
];
const sourceFiles = changed.filter((path) => /\.(ts|tsx)$/.test(path));
const bin = (name) => join(root, "node_modules", ".bin", name);
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit" });

try {
  for (const locale of ["en", "es"]) {
    const messages = JSON.parse(readFileSync(join(root, `apps/frontend/src/i18n/locales/${locale}/auth.json`), "utf8"));
    for (const key of ["errors.invalidCredentials", "errors.invalidEmail", "errors.passwordRequired", "errors.signInUnavailable", "fields.email", "fields.emailPlaceholder", "fields.password", "fields.passwordPlaceholder", "signIn.submit"]) {
      const [namespace, name] = key.split(".");
      if (typeof messages[namespace]?.[name] !== "string") throw new Error(`Missing ${locale}:auth.${key}`);
    }
  }
  run(bin("prettier"), ["--check", ...changed]);
  run(bin("eslint"), sourceFiles);

  // Also checks the UI's real transitive form types. No declaration stubs.
  const config = join(temporary, "tsconfig.json");
  writeFileSync(config, JSON.stringify({
    extends: join(root, "apps/frontend/tsconfig.json"),
    compilerOptions: { target: "es5", moduleResolution: "node", incremental: false },
    files: sourceFiles.map((path) => join(root, path)),
    include: [],
    exclude: []
  }));
  run(bin("tsc"), ["-p", config]);
  run("npx", ["--yes", "--package=tsx@4.20.6", "tsx", "--test", "packages/frontend-shared/src/auth/__tests__/auth-client.test.ts"]);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
