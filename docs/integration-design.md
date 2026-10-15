# Integration design draft

Twenty is authoritative for contact identity, organization, opportunity lifecycle, eligibility, and consent. This draft specifies integration invariants; endpoint choices must follow the pinned-source audit and runtime validation.

## Identity and conflict rules

Use a mapping keyed by canonical workspace ID, Twenty object type, and Twenty object ID. Record subsystem instance/workspace and subsystem record ID. Do not infer customer identity solely from phone number, which can be shared or reassigned. Normalize phone numbers for lookup and route ambiguous matches to review.

Twenty changes win for canonical fields. Calling outcomes append to the timeline rather than overwriting customer master fields. Explicitly delegated fields require a documented owner and conflict rule. Reconciliation must verify both customer identity and workspace before writing.

## Event envelope

Each logical event needs a schema version, immutable event ID, event type, occurred-at UTC timestamp, producer, canonical workspace ID, actor identity/type, target reference, correlation ID, causation ID, and minimal payload. Approval-required actions also carry an approval reference tied to the exact action payload and expiry. Idempotency is scoped to workspace, consumer, and logical operation; delivery retries retain the logical event ID.

Initial vocabulary: `customer.updated`, `opportunity.stage_changed`, `call.completed`, `call.failed`, `meeting.booked`, `campaign.enrolled`, and `invoice.overdue`. These names are proposed internal contracts, not claims about existing upstream events.

## Delivery and authorization

Authenticate webhooks and reject stale/replayed deliveries using supported upstream mechanisms. Resolve authoritative workspace membership and tool permissions server-side; a workspace ID in an event is not authorization. An agent receives an explicit role and scoped credentials. Approval evidence never grants permissions that the actor lacks.

Use native delivery retries when sufficient. Any bridge must durably record receipt and pending side effects, enforce a unique operation key, retry transient failures with bounded backoff, and expose terminal failures for reconciliation. A local record alone cannot prevent duplicate remote writes after a crash: require remote idempotency or reconcile by stable external ID before retrying creation. Avoid direct database writes to upstream systems.

## Data minimization and controls

Send only identity, required phone/context, owner, and current calling eligibility to Ringee. Check suppression and contact-window policy again immediately before initiating a call. Revocation or changed eligibility must invalidate queued work. Store recording/transcript references in Twenty, enforcing access in the recording owner; a URL must not bypass workspace permissions.

Mautic enrollment uses canonical identity and marketing eligibility; unsubscribe and bounce events must prevent re-enrollment under the configured authoritative consent policy. Never copy credentials into event payloads, model context, or ordinary logs.

## Runtime acceptance scenario

Create a synthetic contact in workspace A in Twenty, sync it once despite duplicate event delivery, initiate an explicitly approved human test call to a designated test endpoint, reconcile outcome to the same customer, and verify workspace B cannot access it. Repeat with revocation, replay, timeout after remote success, and reconciliation. Marketing validation uses a sandbox recipient and provider. Autonomous calls wait for the Ringee source gate and runtime test plan.
