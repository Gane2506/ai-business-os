import { readFile, rename, open, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

export const ALLOWED_TEST_SENDERS = Object.freeze([
  'noreply@auth.connectxmedia.com', 'noreply@tx.connectxmedia.com',
  'noreply@mail.connectxmedia.com', 'noreply@news.connectxmedia.com', 'noreply@offers.connectxmedia.com',
]);
export function assertTestAuthorization(control, request, now = Date.now()) {
  if (control?.testSendingEnabled !== true) throw new Error('Test sending is disabled by the user; a new explicit human authorization is required');
  const a = control.authorization;
  if (!request.explicitInvocation || !a || a.approvedBy !== 'human-user' || !a.reference?.trim() ||
      !Number.isFinite(Date.parse(a.approvedAt)) || Date.parse(a.approvedAt) > now ||
      !Number.isFinite(Date.parse(a.expiresAt)) || Date.parse(a.expiresAt) <= now)
    throw new Error('New unexpired human authorization and explicit --authorized-test invocation required');
  if (!Number.isInteger(a.maxMessages) || a.maxMessages < request.maxMessages || a.maxMessages > 5 ||
      !Array.isArray(a.senders) || !Array.isArray(a.recipients) ||
      !a.recipients.includes(request.recipient) || request.senders.some(s => !ALLOWED_TEST_SENDERS.includes(s) || !a.senders.includes(s)))
    throw new Error('Requested send is outside the exact authorized sender/recipient/message scope');
  return a;
}
export async function loadTestAuthorization(request, args = process.argv.slice(2)) {
  const control = JSON.parse(await readFile(new URL('./send-control.json', import.meta.url), 'utf8'));
  return assertTestAuthorization(control, { ...request, explicitInvocation: args.length === 1 && args[0] === '--authorized-test' });
}
export const hasUncertainAttempt = ledger => ledger.tests.some(t => ['attempt_started', 'uncertain'].includes(t.state));
export class SendOutcomeError extends Error {
  constructor(state, message) { super(message); this.name = 'SendOutcomeError'; this.state = state; }
}
// SES SendEmail has no idempotency token; the caller must use maxAttempts:1.
export async function attemptSend(entry, persist, dispatch) {
  entry.state = 'attempt_started'; entry.attemptedAt = new Date().toISOString();
  await persist(); // An unwritten intent must never be dispatched.
  let response;
  try { response = await dispatch(); }
  catch (error) {
    const httpStatus = error.$metadata?.httpStatusCode;
    entry.state = Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus < 500 ? 'rejected' : 'uncertain';
    entry.errorType = error.name || 'UnknownError';
    if (Number.isInteger(httpStatus)) entry.httpStatus = httpStatus;
    await persist();
    throw new SendOutcomeError(entry.state, entry.state === 'rejected' ? 'SES explicitly rejected the attempt' : 'SES outcome is uncertain; inspect before any retry');
  }
  if (!response?.MessageId) {
    entry.state = 'uncertain'; entry.errorType = 'MissingMessageId'; await persist();
    throw new SendOutcomeError('uncertain', 'Missing SES message ID; inspect before any retry');
  }
  entry.state = 'accepted'; entry.messageId = response.MessageId; entry.acceptedAt = new Date().toISOString();
  try { await persist(); }
  catch { throw new SendOutcomeError('accepted_ledger_write_failed', `SES accepted message ${entry.messageId}; ledger write failed, inspect before any retry`); }
  return entry;
}
export function fileLedger(path) {
  const lockPath = new URL(`${path.href}.lock`), tmpPath = new URL(`${path.href}.tmp`);
  let lock;
  return {
    acquire: async () => { lock = await open(lockPath, 'wx', 0o600); },
    read: async fallback => { try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } },
    save: async ledger => {
      const file = await open(tmpPath, 'wx', 0o600);
      try { await file.writeFile(`${JSON.stringify(ledger, null, 2)}\n`); await file.sync(); }
      finally { await file.close(); }
      await rename(tmpPath, path);
      const directory = await open(dirname(fileURLToPath(path)), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    },
    close: async () => { if (lock) { await lock.close(); await unlink(lockPath); lock = undefined; } },
  };
}
