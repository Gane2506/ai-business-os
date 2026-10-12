# Decision 0002 Require deployment readiness evidence

Status: proposed after source inspection, 2026-10-11. Detailed evidence is in the component audits.

Default-branch snapshots are audit pins. Choose supported releases and immutable images separately before deploying. Source inspection cannot certify runtime security, isolation, backup recovery or provider compatibility.

Ringee readiness requires disabling or authenticating legacy UUID-based public MCP paths, assessing scoped agent authorization, and verifying provider/webhook authentication. AI call functionality is implemented through external Telnyx assistants in the inspected app; deployment decisions must account for that managed dependency. An app adapter to the Asterisk-derived Ringee Voice source has not been demonstrated.

Mobile readiness requires an established app license grant, a third-party notices inventory, backend-issued scoped voice credentials instead of reusable SIP passwords in EXPO_PUBLIC bundle configuration, and protected release signing. A successful build and test device call are separate acceptance evidence.

Mautic project grouping must not be treated as a client isolation boundary. Use separate instances per isolated client unless a verified extension proves the required boundary. Twenty enterprise/license boundaries and any paid provider/configuration constraints must be recorded before feature selection.

These gates constrain deployment and distribution. They do not authorize replacements or conclude that missing source evidence means a capability is impossible.
