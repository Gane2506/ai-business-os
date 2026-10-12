import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assertTestAuthorization, attemptSend, hasUncertainAttempt, fileLedger } from '../send-safety.mjs';
import { snapshotAdapter } from '../snapshot-bridge.mjs';
import { buildPolicies } from '../iam/policies.mjs';

const from = 'noreply@auth.connectxmedia.com';
const request = { explicitInvocation: true, recipient: 'approved@example.com', senders: [from], maxMessages: 1 };
const control = () => ({ testSendingEnabled: true, authorization: { approvedBy: 'human-user', reference: 'future-mock-approval',
  approvedAt: '2026-10-11T12:00:00Z', expiresAt: '2026-10-11T14:00:00Z', maxMessages: 1, senders: [from], recipients: ['approved@example.com'] } });
const now = Date.parse('2026-10-11T13:00:00Z');
test('persisted current user prohibition remains disabled; direct script execution is denied before any send', async () => {
  const current = JSON.parse(await readFile(new URL('../send-control.json', import.meta.url), 'utf8'));
  assert.equal(current.testSendingEnabled, false); assert.equal(current.authorization, null);
  for (const script of ['check-noreply.mjs', 'send-stream-tests.mjs']) {
    assert.throws(() => execFileSync(process.execPath, [fileURLToPath(new URL(`../${script}`, import.meta.url)), '--authorized-test'], { encoding: 'utf8', stdio: 'pipe', timeout: 10000 }),
      error => error.status === 1 && error.stderr.includes('Test sending is disabled by the user'));
  }
});
test('future approval must be human, explicit, unexpired, and within exact sender/recipient/count scope', () => {
  assert.equal(assertTestAuthorization(control(), request, now).reference, 'future-mock-approval');
  assert.throws(() => assertTestAuthorization({ ...control(), testSendingEnabled: false }, request, now), /disabled/);
  assert.throws(() => assertTestAuthorization(control(), { ...request, explicitInvocation: false }, now), /explicit/);
  assert.throws(() => assertTestAuthorization(control(), request, now + 7200000), /unexpired/);
  assert.throws(() => assertTestAuthorization(control(), { ...request, recipient: 'unapproved@example.com' }, now), /scope/);
  assert.throws(() => assertTestAuthorization(control(), { ...request, senders: ['noreply@outreach.connectxmedia.com'] }, now), /scope/);
  assert.throws(() => assertTestAuthorization(control(), { ...request, maxMessages: 2 }, now), /scope/);
});
test('no dispatch when intent persistence fails', async () => {
  let sends = 0; await assert.rejects(attemptSend({}, async () => { throw new Error('disk full'); }, async () => { sends++; }), /disk full/); assert.equal(sends, 0);
});
test('explicit service 4xx is rejected, while timeout/5xx/absent ID remain uncertain', async () => {
  for (const [failure, expected] of [[403, 'rejected'], [429, 'rejected'], [500, 'uncertain'], ['timeout', 'uncertain'], ['missing-id', 'uncertain']]) {
    const entry = {}, durable = [];
    await assert.rejects(attemptSend(entry, async () => durable.push(structuredClone(entry)), async () => {
      if (failure === 'missing-id') return {};
      const error = new Error('provider failure'); if (typeof failure === 'number') error.$metadata = { httpStatusCode: failure }; throw error;
    }), error => error.state === expected);
    assert.equal(durable[0].state, 'attempt_started'); assert.equal(durable.at(-1).state, expected);
    assert.equal(hasUncertainAttempt({ tests: [entry] }), expected === 'uncertain');
  }
});
test('accepted message cannot become rejected on ledger write failure', async () => {
  const entry = {}; let writes = 0, durable;
  await assert.rejects(attemptSend(entry, async () => { if (++writes === 2) throw new Error('disk full'); durable = structuredClone(entry); }, async () => ({ MessageId: 'mock-id' })),
    error => error.state === 'accepted_ledger_write_failed');
  assert.equal(entry.state, 'accepted'); assert.equal(durable.state, 'attempt_started'); assert.equal(hasUncertainAttempt({ tests: [durable] }), true);
});
test('confirmed acceptance records message ID and exactly one dispatch', async () => {
  const entry = {}, durable = []; let calls = 0;
  await attemptSend(entry, async () => durable.push(structuredClone(entry)), async () => { calls++; return { MessageId: 'mock-id' }; });
  assert.equal(calls, 1); assert.equal(durable.at(-1).state, 'accepted'); assert.equal(entry.messageId, 'mock-id');
});
test('ledger lock prevents concurrent writer; atomic save preserves rejection/uncertainty evidence', async () => {
  const dir = await mkdtemp(`${tmpdir()}/ses-ledger-test-`), url = pathToFileURL(`${dir}/ledger.json`);
  const first = fileLedger(url), second = fileLedger(url);
  try {
    await first.acquire(); await assert.rejects(second.acquire(), error => error.code === 'EEXIST');
    await first.save({ tests: [{ state: 'uncertain' }] }); assert.equal((await first.read(null)).tests[0].state, 'uncertain');
  } finally { await first.close(); await second.close(); await rm(dir, { recursive: true, force: true }); }
});
test('historical stale Cloudflare snapshot cannot authorize AWS writes', () => {
  const config = { tenants: [{ rootDomain: 'example.com', zoneId: 'id' }] };
  const snapshot = { zone: { id: 'id', name: 'example.com', status: 'active' }, records: [] };
  assert.equal(typeof snapshotAdapter(snapshot, config).records, 'function');
  assert.throws(() => snapshotAdapter(snapshot, config, { write: true, now }), /last five minutes/);
  assert.throws(() => snapshotAdapter({ ...snapshot, capturedAt: '2026-10-11T12:00:00Z' }, config, { write: true, now }), /last five minutes/);
  assert.equal(typeof snapshotAdapter({ ...snapshot, capturedAt: '2026-10-11T12:59:00Z' }, config, { write: true, now }).records, 'function');
});
const settings = { accountId: '123456789012', region: 'ca-central-1', rootDomain: 'connectxmedia.com', topicName: 'ai-os-ses-feedback', feedbackEndpoint: 'https://api.example.com/api/email/ses/events' };
test('API sender policy permits five exact noreply+identity/configset pairs; SMTP roles have component scopes', () => {
  const policies = buildPolicies(settings), api = policies['runtime-api.example.json'];
  const sends = api.Statement.filter(s => s.Effect === 'Allow' && s.Action === 'ses:SendEmail');
  assert.equal(sends.length, 5); assert.equal(sends.every(s => !s.Resource.includes('*') && s.Resource.length === 2), true);
  assert.equal(sends.some(s => s.Resource.some(r => r.includes('outreach') || r.endsWith('/connectxmedia.com'))), false);
  assert.equal(sends.every(s => s.Condition.StringEquals['ses:FromAddress'].startsWith('noreply@')), true);
  const smtp = policies['mautic-smtp.example.json'].Statement.filter(s => s.Effect === 'Allow');
  assert.deepEqual(smtp.map(s => s.Condition.StringEquals['ses:FromAddress']), ['noreply@news.connectxmedia.com', 'noreply@offers.connectxmedia.com']);
  assert.equal(smtp.every(s => s.Action === 'ses:SendRawEmail'), true);
  assert.equal(JSON.stringify(api).includes('PutSuppressedDestination'), false);
});
test('SNS examples scope SES source ARNs, topic administration, and exact HTTPS subscription', () => {
  const p = buildPolicies(settings), publish = p['sns-topic-publish.example.json'].Statement[0];
  assert.equal(publish.Principal.Service, 'ses.amazonaws.com'); assert.equal(publish.Condition.StringEquals['AWS:SourceAccount'], settings.accountId);
  assert.equal(publish.Condition.StringEquals['AWS:SourceArn'].length, 6);
  const operator = p['sns-operator-managed.example.json'];
  assert.equal(operator.Statement.every(s => s.Resource === publish.Resource), true);
  const subscribe = operator.Statement.find(s => s.Action === 'sns:Subscribe');
  assert.equal(subscribe.Condition.StringEquals['sns:Endpoint'], settings.feedbackEndpoint); assert.equal(subscribe.Condition.StringEquals['sns:Protocol'], 'https');
  assert.equal(JSON.stringify(operator).includes('sns:Publish'), false);
});
