export const STREAMS = Object.freeze([
  { stream: 'AUTH', prefix: 'auth', configurationSet: 'ses-auth' },
  { stream: 'TRANSACTIONAL', prefix: 'tx', configurationSet: 'ses-transactional' },
  { stream: 'COMMUNICATION', prefix: 'mail', configurationSet: 'ses-communication' },
  { stream: 'MARKETING', prefix: 'news', configurationSet: 'ses-marketing' },
  { stream: 'PROMOTIONAL', prefix: 'offers', configurationSet: 'ses-promotional' },
  { stream: 'OUTREACH', prefix: 'outreach', configurationSet: 'ses-outreach' },
]);
export const EVENTS = ['SEND', 'DELIVERY', 'BOUNCE', 'COMPLAINT', 'REJECT', 'DELIVERY_DELAY', 'RENDERING_FAILURE'];
export const EVENT_DESTINATION = 'ai-os-feedback';
const fqdn = value => String(value).toLowerCase().replace(/\.$/, '');
const txt = value => String(value).replace(/^"(.*)"$/, '$1');
const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export class Conflict extends Error { constructor(message) { super(message); this.name = 'Conflict'; } }

export function validateConfig(raw, env = {}) {
  const region = raw.region || env.AWS_SES_REGION;
  // Commercial AWS partition only: fail closed instead of guessing China/GovCloud DNS.
  if (!/^(?:us|eu|ap|sa|ca|me|af|il|mx)-(?:north|south|east|west|central|northeast|southeast)-\d$/.test(region || ''))
    throw new Error('Explicit commercial AWS SES region required in config.region or AWS_SES_REGION');
  if (!Array.isArray(raw.tenants) || !raw.tenants.length) throw new Error('At least one tenant required');
  const roots = new Set(), ids = new Set();
  const tenants = raw.tenants.map(t => {
    const rootDomain = fqdn(t.rootDomain);
    if (!domainPattern.test(rootDomain) || rootDomain.length > 230) throw new Error('Invalid rootDomain');
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(t.tenantId || '')) throw new Error('Invalid tenantId');
    if (roots.has(rootDomain) || ids.has(t.tenantId)) throw new Error('Duplicate tenant/domain');
    roots.add(rootDomain); ids.add(t.tenantId);
    if (t.zoneId && !/^[a-f0-9]{32}$/.test(t.zoneId)) throw new Error('Invalid Cloudflare zoneId');
    if (t.outreachEnabled !== undefined && typeof t.outreachEnabled !== 'boolean') throw new Error('outreachEnabled must be boolean');
    return { tenantId: t.tenantId, rootDomain, zoneId: t.zoneId, outreachEnabled: t.outreachEnabled === true };
  });
  const snsTopicArn = raw.snsTopicArn || '';
  if (snsTopicArn && !new RegExp(`^arn:aws:sns:${region}:\\d{12}:[A-Za-z0-9_-]{1,256}$`).test(snsTopicArn))
    throw new Error('SNS topic must be an exact standard topic ARN in the SES region');
  return { region, tenants, snsTopicArn };
}

export function expectedRecords(row, identity, region) {
  const records = [
    { type: 'MX', name: row.mailFrom, content: `feedback-smtp.${region}.amazonses.com`, priority: 10, ttl: 300 },
    { type: 'TXT', name: row.mailFrom, content: 'v=spf1 include:amazonses.com ~all', ttl: 300 },
    { type: 'TXT', name: `_dmarc.${row.identity}`, content: 'v=DMARC1; p=none; adkim=r; aspf=r', ttl: 300 },
  ];
  if (identity) {
    const attrs = identity.DkimAttributes;
    if (!attrs?.Tokens?.length || !domainPattern.test(attrs.SigningHostedZone || ''))
      throw new Conflict(`Easy DKIM tokens/SigningHostedZone missing for ${row.identity}; update SDK or inspect identity`);
    if (attrs.Tokens.length !== 3 || attrs.Tokens.some(token => !/^[a-z0-9]+$/.test(token)))
      throw new Conflict(`Unexpected Easy DKIM tokens for ${row.identity}`);
    for (const token of attrs.Tokens) records.push({
      type: 'CNAME', name: `${token}._domainkey.${row.identity}`,
      content: `${token}.${fqdn(attrs.SigningHostedZone)}`, ttl: 300, proxied: false,
    });
  }
  return records;
}

export function reconcileDns(desired, existing, rootDomain) {
  if (existing.some(r => r.type === 'NS' && fqdn(r.name) !== rootDomain && fqdn(desired.name).endsWith(`.${fqdn(r.name)}`)))
    throw new Conflict(`DNS parent delegation conflict at ${desired.name}`);
  const atName = existing.filter(r => fqdn(r.name) === fqdn(desired.name));
  if (atName.some(r => r.type === 'CNAME' && desired.type !== 'CNAME') ||
      (desired.type === 'CNAME' && atName.some(r => r.type !== 'CNAME')) || atName.some(r => r.type === 'NS'))
    throw new Conflict(`DNS alias/delegation conflict at ${desired.name}`);
  let managed = atName.filter(r => r.type === desired.type);
  if (desired.type === 'TXT') {
    const prefix = desired.content.startsWith('v=spf1') ? /^v=spf1(?:\s|$)/i : /^v=DMARC1(?:;|\s|$)/i;
    managed = managed.filter(r => prefix.test(txt(r.content)));
  }
  if (managed.length > 1) throw new Conflict(`Duplicate ${desired.type} policies/records at ${desired.name}`);
  if (!managed.length) return { action: 'create', record: desired };
  const actual = managed[0];
  const equalContent = desired.type === 'TXT' ? txt(actual.content) === desired.content : fqdn(actual.content) === fqdn(desired.content);
  if (!equalContent || (desired.type === 'MX' && actual.priority !== desired.priority) || (desired.type === 'CNAME' && actual.proxied !== false))
    throw new Conflict(`Existing ${desired.type} record conflicts at ${desired.name}; preserve and resolve manually`);
  return { action: 'keep', record: desired, recordId: actual.id };
}

export function checkIdentity(row, identity) {
  if (!identity) return;
  if (identity.IdentityType !== 'DOMAIN') throw new Conflict(`Expected explicit domain identity ${row.identity}`);
  if (identity.DkimAttributes?.SigningAttributesOrigin !== 'AWS_SES') throw new Conflict(`Existing identity ${row.identity} does not use local Easy DKIM`);
  if (identity.ConfigurationSetName && identity.ConfigurationSetName !== row.configurationSet)
    throw new Conflict(`Existing configuration set association differs at ${row.identity}`);
  if (identity.MailFromAttributes?.MailFromDomain && fqdn(identity.MailFromAttributes.MailFromDomain) !== row.mailFrom)
    throw new Conflict(`Existing MAIL FROM differs at ${row.identity}`);
}
function checkSet(name, set) {
  if (set?.DeliveryOptions?.SendingPoolName) throw new Conflict(`Dedicated IP pool assigned to ${name}`);
  // Existing administratively disabled sets are preserved, not re-enabled.
}
function eventMatches(event, topicArn) {
  return !!event && event.Enabled === true && event.SnsDestination?.TopicArn === topicArn &&
    !event.CloudWatchDestination && !event.KinesisFirehoseDestination && !event.PinpointDestination && !event.EventBridgeDestination &&
    EVENTS.every(type => event.MatchingEventTypes?.includes(type));
}

export async function plan(config, aws, cloudflare) {
  const account = await aws.getAccount();
  const sets = {};
  for (const { configurationSet } of STREAMS) {
    const state = await aws.getSet(configurationSet); checkSet(configurationSet, state);
    const events = state ? await aws.getEvents(configurationSet) : [];
    const managed = events.find(e => e.Name === EVENT_DESTINATION);
    if (config.snsTopicArn && managed && !eventMatches(managed, config.snsTopicArn))
      throw new Conflict(`Existing event destination differs at ${configurationSet}`);
    sets[configurationSet] = { action: state ? 'keep' : 'create', state, events,
      eventAction: config.snsTopicArn ? (managed ? 'keep' : 'create') : 'not_configured' };
  }
  const rows = [], zones = [];
  for (const tenant of config.tenants) {
    const zone = await cloudflare.zone(tenant.rootDomain, tenant.zoneId);
    const records = await cloudflare.records(zone.id);
    zones.push({ tenantId: tenant.tenantId, zoneId: zone.id, rootDomain: tenant.rootDomain });
    for (const stream of STREAMS) {
      const identity = `${stream.prefix}.${tenant.rootDomain}`;
      const row = { tenantId: tenant.tenantId, rootDomain: tenant.rootDomain, stream: stream.stream,
        identity, mailFrom: `bounce.${identity}`, configurationSet: stream.configurationSet,
        zoneId: zone.id, enabledByPolicy: stream.stream !== 'OUTREACH' || tenant.outreachEnabled };
      const state = await aws.getIdentity(identity); checkIdentity(row, state);
      const dns = expectedRecords(row, state, config.region).map(record => reconcileDns(record, records, row.rootDomain));
      rows.push({ ...row, identityAction: state ? 'keep' : 'create', state, dns,
        pendingDkimGeneration: !state, dkimAction: !state || state.DkimAttributes.SigningEnabled ? 'keep' : 'enable',
        associationAction: state?.ConfigurationSetName ? 'keep' : 'associate',
        mailFromAction: state?.MailFromAttributes?.MailFromDomain === row.mailFrom &&
          state?.MailFromAttributes?.BehaviorOnMxFailure === 'REJECT_MESSAGE' && state?.MailFromAttributes?.MailFromDomainStatus !== 'FAILED' ? 'keep' : 'configure' });
    }
  }
  return { mode: 'plan', region: config.region, account, sets, zones, rows,
    feedbackConfigured: !!config.snsTopicArn, status: 'planned_not_verified' };
}

export async function applyAwsPlan(config, before, aws, journal = []) {
  // Entire known DNS/SES state has been inspected before any mutation.
  for (const [name, set] of Object.entries(before.sets)) {
    if (set.action === 'create') {
      const created = await aws.createSet(name); checkSet(name, await aws.getSet(name));
      journal.push({ resource: name, action: created === false ? 'configuration_set_already_existed' : 'created_configuration_set' });
    }
    if (set.eventAction === 'create') {
      const created = await aws.createEvent(name, config.snsTopicArn);
      const current = (await aws.getEvents(name)).find(event => event.Name === EVENT_DESTINATION);
      if (!eventMatches(current, config.snsTopicArn)) throw new Conflict(`Event destination differs after create at ${name}`);
      journal.push({ resource: name, action: created === false ? 'event_destination_already_existed' : 'created_event_destination' });
    }
  }
  for (const row of before.rows) {
    if (row.identityAction === 'create') {
      const created = await aws.createIdentity(row.identity, row.configurationSet);
      journal.push({ resource: row.identity, action: created === false ? 'identity_already_existed' : 'created_identity' });
    }
    // Re-read after create (and even after AlreadyExists races); never trust a stale plan.
    const current = await aws.getIdentity(row.identity); checkIdentity(row, current);
    if (!current) throw new Error(`Identity missing after creation: ${row.identity}`);
    if (!current.DkimAttributes.SigningEnabled) { await aws.enableDkim(row.identity); journal.push({ resource: row.identity, action: 'enabled_dkim' }); }
    if (!current.ConfigurationSetName) { await aws.associate(row.identity, row.configurationSet); journal.push({ resource: row.identity, action: 'associated_configuration_set' }); }
    if (current.MailFromAttributes?.MailFromDomain !== row.mailFrom || current.MailFromAttributes?.BehaviorOnMxFailure !== 'REJECT_MESSAGE' || current.MailFromAttributes?.MailFromDomainStatus === 'FAILED') {
      await aws.mailFrom(row.identity, row.mailFrom); journal.push({ resource: row.identity, action: 'configured_mail_from' });
    }
  }
  return journal;
}

export async function apply(config, aws, cloudflare, journal = []) {
  const before = await plan(config, aws, cloudflare);
  await applyAwsPlan(config, before, aws, journal);
  const after = await plan(config, aws, cloudflare);
  for (const row of after.rows) for (const operation of row.dns) {
    // Recheck live Cloudflare name before POST. No update/delete API is provided.
    const fresh = await cloudflare.records(row.zoneId);
    const op = reconcileDns(operation.record, fresh, row.rootDomain);
    if (op.action === 'create') {
      const result = await cloudflare.create(row.zoneId, op.record);
      journal.push({ resource: op.record.name, type: op.record.type, zoneId: row.zoneId, recordId: result.id, action: 'created_dns' });
    }
  }
  return journal;
}

export async function verifyDns(record, resolver) {
  try {
    if (record.type === 'CNAME') return (await resolver.resolveCname(record.name)).map(fqdn).includes(fqdn(record.content));
    if (record.type === 'MX') {
      const mx = await resolver.resolveMx(record.name);
      return mx.length === 1 && fqdn(mx[0].exchange) === fqdn(record.content) && mx[0].priority === record.priority;
    }
    const txtRecords = (await resolver.resolveTxt(record.name)).map(chunks => chunks.join(''));
    const prefix = record.content.startsWith('v=spf1') ? /^v=spf1(?:\s|$)/i : /^v=DMARC1(?:;|\s|$)/i;
    const policies = txtRecords.filter(t => prefix.test(t));
    return policies.length === 1 && policies[0] === record.content;
  } catch (error) {
    if (['ENOTFOUND', 'ENODATA', 'ETIMEOUT', 'ESERVFAIL', 'EREFUSED'].includes(error.code)) return false;
    throw error;
  }
}

export async function status(config, aws, cloudflare, resolver) {
  const snapshot = await plan(config, aws, cloudflare);
  const report = { mode: 'status', region: config.region, checkedAt: new Date().toISOString(),
    account: { sendingEnabled: snapshot.account.SendingEnabled === true, productionAccessEnabled: snapshot.account.ProductionAccessEnabled === true,
      sendQuota: snapshot.account.SendQuota }, rows: [] };
  for (const row of snapshot.rows) {
    const checks = [];
    for (const op of row.dns) checks.push({ type: op.record.type, name: op.record.name, cloudflare: op.action === 'keep', resolves: await verifyDns(op.record, resolver) });
    const ses = row.state;
    const dkimVerified = !!ses?.DkimAttributes?.SigningEnabled && ses?.DkimAttributes?.Status === 'SUCCESS';
    const mailFromVerified = ses?.MailFromAttributes?.MailFromDomain === row.mailFrom && ses?.MailFromAttributes?.MailFromDomainStatus === 'SUCCESS' && ses?.MailFromAttributes?.BehaviorOnMxFailure === 'REJECT_MESSAGE';
    const configSet = snapshot.sets[row.configurationSet];
    const configurationSetReady = configSet.action === 'keep' && configSet.state?.SendingOptions?.SendingEnabled === true && ses?.ConfigurationSetName === row.configurationSet;
    const feedbackConfigured = !!config.snsTopicArn && configSet.eventAction === 'keep';
    const dnsConfigured = !row.pendingDkimGeneration && checks.every(check => check.cloudflare);
    const dnsVerified = dnsConfigured && checks.every(check => check.resolves);
    const verified = !!ses?.VerifiedForSendingStatus && ses?.VerificationStatus === 'SUCCESS' && dkimVerified && mailFromVerified && dnsVerified && configurationSetReady;
    const accountEnabled = report.account.sendingEnabled && report.account.productionAccessEnabled;
    const quota = report.account.sendQuota;
    const quotaAvailable = quota?.MaxSendRate > 0 && quota?.Max24HourSend > (quota?.SentLast24Hours ?? quota?.Max24HourSend);
    const failed = ses?.VerificationStatus === 'FAILED' || ses?.DkimAttributes?.Status === 'FAILED' || ses?.MailFromAttributes?.MailFromDomainStatus === 'FAILED';
    const ready = verified && accountEnabled && quotaAvailable && feedbackConfigured && row.enabledByPolicy;
    report.rows.push({ tenantId: row.tenantId, stream: row.stream, identity: row.identity, configurationSet: row.configurationSet,
      identityExists: !!ses, dnsConfigured, dnsVerified, dnsChecks: checks, dkimVerified, mailFromVerified,
      dmarcVerified: checks.find(c => c.name === `_dmarc.${row.identity}`)?.resolves === true,
      sesVerified: ses?.VerifiedForSendingStatus === true && ses?.VerificationStatus === 'SUCCESS', configurationSetReady,
      feedbackConfigured, feedbackDeliveryVerified: false, quotaAvailable, enabledByPolicy: row.enabledByPolicy,
      sendingEnabled: ready, status: !row.enabledByPolicy ? 'disabled' : failed ? 'failed' : ready ? 'ready' : !ses ? 'not_created' : verified ? 'verified_sending_blocked' : dnsConfigured ? 'pending_verification' : 'created_dns_pending' });
  }
  report.ready = report.rows.every(row => row.status === 'ready' || (row.status === 'disabled' && row.stream === 'OUTREACH' && row.sesVerified && row.dnsVerified && row.mailFromVerified && row.dkimVerified));
  return report;
}
