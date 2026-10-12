const { loadBetterAuth, loadNodeHandler } = require("../native-loader.cjs") as {
  loadBetterAuth: () => Promise<{ betterAuth: (options: Record<string, unknown>) => any }>;
  loadNodeHandler: () => Promise<{ toNodeHandler: (auth: any) => any }>;
};

export async function createRuntimeProof(baseURL: string) {
  const [{ betterAuth }, { toNodeHandler }] = await Promise.all([
    loadBetterAuth(),
    loadNodeHandler(),
  ]);
  const auth = betterAuth({
    baseURL,
    secret: "runtime-proof-only-no-production-secret-0123456789",
    emailAndPassword: { enabled: true, disableSignUp: true },
    telemetry: { enabled: false },
    logger: { disabled: true },
  });
  return { auth, nodeHandler: toNodeHandler(auth) };
}
