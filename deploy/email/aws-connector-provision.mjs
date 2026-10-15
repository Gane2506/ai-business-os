import { readFile, writeFile } from 'node:fs/promises';
import { validateConfig } from './core.mjs';
import { runSnapshotBridge } from './snapshot-bridge.mjs';

let aws;
const journal = [];
try {
  const [mode, snapshotPath, configPath, reportPath, ...extra] = process.argv.slice(2);
  // Historical bridge used to mutate on invocation. Require explicit mode and
  // fresh snapshot/config; never reuse immutable historical evidence implicitly.
  if (!['plan', 'apply-aws'].includes(mode) || !snapshotPath || !configPath || !reportPath || extra.length)
    throw new Error('Usage: node aws-connector-provision.mjs plan|apply-aws SNAPSHOT CONFIG NEW_REPORT');
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  const config = validateConfig(JSON.parse(await readFile(configPath, 'utf8')), process.env);
  const { snapshotAdapter } = await import('./snapshot-bridge.mjs');
  snapshotAdapter(snapshot, config, { write: mode === 'apply-aws' });
  const { awsAdapter } = await import('./adapters.mjs'); aws = awsAdapter(config.region);
  const report = await runSnapshotBridge(mode, snapshot, config, aws, journal);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, mode, operations: journal.length, dnsRecordCount: report.dnsRecords.length }));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', partial: journal.length > 0, errorType: error.name, journal,
    message: ['Error', 'Conflict'].includes(error.name) ? error.message : 'Provider operation failed; inspect before rerun' }));
  process.exitCode = 1;
} finally { aws?.destroy(); }
