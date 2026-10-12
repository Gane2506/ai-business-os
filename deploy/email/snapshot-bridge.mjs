import { Conflict, plan, applyAwsPlan } from './core.mjs';

export function snapshotAdapter(snapshot, config, { write = false, now = Date.now() } = {}) {
  if (!snapshot?.zone || !Array.isArray(snapshot.records) || config.tenants.length !== 1) throw new Error('One exact tenant and Cloudflare snapshot required');
  const tenant = config.tenants[0];
  if (snapshot.zone.name !== tenant.rootDomain || snapshot.zone.status !== 'active' || !tenant.zoneId || snapshot.zone.id !== tenant.zoneId)
    throw new Conflict('Snapshot must match the exact active zone name and configured ID');
  if (write && (!Number.isFinite(Date.parse(snapshot.capturedAt)) || now - Date.parse(snapshot.capturedAt) > 300000 || Date.parse(snapshot.capturedAt) > now))
    throw new Error('AWS apply requires a Cloudflare connector snapshot captured within the last five minutes; refresh instead of reusing stale evidence');
  return { zone: async () => snapshot.zone, records: async () => structuredClone(snapshot.records) };
}
export async function runSnapshotBridge(mode, snapshot, config, aws, journal = []) {
  if (!['plan', 'apply-aws'].includes(mode)) throw new Error('Snapshot bridge requires explicit plan or apply-aws mode');
  const cf = snapshotAdapter(snapshot, config, { write: mode === 'apply-aws' });
  const before = await plan(config, aws, cf);
  if (mode === 'apply-aws') await applyAwsPlan(config, before, aws, journal);
  const after = mode === 'apply-aws' ? await plan(config, aws, cf) : before;
  return { checkedAt: new Date().toISOString(), region: config.region, mode,
    status: mode === 'apply-aws' ? 'aws_configured_dns_not_live_verified' : 'snapshot_plan_not_live_verified',
    dnsSource: 'cloudflare_connector_snapshot', snapshotCapturedAt: snapshot.capturedAt || null,
    journal, dnsRecords: after.rows.flatMap(row => row.dns),
    identities: after.rows.map(row => ({ domain: row.identity, configurationSet: row.configurationSet,
      dkimStatus: row.state?.DkimAttributes?.Status, verified: row.state?.VerifiedForSendingStatus, mailFrom: row.state?.MailFromAttributes })),
    feedbackConfigured: after.feedbackConfigured, feedbackDeliveryVerified: false, testEmailsSent: 0 };
}
