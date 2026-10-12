# Ringee implementation patches

`0002-foundation-ses.patch` is the active cumulative patch based on commit
`b04a4b889a9c827e76f64574f6f3b2f1c5f79241`. The original upstream source remains
under `upstream/ringee-app`; the modified checkout is `workspaces/ringee-app`.
Ringee's AGPL license is preserved in this directory. Deployment and source-offer
requirements remain part of release preparation.

`0001-foundation.patch` is retained as the earlier foundation snapshot. The active
0002 patch supersedes it; do not apply both. It also replaces the Resend transport
with AWS SES and configured sender/support identities. Better Auth is still pending.

The patch disables UUID-based MCP authority, updates supported-client guidance
and meaningful tests, and adds a tracked fresh-install Prisma baseline with
SQL-only invariants. Existing database upgrades remain a separate task. The
bundled URL-only plugin cannot authenticate until migrated to a supported
transport. The patch is not a complete deployment-readiness certification.

From the AI Business OS repository root:

```sh
python3 scripts/checkout_sources.py
python3 scripts/prepare_component.py ringee-app
```

Patch hashes and the base revision are recorded in
`config/component-patches.json`. Preparation creates an isolated worktree for a
missing component workspace; it verifies the entire patch before applying it.
Existing changes are never reset. Already-applied patches leave the workspace
untouched. Install dependencies separately from the component root using the
component lockfile (the SES SDK was added; existing version pins were retained).

See `docs/implementation/foundation-status.md` for validation and remaining work.
