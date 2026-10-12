# Runtime validation plan

Source audit identifies implementation presence. These checks establish whether the reviewed version works in the intended deployment. Run only after selecting supported releases, fixing deployment gates, and provisioning isolated test data and provider accounts.

| Area | Controlled validation | Pass evidence |
| --- | --- | --- |
| Installation | Start documented containers from pinned images with separate secrets | Image digests, health checks and schema migration record |
| Authentication | Exercise human login, API keys, workspace switching and key revocation | Allow/deny results without credential logs |
| Ringee MCP | Legacy UUID endpoints denied; scoped authenticated MCP succeeds | Negative tests and minimal tool allowlist |
| Tenancy | Attempt cross-workspace reads and mutations for contacts/calls/media/credentials | Denied results at each API and object-storage boundary |
| Voice topology | Establish actual App-to-provider/media route; separately validate Ringee Voice integration if chosen | Call-path diagram with observed signaling/media dependencies |
| Human calling | Web and internal Android client call designated test recipient, return outcome | Same canonical customer timeline plus failed-call case |
| AI calling | Supervised outbound and inbound test agents with explicit approval and spending cap | Audio behavior, interruption, tool authorization, structured result and escalation |
| Consent | Revoke eligibility after queueing; attempt suppressed or out-of-window call | Call prevented and recorded reason |
| Sync | Repeat customer event, simulate timeout after remote creation, retry and reconcile | Single downstream identity and one timeline outcome |
| Marketing | Sandbox enrollment, engagement, unsubscribe/bounce and retry | Eligible enrollment and permanent suppression under selected policy |
| Agent control | Denied tool scope, missing approval, expired approval and budget exhaustion | No side effect with attributable audit record |
| Recovery | Restore backups into separate environment; restart during queued work | Restored records, bounded retries and no duplicate effects |
| Retention | Expire/delete test recording and transcript and retry direct links | Removed media and denied access across caches/storage |
| Mobile | Build APK/AAB with protected signing, install APK and test auth/call/history | Toolchain versions, artifact hashes and device record |

No criterion is passed by this plan alone. Record observed results, component/image revisions, timestamp, operator/agent identity, sanitized failures, and remediation for each run.
