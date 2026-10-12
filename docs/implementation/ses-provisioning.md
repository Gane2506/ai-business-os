# Lean SES provisioning

## Current state

Live provisioning completed in `ca-central-1`: all six explicit identities and
configuration sets exist. SES reports verified sending identities, DKIM SUCCESS,
and custom MAIL FROM SUCCESS for all six. The authenticated Cloudflare connector
created 36 DNS records; all 52 pre-existing records were preserved.

Evidence: `evidence/ses-connector-provision.json`, `evidence/ses-dns-created.json`,
and `evidence/ses-after-dns-check.json`. The CLI token adapter remains available
for future automated operator runs; this run used the existing connector instead.
No additional Cloudflare credential was created or required.

The account is still in sandbox (200/day, 1/second). Five infrastructure test messages (AUTH, TRANSACTIONAL, COMMUNICATION, MARKETING,
and PROMOTIONAL) were accepted by SES for admin@example.com. The recipient
identity reports verification SUCCESS. Public DNS was independently resolved
before sending. Message IDs are recorded in `evidence/ses-stream-tests.json`.
Inbox receipt and authentication headers are not yet confirmed. SNS feedback
destinations, application integration, Mautic integration, and delivery/header
acceptance remain incomplete. Outreach is excluded by the
planned application policy and the provisioner has no sending permission; its
SES configuration set itself currently has SendingEnabled=true.

The read-only Cloudflare baseline is in
[`evidence/ses-dns-baseline.json`](evidence/ses-dns-baseline.json). The exact
active zone is `connectxmedia.com`, ID
`d8416a7139c364daa395a11a48fa5a6f`. Existing apex website/email records and
the proxied `mail.connectxmedia.com` CNAME must remain intact. Easy DKIM uses
children of `_domainkey.mail.connectxmedia.com`, not a TXT/CNAME at
`mail.connectxmedia.com`, so that existing web alias is preserved.

## Architecture and mapping

AI OS and Mautic deliver directly to SES on shared IPs. The provisioning tool is
an operator CLI, not a running service. It does not create queues, workers,
Lambda functions, dedicated IP pools, SNS topics, or SNS subscriptions.

| Application stream | Explicit SES identity | Configuration set |
| --- | --- | --- |
| AUTH | auth.{rootDomain} | ses-auth |
| TRANSACTIONAL | tx.{rootDomain} | ses-transactional |
| COMMUNICATION | mail.{rootDomain} | ses-communication |
| MARKETING | news.{rootDomain} | ses-marketing |
| PROMOTIONAL | offers.{rootDomain} | ses-promotional |
| OUTREACH | outreach.{rootDomain} | ses-outreach |

Configuration sets are shared across tenants in the same region; six domain
identities are created for each tenant. No root-domain or individual-mailbox
identity is created. Application authorization must enforce exact tenant and
stream sender domains even if an independently verified apex identity exists.
`outreachEnabled` defaults to false and is a report/application policy, not an
AWS identity-level sending prohibition. Use a sending-role IAM policy that
excludes outreach until approved, plus the application's outreach switch.

## Operator workflow

From the repository root, install only the isolated provisioning package:

```sh
npm ci --prefix deploy/email --ignore-scripts --no-audit --no-fund
cp deploy/email/tenants.example.json deploy/email/tenants.local.json
```

Set `region` in that copy to the chosen SES region, or provide
`AWS_SES_REGION` through the operator's environment. The example deliberately
leaves region blank; the CLI refuses to guess. Commercial AWS regions are
supported; China and GovCloud partitions fail validation rather than using
incorrect endpoint suffixes. Supply AWS credentials through the standard AWS SDK
credential chain (profile/SSO, role, or injected environment credentials), and
inject `CLOUDFLARE_API_TOKEN` through the existing secret manager. Keep tokens
and keys out of command arguments, config JSON, reports, and Git.

```sh
node deploy/email/cli.mjs plan --config deploy/email/tenants.local.json --report deploy/email/plan-report.json
node deploy/email/cli.mjs apply --config deploy/email/tenants.local.json --report deploy/email/apply-report.json
node deploy/email/cli.mjs status --config deploy/email/tenants.local.json --report deploy/email/status-report.json
```

`plan` only reads APIs. `apply` explicitly authorizes mutations and recalculates
the plan against current state. Reports are JSON, created mode 0600, and never
overwrite existing evidence files. Supply a new report filename on subsequent
runs. Exit 0 means plan completed or status passed, 1 means operation/conflict
failure, and 2 means provisioning/status completed but verification or sending
readiness is pending/blocked. No command sends email. `status` performs API reads
and independent DNS resolution using the operator host's resolver.

Add another tenant with unique `tenantId`, exact `rootDomain`, optional expected
`zoneId`, and `outreachEnabled:false`. Scope the Cloudflare token to the new
zone and extend the provisioner IAM identity resource list before applying.
Duplicate tenants/domains fail validation. Application tenant IDs must use the
same IDs when consuming this configuration/report.

## DNS and conflict protection

For each explicit identity the CLI requests SES Easy DKIM with 2048-bit keys
on creation. It reads the three SES DKIM tokens and `SigningHostedZone` from
SES, then creates three unproxied CNAMEs. It does not guess the DKIM suffix.
This follows the [AWS region-specific DKIM guidance](https://docs.aws.amazon.com/ses/latest/dg/regions.html).
Existing BYODKIM/DEED identities, missing tokens, or missing hosted zones stop
the operation for manual review, without replacing that configuration.

Each identity receives a custom MAIL FROM `bounce.{identity}` with
`BehaviorOnMxFailure=REJECT_MESSAGE`. At that name the desired records are:

```text
MX  priority 10  feedback-smtp.{configuredRegion}.amazonses.com
TXT             v=spf1 include:amazonses.com ~all
```

The [SES custom MAIL FROM requirements](https://docs.aws.amazon.com/ses/latest/dg/mail-from.html)
require one MX record. Duplicate or incompatible MX/SPF policies stop the
operation; unrelated TXT records are retained. No MX or SPF is added at the
apex or sending identity itself.

Every `_dmarc.{identity}` gets `v=DMARC1; p=none; adkim=r; aspf=r` for monitoring.
DKIM aligns directly with the sending identity; MAIL FROM SPF uses relaxed
alignment. The initial policy has no report mailbox because none has been
provided. Add a confirmed reporting mailbox through an explicit reviewed DNS
change if aggregate reports are needed. Existing different DMARC policies
(including `rua` additions) fail closed and are preserved. To later move to
enforcement or change reports, review authentication/delivery evidence and
update the desired policy together with the existing records intentionally;
the CLI does not silently change policies.

Before any mutation, the tool reads all six configuration sets, all tenant
identities, resolves each exact active zone, and reads every zone DNS page.
It detects managed-record conflicts and subordinate NS delegations. After
creating identities it retrieves real DKIM records, repeats preflight, then
reads the entire zone again immediately before each DNS POST. Matching records
are reused. It never offers DNS update/delete or SES delete operations. Existing
foreign configuration-set or MAIL FROM associations and dedicated sending pools
fail closed. Missing associations/settings are safely filled, and disabled DKIM
signing is enabled. Existing disabled configuration sets remain disabled.
Cloudflare has no conditional create primitive here; a concurrent external DNS
write after the final read can still cause POST failure or a duplicate, and
subsequent status/preflight detects it. Serialize operator runs per zone.

## Credentials and permissions

Use a restricted Cloudflare **API token**, with Zone / Zone / Read and Zone /
DNS / Edit restricted to the exact tenant zones. Read-only plan/status can use
DNS / Read instead. The tool uses Bearer-token authentication only. Global API
keys are unsupported. Zone discovery checks exact name, active status, and
expected ID, and fails on ambiguity. See [Cloudflare token creation](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
and [DNS record creation](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/).

Give the operator role these SES actions, restricted to the chosen region with
`aws:RequestedRegion`:

| Actions | IAM resource scope |
| --- | --- |
| ses:GetAccount | `*` (account-level read) |
| ses:GetEmailIdentity, ses:CreateEmailIdentity, ses:PutEmailIdentityDkimAttributes, ses:PutEmailIdentityMailFromAttributes | Exact six identity ARNs per tenant |
| ses:GetConfigurationSet, ses:CreateConfigurationSet, ses:GetConfigurationSetEventDestinations | Exact six configuration-set ARNs |
| ses:PutEmailIdentityConfigurationSetAttributes | Exact six identity ARNs and configuration-set ARNs |
| ses:CreateConfigurationSetEventDestination (only when SNS ARN configured) | Exact six configuration-set ARNs |

An identity ARN is `arn:aws:ses:{region}:{accountId}:identity/auth.{rootDomain}`;
a set ARN is `arn:aws:ses:{region}:{accountId}:configuration-set/ses-auth`.
The CLI requests no tags, so TagResource is not required. SNS destinations do
not use a role; do not grant broad iam:PassRole for this workflow. No SendEmail,
deletion, SNS administration, or dedicated-IP permissions belong on this
provisioner role. For plan/status, remove all write actions. Validate final IAM
against the [SES v2 service authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html).
Use separate least-privilege runtime sending credentials; do not ship the
Cloudflare token or provisioner permissions to the application/Mautic.

## SES feedback into the existing backend

Optionally set one exact existing standard `snsTopicArn` in the chosen SES
region. The CLI creates `ai-os-feedback` on each set with SEND, DELIVERY,
BOUNCE, COMPLAINT, REJECT, DELIVERY_DELAY, and RENDERING_FAILURE. It preserves
other event destinations and stops if its destination name already has different
settings. A missing topic ARN does not prevent identity/DNS provisioning, but
status does not report production-ready without the expected destination.

The topic owner must give `ses.amazonaws.com` `sns:Publish` on the exact topic
ARN, restricted with `AWS:SourceAccount` and `AWS:SourceArn` containing the six
exact configuration-set ARNs (one policy statement per set, or a StringEquals
array). This prevents unrelated accounts/configuration sets publishing as SES.
If the topic is encrypted, the KMS policy must also permit the required SES
publish path; review existing topic encryption rather than changing it blindly.
Follow the [AWS SNS event destination policy instructions](https://docs.aws.amazon.com/ses/latest/dg/event-publishing-add-event-destination-sns.html).

Subscribe the existing backend HTTPS feedback endpoint with raw message delivery
disabled, so the backend receives the signed SNS envelope and validates it.
Topic, policy, encryption, subscription, backend deployment, and event persistence
are separate existing-infrastructure operations: this CLI does not create or
verify them. `feedbackConfigured:true` means SES destination settings were read
back correctly; `feedbackDeliveryVerified:false` explicitly means no real event
delivery has been observed by this tool. A `ready` row describes infrastructure
readiness, not completion of the sending/delivery acceptance tests.

## Verification and application handoff

Status reports each tenant/stream with identity existence, Cloudflare records,
independent DNS results, DKIM/MAIL FROM/SES verification, configuration-set
association, account sending state, production access, quota availability,
feedback destination, and outreach policy. It requires SES itself to report
successful verification plus real DNS before a row becomes ready. DNS writes
alone yield created/pending states. Sandbox, exhausted quota, disabled sets,
and absent event destinations keep sending blocked. Quota/status is a snapshot;
the application must recheck current limits and verification during sending.

Use the existing backend's centralized email module for tenant authorization,
stream selection, safe sender addresses, suppression/preferences, throttling,
retry, and unsubscribe handling. Consume this report/configuration through the
application's tenant store; this CLI does not mutate the application database.
Mautic should use `news.{rootDomain}` / `ses-marketing` or explicitly configured
`offers.{rootDomain}` / `ses-promotional`, with SES SMTP/API configuration and
credentials for the same region. It must not use the root domain or authentication
identity. See the separate application/Mautic implementation documentation for
the concrete runtime integration.

Run a controlled send to the approved test mailbox through each of AUTH,
TRANSACTIONAL, COMMUNICATION, MARKETING, and PROMOTIONAL. Record SES message ID,
correct From/configuration set, received Authentication-Results showing DKIM,
SPF and DMARC alignment, and the persisted matching delivery event. Also verify
root-domain sends and unauthorized tenant/stream senders are rejected. Do not
send outreach to prospects as an acceptance test. The CLI deliberately has no
send command; no live test results are asserted by its unit tests.

## Troubleshooting, partial failures, rollback

Pending DNS/SES can require propagation time. Repeat `status`; do not generate
new tokens or delete identities to force verification. Check CNAME proxy flags,
exact SES `SigningHostedZone`, region-specific MX, single SPF/MX policy, zone
delegations, and account sandbox/quotas. An explicit SES MAIL FROM FAILED state
is restarted on a later authorized apply while preserving its domain.

AWS quota/permission failures stop immediately. The report includes `partial`
and a journal of completed operations and DNS record IDs. Partial resources
remain pending; they are not rolled back automatically. Configuration-set and
identity creation races are reread and conflict-checked. Resolve the reported
problem, inspect a fresh plan, then rerun apply safely.

For rollback, disable runtime sending first. Use the operation journal and the
before snapshot to manually remove only DNS records actually created by the
run, after confirming no other tenant/process uses them. Never remove root mail
or unrelated website records. Keep SES identities/configuration sets unless an
operator explicitly authorizes deletion; shared configuration sets may serve
multiple tenants. The provisioner has no delete permission or automatic rollback.

## Local validation

`npm test --prefix deploy/email` passes 25 tests covering existing identity reuse,
new identities/sets and repeat-run idempotence, root DNS preservation including
the mail web CNAME, SPF/MX duplicates and conflicts, proxied DKIM and subordinate
NS delegations, BYODKIM/foreign SES association rejection, safe reconciliation,
concurrent DNS conflicts, partial quota failure journals, public DNS failure,
SES verification failure, production/quota/feedback gates, exact zone discovery,
Cloudflare pagination/token handling, and multi-tenant input validation.
AWS SDK v3 is pinned to 3.1149.0 in this isolated package because current DKIM
provisioning must retain the SES `SigningHostedZone` response field. No monorepo
install or application source modification is required.

## Sender address decision

All future AI Business OS stream senders use the exact local part `noreply`:
AUTH `noreply@auth.connectxmedia.com`, TRANSACTIONAL `noreply@tx.connectxmedia.com`,
COMMUNICATION `noreply@mail.connectxmedia.com`, MARKETING `noreply@news.connectxmedia.com`,
PROMOTIONAL `noreply@offers.connectxmedia.com`, and OUTREACH
`noreply@outreach.connectxmedia.com` when explicitly enabled. The root domain is
not a sender. Mautic must use the news or offers address according to stream.
Reply-To/support destinations are configured separately.

The five previously accepted smoke tests used `test@` and remain historical
evidence. Their ledger prevents resending them automatically. The local test
policy and deployment defaults now use `noreply`; the AWS inline test policy
still needs replacement with the updated `iam/provisioner-and-test.json`.
Application/Mautic integration remains incomplete; this decision does not claim
that running application senders have been deployed.
