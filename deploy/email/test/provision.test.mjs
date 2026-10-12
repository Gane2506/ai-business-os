import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, STREAMS, EVENTS, EVENT_DESTINATION, expectedRecords, reconcileDns, plan, apply, status, verifyDns } from '../core.mjs';

const config = () => validateConfig({ region: 'ca-central-1', snsTopicArn: 'arn:aws:sns:ca-central-1:123456789012:ses-feedback',
  tenants: [{ tenantId: 'tenant-a', rootDomain: 'example.com', outreachEnabled: false }] });
function fixture({ existing = true, verified = true, feedback = true } = {}) {
  const identities = new Map(), sets = new Map(), events = new Map(), mutations = [];
  const records = [
    { id: 'rootmx', type: 'MX', name: 'example.com', priority: 1, content: 'existing.mx.provider.test' },
    { id: 'rootspf', type: 'TXT', name: 'example.com', content: 'v=spf1 include:other.example ~all' },
    { id: 'rootdmarc', type: 'TXT', name: '_dmarc.example.com', content: 'v=DMARC1; p=reject' },
    { id: 'mailweb', type: 'CNAME', name: 'mail.example.com', content: 'example.com', proxied: true },
  ];
  const makeIdentity = (name, set) => ({ IdentityType: 'DOMAIN', ConfigurationSetName: set,
    VerifiedForSendingStatus: verified, VerificationStatus: verified ? 'SUCCESS' : 'PENDING',
    DkimAttributes: { SigningAttributesOrigin: 'AWS_SES', SigningEnabled: true, Status: verified ? 'SUCCESS' : 'PENDING',
      Tokens: ['tokena', 'tokenb', 'tokenc'], SigningHostedZone: 'dkim.actual-ses-zone.example' },
    MailFromAttributes: { MailFromDomain: `bounce.${name}`, MailFromDomainStatus: verified ? 'SUCCESS' : 'PENDING', BehaviorOnMxFailure: 'REJECT_MESSAGE' } });
  for (const stream of STREAMS) if (existing) {
    const name = `${stream.prefix}.example.com`, identity = makeIdentity(name, stream.configurationSet);
    identities.set(name, identity);
    sets.set(stream.configurationSet, { ConfigurationSetName: stream.configurationSet, SendingOptions: { SendingEnabled: true } });
    events.set(stream.configurationSet, feedback ? [{ Name: EVENT_DESTINATION, Enabled: true, MatchingEventTypes: [...EVENTS], SnsDestination: { TopicArn: config().snsTopicArn } }] : []);
    records.push(...expectedRecords({ identity: name, mailFrom: `bounce.${name}` }, identity, 'ca-central-1').map((record, i) => ({ ...record, id: `${name}-${i}` })));
  }
  const aws = {
    getAccount: async () => ({ SendingEnabled: true, ProductionAccessEnabled: true, SendQuota: { Max24HourSend: 5000, SentLast24Hours: 2, MaxSendRate: 10 } }),
    getIdentity: async name => identities.get(name) || null,
    getSet: async name => sets.get(name) || null,
    getEvents: async name => events.get(name) || [],
    createIdentity: async (name, set) => { mutations.push(['identity', name]); identities.set(name, makeIdentity(name, set)); },
    createSet: async name => { mutations.push(['set', name]); sets.set(name, { SendingOptions: { SendingEnabled: true } }); },
    createEvent: async (name, arn) => { mutations.push(['event', name]); events.set(name, [{ Name: EVENT_DESTINATION, Enabled: true, MatchingEventTypes: [...EVENTS], SnsDestination: { TopicArn: arn } }]); },
    enableDkim: async name => { mutations.push(['dkim', name]); identities.get(name).DkimAttributes.SigningEnabled = true; },
    associate: async (name, set) => { mutations.push(['associate', name]); identities.get(name).ConfigurationSetName = set; },
    mailFrom: async (name, mailFrom) => { mutations.push(['mailfrom', name]); identities.get(name).MailFromAttributes = { MailFromDomain: mailFrom, BehaviorOnMxFailure: 'REJECT_MESSAGE', MailFromDomainStatus: verified ? 'SUCCESS' : 'PENDING' }; },
  };
  const cf = {
    zone: async () => ({ id: 'zone-1' }),
    records: async (zone, name) => name ? records.filter(r => r.name === name) : [...records],
    create: async (zone, record) => { mutations.push(['dns', record.name]); const result = { ...record, id: `created-${records.length}` }; records.push(result); return result; },
  };
  const resolver = {
    resolveCname: async name => records.filter(r => r.name === name && r.type === 'CNAME').map(r => `${r.content}.`),
    resolveMx: async name => records.filter(r => r.name === name && r.type === 'MX').map(r => ({ exchange: `${r.content}.`, priority: r.priority })),
    resolveTxt: async name => records.filter(r => r.name === name && r.type === 'TXT').map(r => [r.content.slice(0, 8), r.content.slice(8)]),
  };
  return { aws, cf, resolver, records, identities, sets, events, mutations };
}

test('plan reads six explicit identities, does not write, and preserves root mail and same-name web CNAME', async () => {
  const f = fixture(); const before = structuredClone(f.records);
  const report = await plan(config(), f.aws, f.cf);
  assert.equal(report.rows.length, 6); assert.equal(report.rows.every(row => row.identityAction === 'keep'), true);
  assert.equal(report.rows.flatMap(row => row.dns).every(op => op.action === 'keep'), true);
  assert.deepEqual(f.mutations, []); assert.deepEqual(f.records, before);
});
test('apply is idempotent for fully configured identities', async () => {
  const f = fixture(); await apply(config(), f.aws, f.cf); await apply(config(), f.aws, f.cf);
  assert.deepEqual(f.mutations, []);
});
test('missing identities and configuration sets created once; root DNS untouched on rerun', async () => {
  const f = fixture({ existing: false }); const protectedRecords = structuredClone(f.records); const journal = [];
  const initial = await plan(config(), f.aws, f.cf);
  assert.equal(initial.rows.every(row => row.pendingDkimGeneration), true);
  await apply(config(), f.aws, f.cf, journal);
  assert.equal(f.identities.size, 6); assert.equal(f.sets.size, 6);
  assert.equal(f.mutations.filter(op => op[0] === 'dns').length, 36);
  assert.deepEqual(f.records.slice(0, 4), protectedRecords);
  const count = f.mutations.length; await apply(config(), f.aws, f.cf);
  assert.equal(f.mutations.length, count);
  assert.equal(journal.filter(op => op.action === 'created_identity').length, 6);
});
test('preflight SPF conflict in last stream stops all mutations', async () => {
  const f = fixture({ existing: false }); f.records.push({ type: 'TXT', name: 'bounce.outreach.example.com', content: 'v=spf1 -all' });
  await assert.rejects(apply(config(), f.aws, f.cf), /conflicts/); assert.deepEqual(f.mutations, []);
});
test('duplicate matching SPF is a conflict; unrelated TXT is preserved', () => {
  const desired = { type: 'TXT', name: 'bounce.auth.example.com', content: 'v=spf1 include:amazonses.com ~all' };
  assert.throws(() => reconcileDns(desired, [desired, desired]), /Duplicate/);
  assert.equal(reconcileDns(desired, [{ ...desired, content: 'unrelated-token' }]).action, 'create');
  assert.equal(reconcileDns(desired, [{ ...desired, content: `"${desired.content}"` }]).action, 'keep');
});
test('wrong or multiple MX fails closed', () => {
  const desired = { type: 'MX', name: 'bounce.tx.example.com', content: 'feedback-smtp.ca-central-1.amazonses.com', priority: 10 };
  assert.throws(() => reconcileDns(desired, [{ ...desired, content: 'other.mx.example' }]), /conflicts/);
  assert.throws(() => reconcileDns(desired, [desired, { ...desired, priority: 20 }]), /Duplicate/);
});
test('parent NS delegation below zone apex stops invisible child DNS writes', async () => {
  const f = fixture({ existing: false }); f.records.push({ type: 'NS', name: 'auth.example.com', content: 'ns.other.example' });
  await assert.rejects(apply(config(), f.aws, f.cf), /parent delegation/); assert.deepEqual(f.mutations, []);
});
test('proxied DKIM CNAME and delegated name fail closed', () => {
  const desired = { type: 'CNAME', name: 'a._domainkey.auth.example.com', content: 'a.dkim.example.com', proxied: false };
  assert.throws(() => reconcileDns(desired, [{ ...desired, proxied: true }]), /conflicts/);
  assert.throws(() => reconcileDns(desired, [{ type: 'NS', name: desired.name, content: 'ns.example.com' }]), /delegation/);
});
test('different existing configuration association is preserved', async () => {
  const f = fixture(); f.identities.get('auth.example.com').ConfigurationSetName = 'existing-owner';
  await assert.rejects(apply(config(), f.aws, f.cf), /association differs/); assert.deepEqual(f.mutations, []);
});
test('BYODKIM and unknown SigningHostedZone rejected rather than replaced/guessed', async () => {
  const f = fixture(); f.identities.get('auth.example.com').DkimAttributes.SigningAttributesOrigin = 'EXTERNAL';
  await assert.rejects(plan(config(), f.aws, f.cf), /Easy DKIM/);
  f.identities.get('auth.example.com').DkimAttributes.SigningAttributesOrigin = 'AWS_SES';
  delete f.identities.get('auth.example.com').DkimAttributes.SigningHostedZone;
  await assert.rejects(plan(config(), f.aws, f.cf), /SigningHostedZone missing/);
});
test('different existing MAIL FROM or dedicated pool stops apply', async () => {
  const f = fixture(); f.identities.get('auth.example.com').MailFromAttributes.MailFromDomain = 'old.example.com';
  await assert.rejects(apply(config(), f.aws, f.cf), /MAIL FROM differs/);
  f.identities.get('auth.example.com').MailFromAttributes.MailFromDomain = 'bounce.auth.example.com';
  f.sets.get('ses-auth').DeliveryOptions = { SendingPoolName: 'dedicated-pool' };
  await assert.rejects(apply(config(), f.aws, f.cf), /Dedicated IP/); assert.deepEqual(f.mutations, []);
});
test('safe missing association/DKIM signing and MAIL FROM are reconciled', async () => {
  const f = fixture(); const state = f.identities.get('auth.example.com');
  delete state.ConfigurationSetName; delete state.MailFromAttributes; state.DkimAttributes.SigningEnabled = false;
  await apply(config(), f.aws, f.cf);
  assert.deepEqual(f.mutations.map(m => m[0]), ['dkim', 'associate', 'mailfrom']);
});
test('DNS conflict arriving after preflight is caught before POST', async () => {
  const f = fixture({ existing: false }); const oldRecords = f.cf.records;
  let reads = 0;
  f.cf.records = async (zone, name) => { const records = await oldRecords(zone, name); return ++reads >= 3 ? [...records, { type: 'MX', name: 'bounce.auth.example.com', content: 'race.mx.example', priority: 10 }] : records; };
  const journal = []; await assert.rejects(apply(config(), f.aws, f.cf, journal), /conflicts/);
  assert.equal(f.mutations.some(m => m[0] === 'dns'), false); assert.equal(journal.some(j => j.action === 'created_identity'), true);
});
test('partial journal retained when quota exception halts apply', async () => {
  const f = fixture({ existing: false }); let n = 0;
  const original = f.aws.createIdentity;
  f.aws.createIdentity = async (...args) => { if (++n === 2) { const error = new Error('quota'); error.name = 'LimitExceededException'; throw error; } return original(...args); };
  const journal = []; await assert.rejects(apply(config(), f.aws, f.cf, journal), /quota/);
  assert.equal(f.identities.size, 1); assert.equal(f.mutations.some(m => m[0] === 'dns'), false);
  assert.equal(journal.filter(j => j.action === 'created_identity').length, 1);
});
test('status never reports ready based on DNS writes alone', async () => {
  const f = fixture({ verified: false }); const report = await status(config(), f.aws, f.cf, f.resolver);
  assert.equal(report.ready, false); assert.equal(report.rows[0].dnsConfigured, true); assert.equal(report.rows[0].dnsVerified, true);
  assert.equal(report.rows[0].status, 'pending_verification'); assert.equal(report.rows[0].sendingEnabled, false);
});
test('SES verification and actual public DNS required; outreach remains disabled', async () => {
  const f = fixture(); let report = await status(config(), f.aws, f.cf, f.resolver);
  assert.equal(report.ready, true); assert.equal(report.rows[0].status, 'ready'); assert.equal(report.rows[5].status, 'disabled');
  f.resolver.resolveCname = async () => ['wrong.dkim.example'];
  report = await status(config(), f.aws, f.cf, f.resolver); assert.equal(report.ready, false); assert.equal(report.rows[0].sendingEnabled, false);
});
test('status verification failure is explicit', async () => {
  const f = fixture(); f.identities.get('auth.example.com').DkimAttributes.Status = 'FAILED';
  const report = await status(config(), f.aws, f.cf, f.resolver);
  assert.equal(report.rows[0].status, 'failed'); assert.equal(report.ready, false);
});
test('account sandbox/paused config set/quota/event destination blocks production ready', async () => {
  for (const gate of ['sandbox', 'paused', 'quota', 'feedback']) {
    const f = fixture({ feedback: gate !== 'feedback' });
    if (gate === 'sandbox') f.aws.getAccount = async () => ({ SendingEnabled: true, ProductionAccessEnabled: false });
    if (gate === 'paused') f.sets.get('ses-auth').SendingOptions.SendingEnabled = false;
    if (gate === 'quota') f.aws.getAccount = async () => ({ SendingEnabled: true, ProductionAccessEnabled: true, SendQuota: { Max24HourSend: 10, SentLast24Hours: 10, MaxSendRate: 1 } });
    const report = await status(config(), f.aws, f.cf, f.resolver);
    assert.equal(report.ready, false, gate); assert.equal(report.rows[0].sendingEnabled, false, gate);
  }
});
test('DNS timeout returns pending; unexpected resolver failure propagates', async () => {
  const desired = { type: 'CNAME', name: 'x.example.com', content: 'y.example.com' };
  assert.equal(await verifyDns(desired, { resolveCname: async () => { const e = new Error(); e.code = 'ETIMEOUT'; throw e; } }), false);
  await assert.rejects(verifyDns(desired, { resolveCname: async () => { throw new Error('broken resolver'); } }), /broken resolver/);
});
test('SNS destination is optional and conflicts never overwrite existing destination', async () => {
  const f = fixture(); const noSns = { ...config(), snsTopicArn: '' };
  await apply(noSns, f.aws, f.cf); assert.deepEqual(f.mutations, []);
  f.events.get('ses-auth')[0].SnsDestination.TopicArn = 'arn:aws:sns:ca-central-1:123456789012:other-topic';
  await assert.rejects(apply(config(), f.aws, f.cf), /event destination differs/); assert.deepEqual(f.mutations, []);
});
test('region, multiple tenant mapping, duplicates and exact SNS region validated', () => {
  assert.throws(() => validateConfig({ tenants: config().tenants }), /region required/);
  assert.throws(() => validateConfig({ ...config(), snsTopicArn: 'arn:aws:sns:us-east-1:123456789012:topic' }), /exact standard/);
  assert.throws(() => validateConfig({ ...config(), tenants: [...config().tenants, ...config().tenants] }), /Duplicate/);
  const multi = validateConfig({ ...config(), tenants: [...config().tenants, { tenantId: 'b', rootDomain: 'client.example' }] });
  assert.equal(multi.tenants.length, 2);
});
