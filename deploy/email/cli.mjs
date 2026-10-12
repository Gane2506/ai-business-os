#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { Resolver } from 'node:dns/promises';
import { validateConfig, plan, apply, status } from './core.mjs';

const args = process.argv.slice(2);
const mode = args.shift();
const allowed = new Set(['--config', '--report']);
let configPath, reportPath;
for (let i = 0; i < args.length; i += 2) {
  if (!allowed.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: node cli.mjs plan|apply|status --config FILE [--report FILE]');
  if (args[i] === '--config') { if (configPath) throw new Error('Duplicate --config'); configPath = args[i + 1]; }
  if (args[i] === '--report') { if (reportPath) throw new Error('Duplicate --report'); reportPath = args[i + 1]; }
}
let aws;
const journal = [];
try {
  if (!['plan', 'apply', 'status'].includes(mode) || !configPath) throw new Error('Usage: node cli.mjs plan|apply|status --config FILE [--report FILE]');
  const config = validateConfig(JSON.parse(await readFile(configPath, 'utf8')), process.env);
  const { awsAdapter, cloudflareAdapter } = await import('./adapters.mjs');
  aws = awsAdapter(config.region);
  const cf = cloudflareAdapter(process.env.CLOUDFLARE_API_TOKEN);
  let report;
  if (mode === 'plan') report = await plan(config, aws, cf);
  else {
    if (mode === 'apply') await apply(config, aws, cf, journal);
    report = await status(config, aws, cf, new Resolver({ timeout: 5000, tries: 2 }));
    if (mode === 'apply') report = { ...report, mode: 'apply', journal };
    if (!report.ready) process.exitCode = 2;
  }
  const output = JSON.stringify(report, null, 2);
  if (reportPath) await writeFile(reportPath, `${output}\n`, { mode: 0o600, flag: 'wx' });
  console.log(output);
} catch (error) {
  // Error message from provider may contain request data. Emit safe type and our own
  // validation/conflict messages only; no stack, raw AWS response, or env values.
  const localError = ['Error', 'Conflict', 'SyntaxError'].includes(error.name);
  const report = { mode, status: 'failed', partial: journal.length > 0, journal,
    error: { type: error.name, message: localError ? error.message : 'Provider operation failed; check account, region, permissions and quotas' } };
  const output = JSON.stringify(report, null, 2);
  if (reportPath) {
    try { await writeFile(reportPath, `${output}\n`, { mode: 0o600, flag: 'wx' }); } catch { /* Never replace previous evidence. */ }
  }
  console.error(output); process.exitCode = 1;
} finally { aws?.destroy(); }
