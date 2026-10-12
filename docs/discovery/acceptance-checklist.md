# Acceptance checklist

All runtime criteria remain unverified until exercised in a controlled deployment. An audit can establish source support but cannot mark a runtime criterion passed.

| ID | Acceptance gate | Phase | Evidence required | Current state |
| --- | --- | --- | --- | --- |
| A01 | Twenty customer syncs to Ringee without manual duplicates | 2 | Duplicate delivery and reconciliation test | Unverified |
| A02 | Human business call reaches canonical customer timeline | 3 | Web/mobile test call and CRM outcome | Unverified |
| A03 | Approved autonomous AI call returns structured outcome | 4 | Source gate plus supervised test call | Unverified |
| A04 | Inbound/outbound share canonical identity | 3–4 | Identity resolution including ambiguous phone | Unverified |
| A05 | Recordings/transcripts enforce access and retention | 2–4 | Cross-workspace denial and deletion test | Unverified |
| A06 | Workspace data, campaigns, credentials, agents and analytics isolate | 2 | Negative authorization tests across boundaries | Unverified |
| A07 | Agents respect permissions and budgets | 6 | Tool authorization and exhausted-budget denial | Unverified |
| A08 | Mautic journey enrollment and engagement sync | 5 | Sandbox enrollment and unsubscribe/bounce reconciliation | Unverified |
| A09 | Android APK reproducibly builds and connects internally | 3 | Build record, artifact hash, device test and signing procedure | Unverified |
| A10 | Backup/restore, recovery and observability work | 1 | Restore drill and restart/failure evidence | Unverified |
| A11 | Added services justified by confirmed upstream gaps | All | Architecture decision record per added service | Gate active |

Discovery gates: pinned repository identity and license for each component; source/dependency map; API/auth boundaries; AI calling capability matrix; native tenancy assessment; production version selection; mobile compatibility; minimum-change implementation plan.
