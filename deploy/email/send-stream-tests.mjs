import { STREAMS, verifyDns } from './core.mjs';
import { loadTestAuthorization, attemptSend, hasUncertainAttempt, fileLedger } from './send-safety.mjs';
import { readFile } from 'node:fs/promises';
import { Resolver } from 'node:dns/promises';

const region = 'ca-central-1', recipient = 'ganesh@connectxmedia.com';
const streams = STREAMS.filter(s => s.stream !== 'OUTREACH');
let client, store;
try {
  const authorization = await loadTestAuthorization({ senders: streams.map(s => `noreply@${s.prefix}.connectxmedia.com`), recipient, maxMessages: 5 });
  const { SESv2Client, GetAccountCommand, GetEmailIdentityCommand, GetConfigurationSetCommand, SendEmailCommand } = await import('@aws-sdk/client-sesv2');
  store = fileLedger(new URL('./stream-test-ledger.json', import.meta.url)); await store.acquire();
  const ledger = await store.read({ region, recipient, kind: 'infrastructure_smoke_test', applicationIntegrationTest: false, deliveryVerified: false, tests: [] });
  if (ledger.region !== region || ledger.recipient !== recipient || !Array.isArray(ledger.tests)) throw new Error('Ledger scope mismatch');
  if (hasUncertainAttempt(ledger)) throw new Error('Prior send outcome uncertain; inspect before any retry');
  const pending = streams.filter(s => !ledger.tests.some(t => t.stream === s.stream && t.state === 'accepted'));
  if (!pending.length) throw new Error('All stream tests already accepted by SES; no resend');
  client = new SESv2Client({ region, maxAttempts: 1 });
  const account = await client.send(new GetAccountCommand({}));
  if (!account.SendingEnabled || !(account.SendQuota?.MaxSendRate > 0) ||
      !(account.SendQuota?.Max24HourSend - account.SendQuota?.SentLast24Hours >= pending.length)) throw new Error('Sending disabled or insufficient quota');
  const target = await client.send(new GetEmailIdentityCommand({ EmailIdentity: recipient }));
  if (!target.VerifiedForSendingStatus) throw new Error('Test recipient not verified');
  const provision = JSON.parse(await readFile(new URL('./connector-provision-report.json', import.meta.url), 'utf8'));
  const resolver = new Resolver({ timeout: 5000, tries: 2 });
  for (const s of pending) {
    const identity = `${s.prefix}.connectxmedia.com`, state = await client.send(new GetEmailIdentityCommand({ EmailIdentity: identity }));
    if (!state.VerifiedForSendingStatus || state.VerificationStatus !== 'SUCCESS' || !state.DkimAttributes?.SigningEnabled ||
        state.DkimAttributes?.Status !== 'SUCCESS' || state.MailFromAttributes?.MailFromDomain !== `bounce.${identity}` ||
        state.MailFromAttributes?.MailFromDomainStatus !== 'SUCCESS' || state.MailFromAttributes?.BehaviorOnMxFailure !== 'REJECT_MESSAGE' ||
        state.ConfigurationSetName !== s.configurationSet) throw new Error(`Identity not ready: ${s.stream}`);
    const set = await client.send(new GetConfigurationSetCommand({ ConfigurationSetName: s.configurationSet }));
    if (!set.SendingOptions?.SendingEnabled || set.DeliveryOptions?.SendingPoolName) throw new Error(`Configuration set disabled/dedicated: ${s.stream}`);
    const records = provision.dnsRecords.map(op => op.record).filter(r => r.name === `bounce.${identity}` || r.name === `_dmarc.${identity}` || r.name.endsWith(`._domainkey.${identity}`));
    if (records.length !== 6) throw new Error(`DNS plan incomplete: ${s.stream}`);
    for (const record of records) if (!await verifyDns(record, resolver)) throw new Error(`Public DNS pending: ${record.name}`);
  }
  for (const s of pending) {
    const from = `noreply@${s.prefix}.connectxmedia.com`;
    const entry = { stream: s.stream, from, configurationSet: s.configurationSet, authorizationReference: authorization.reference };
    ledger.tests.push(entry);
    await attemptSend(entry, () => store.save(ledger), () => client.send(new SendEmailCommand({
      FromEmailAddress: from, Destination: { ToAddresses: [recipient] }, ConfigurationSetName: s.configurationSet,
      EmailTags: [{ Name: 'test', Value: 'ai-os-authorized-stream-smoke' }],
      Content: { Simple: { Subject: { Data: `AI Business OS authorized SES test — ${s.stream}`, Charset: 'UTF-8' },
        Body: { Text: { Data: `Separately authorized ${s.stream} infrastructure test. From: ${from}. SES acceptance does not confirm inbox delivery.`, Charset: 'UTF-8' } } } },
    })));
    console.log(JSON.stringify(entry));
    await new Promise(resolve => setTimeout(resolve, Math.max(1200, Math.ceil(1000 / account.SendQuota.MaxSendRate))));
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'stopped', errorType: error.name, outcome: error.state,
    reason: ['Error', 'SendOutcomeError'].includes(error.name) ? error.message : 'Provider operation failed; no automatic retry' }));
  process.exitCode = 1;
} finally { client?.destroy(); await store?.close(); }
