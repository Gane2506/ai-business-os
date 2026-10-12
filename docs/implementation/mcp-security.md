# Ringee MCP authentication hardening

Implemented locally on 2026-10-11 in `workspaces/ringee-app`. Source rationale:
[Ringee audit](../discovery/ringee-audit.md), legacy MCP authorization finding.
No deployment, production credential use, real calls or external service requests
were performed.

## Boundary and compatibility

All four legacy route patterns now return **HTTP 410 Gone** before any identity
lookup or MCP dispatch:

- `GET /api/mcp/:id/sse`
- `POST /api/mcp/:id/messages`
- `GET /api/mcp/:userId/:organizationId/sse`
- `POST /api/mcp/:userId/:organizationId/messages`

A valid user/org UUID, existing organization membership, or valid API key attached
to a retired URL never revives it. UUIDs are identifiers, not authorization.
The prior resolvers and their injected user/org services were removed from the
controller. Explicit tombstones give old clients actionable migration guidance.

API-key `POST /api/mcp`, `GET /api/mcp/sse` and `POST /api/mcp/messages` preserve
their routes, guards, payload forwarding, metadata and server-resolved active
workspace. Clerk OAuth `/api/mcp/chatgpt/*` is unchanged. GET/DELETE on stateless
`/api/mcp` still return 405 with `Allow: POST`.

**Intentional breaking change:** UUID-only connectors stop working. Connection-info
no longer returns its legacy `url` field; `endpoint`, `sseEndpoint`, mode and
workspace identifiers remain. The dashboard removes the legacy URL card.

CLI environment precedence and old configuration parsing remain intact; saved
login credentials are untouched. An SDK SSE connection receiving 410 reports
migration steps: unset legacy URL/USER_ID overrides, then use `ringee login` or
`RINGEE_API_KEY` with `/api/mcp` or `/api/mcp/sse`. The bundled URL-only Claude
plugin transport cannot authenticate to this hardened backend. Its setup guidance
and manifest description say to configure an authenticated MCP client; no new
plugin auth contract was invented. Clients unable to send headers need a supported
OAuth connector or an upgraded client.

## Changed files

Within `workspaces/ringee-app`:

- `apps/backend/src/api/routes/mcp.controller.ts`: legacy tombstones and connection-info.
- `apps/backend/src/api/routes/mcp.controller.spec.ts`: actual Nest HTTP routing and guard regression coverage.
- `apps/backend/test/register-env.cjs`, `apps/backend/package.json`: deterministic synthetic configuration for the new test command only.
- `apps/frontend/src/features/integrations/components/tabs/connectors-tab.tsx`: removes retired connector UI.
- `packages/agent/src/clients/mcp-client.ts`, `mcp-client.test.ts`: actionable 410 migration error, verified using an actual local HTTP server and the installed SDK.
- `packages/agent/src/config.ts`, `config.test.ts`: configuration comments/errors/test wording; existing parsing and precedence retained.
- `packages/agent/AGENTS.md`, `README.md`, `SETUP.md`, `skills/ringee-setup/SKILL.md`, `.claude-plugin/plugin.json`: supported authentication and migration guidance.
- `apps/frontend/src/features/marketing/content/skills.generated.ts`: regenerated published setup skill and digest from its canonical skill file.
- `apps/agent-cli/src/index.ts`, `README.md`: correct CLI help and configuration guidance.
- `apps/chatgpt-app/.env.example`, `README.md`, `src/server/serve.ts`: correct single-account dev authentication examples/comments; OAuth behavior unchanged.
- `docs/engineering/ARCHITECTURE_DEBT.md`: DEBT-005 resolved locally, with rollout caveat. Other debt edits are owned by the database workstream.

## Verification

- `pnpm --filter backend test`: **27 passed, 0 failed** (Node 22.22.0).
- `pnpm --filter @ringee-io/agent test`: **32 passed, 0 failed**, including the real SDK/local HTTP 410 migration regression.
- `pnpm --filter ringee typecheck`: **passed**, exit 0.
- `pnpm --filter @ringee-io/agent build`: **passed**, exit 0.
- `pnpm --filter @ringee-io/agent typecheck`: **failed**, exit 2, solely in untouched `src/tools/catalog.test.ts`: line 23 TS18048 (`tool` possibly undefined) and line 33 TS2532 (object possibly undefined). There is no diff in that file; production agent compilation passed. Parent independently reproduced both identical diagnostics in a pristine worktree at pinned upstream commit `b04a4b889a9c827e76f64574f6f3b2f1c5f79241` with the same compiler/dependencies, establishing these as baseline failures.
- Changed TypeScript/test/bootstrap files: ESLint **passed**, exit 0. Configuration emitted notices about missing React package/version detection and missing root pages directory; no lint errors or file warnings were reported.
- Changed source/config/docs files: Prettier **passed**, exit 0. Generated skill content follows its canonical generator output and is excluded by the repository's formatter policy.
- `git diff --check`: **passed**, exit 0.
- Parent reported backend and database builds **passed**, exit 0, against the shared working tree.

The initial backend test attempt failed at import-time configuration validation;
a test-only synthetic bootstrap resolved it. The initial agent test attempt failed
because the filtered dependency install had not yet included `tsx`; parent then
installed the agent/CLI dependencies and the suite passed. No real `.env` was
loaded by the new backend test script.

The backend suite constructs a real Nest HTTP application with the real
`PersonalApiKeyGuard` and `PersonalApiKeyService`. Key persistence and workspace
resolution use in-memory fixtures; MCP dispatch methods are spies. It checks leaked
UUID routes have zero key lookups and zero MCP calls, missing/unknown/revoked/blocked
keys across all three guarded routes, failed workspace resolution, valid authenticated
context forwarding, ignored client identity overrides, workspace changes between
messages, sessionId validation and unchanged 405 responses.

**Limits:** the harness does not register the unchanged global Clerk guard or verify
connection-info JWT authentication; connection-info response shape is tested directly.
MCP transport internals/tool execution, live OAuth, real database membership/revocation,
and long-lived production streams were not exercised. The agent migration test uses
only loopback HTTP and synthetic data. Rollout must restart/drain old backend instances
and streams; existing processes running the old code retain their old behavior until
replaced. This source change does not terminate already running production sessions.
