import { UnsupportedSessionOperation } from "./hashed-session-adapter.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Explicit service boundary, NOT a mounted route or production implementation.
 * Auth resolves signed request cookies. IDs select rows only inside that user.
 * The unwrapped adapter is private to server composition and never exported to UI.
 */
export function sessionManagement(auth, adapter, trustedOrigin) {
  if (!trustedOrigin || new URL(trustedOrigin).origin !== trustedOrigin) throw new Error("Explicit trusted origin required");
  async function principal(headers, mutating = false) {
    if (mutating && headers.get("origin") !== trustedOrigin) throw new Error("Untrusted origin");
    const current = await auth.api.getSession({ headers });
    if (!current?.user?.id || !current.session?.id || current.session.expiresAt <= new Date()) {
      throw new Error("Unauthenticated");
    }
    return { userId: current.user.id, sessionId: current.session.id };
  }
  const owned = (userId) => [{ field: "userId", value: userId }];
  return {
    async list(headers) {
      const { userId, sessionId } = await principal(headers);
      const rows = await adapter.findMany({ model: "session", where: [
        ...owned(userId), { field: "expiresAt", value: new Date(), operator: "gt" },
      ] });
      return rows.map(({ id, createdAt, expiresAt }) => ({ id, createdAt, expiresAt, current: id === sessionId }));
    },
    async revoke(headers, id) {
      if (!UUID.test(id)) throw new UnsupportedSessionOperation();
      const { userId } = await principal(headers, true);
      const deleted = await adapter.deleteMany({ model: "session", where: [...owned(userId), { field: "id", value: id }] });
      if (!deleted) throw new Error("Session unavailable");
      return deleted;
    },
    async revokeOthers(headers) {
      const { userId, sessionId } = await principal(headers, true);
      return adapter.deleteMany({ model: "session", where: [...owned(userId), { field: "id", value: sessionId, operator: "ne" }] });
    },
    async revokeAll(headers) {
      const { userId } = await principal(headers, true);
      return adapter.deleteMany({ model: "session", where: owned(userId) });
    },
  };
}
