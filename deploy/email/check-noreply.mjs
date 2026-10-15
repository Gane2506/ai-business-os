import { loadTestAuthorization, attemptSend, fileLedger } from './send-safety.mjs';

const from = 'noreply@auth.connectxmedia.com', recipient = 'admin@example.com';
let client, store;
try {
  // Check persisted prohibition before SDK, credentials, network, or ledger mutation.
  const authorization = await loadTestAuthorization({ senders: [from], recipient, maxMessages: 1 });
  const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2');
  store = fileLedger(new URL('./noreply-confirmation.json', import.meta.url)); await store.acquire();
  const previous = await store.read(null);
  if (previous && previous.status !== 'rejected') throw new Error('Previous confirmation outcome requires review; no resend');
  client = new SESv2Client({ region: 'ca-central-1', maxAttempts: 1 });
  const entry = { from, to: recipient, configurationSet: 'ses-auth', authorizationReference: authorization.reference, deliveryVerified: false };
  await attemptSend(entry, () => store.save({ ...entry, status: entry.state }), () => client.send(new SendEmailCommand({
    FromEmailAddress: from, Destination: { ToAddresses: [recipient] }, ConfigurationSetName: 'ses-auth',
    Content: { Simple: { Subject: { Data: 'AI Business OS — authorized noreply confirmation', Charset: 'UTF-8' },
      Body: { Text: { Data: 'Separately authorized noreply confirmation. SES acceptance does not confirm inbox delivery.', Charset: 'UTF-8' } } } },
  })));
  console.log(JSON.stringify(entry));
} catch (error) {
  console.error(JSON.stringify({ status: 'stopped', errorType: error.name, outcome: error.state,
    reason: ['Error', 'SendOutcomeError'].includes(error.name) ? error.message : 'Provider operation failed; no automatic retry' }));
  process.exitCode = 1;
} finally { client?.destroy(); await store?.close(); }
