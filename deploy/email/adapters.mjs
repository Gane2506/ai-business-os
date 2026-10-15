import * as sdk from '@aws-sdk/client-sesv2';
import { EVENTS, EVENT_DESTINATION, Conflict } from './core.mjs';

export function awsAdapter(region) {
  // Standard AWS credential provider chain; credentials never enter CLI args or reports.
  const client = new sdk.SESv2Client({ region, maxAttempts: 3 });
  const call = (command, input = {}) => client.send(new sdk[`${command}Command`](input));
  const optional = async (command, input) => {
    try { return await call(command, input); }
    catch (error) { if (error.name === 'NotFoundException') return null; throw error; }
  };
  const create = async (command, input) => {
    try { await call(command, input); return true; }
    catch (error) { if (error.name === 'AlreadyExistsException') return false; throw error; }
  };
  return {
    getAccount: () => call('GetAccount'),
    getIdentity: EmailIdentity => optional('GetEmailIdentity', { EmailIdentity }),
    getSet: ConfigurationSetName => optional('GetConfigurationSet', { ConfigurationSetName }),
    getEvents: async ConfigurationSetName => (await call('GetConfigurationSetEventDestinations', { ConfigurationSetName })).EventDestinations || [],
    createSet: ConfigurationSetName => create('CreateConfigurationSet', { ConfigurationSetName,
      SendingOptions: { SendingEnabled: true }, ReputationOptions: { ReputationMetricsEnabled: true },
      SuppressionOptions: { SuppressedReasons: ['BOUNCE', 'COMPLAINT'] } }),
    createIdentity: (EmailIdentity, ConfigurationSetName) => create('CreateEmailIdentity', {
      EmailIdentity, ConfigurationSetName, DkimSigningAttributes: { NextSigningKeyLength: 'RSA_2048_BIT' } }),
    enableDkim: EmailIdentity => call('PutEmailIdentityDkimAttributes', { EmailIdentity, SigningEnabled: true }),
    associate: (EmailIdentity, ConfigurationSetName) => call('PutEmailIdentityConfigurationSetAttributes', { EmailIdentity, ConfigurationSetName }),
    mailFrom: (EmailIdentity, MailFromDomain) => call('PutEmailIdentityMailFromAttributes', { EmailIdentity, MailFromDomain, BehaviorOnMxFailure: 'REJECT_MESSAGE' }),
    createEvent: (ConfigurationSetName, TopicArn) => create('CreateConfigurationSetEventDestination', {
      ConfigurationSetName, EventDestinationName: EVENT_DESTINATION,
      EventDestination: { Enabled: true, MatchingEventTypes: EVENTS, SnsDestination: { TopicArn } } }),
    destroy: () => client.destroy(),
  };
}

export function cloudflareAdapter(token, fetcher = fetch) {
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN required (restricted token only)');
  const request = async (path, method = 'GET', body) => {
    const response = await fetcher(`https://api.cloudflare.com/client/v4${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
    });
    // Never expose response bodies or credentials from provider errors.
    if (!response.ok) throw new Error(`Cloudflare ${method} failed with HTTP ${response.status}`);
    const result = await response.json();
    if (!result.success || !Array.isArray(result.errors) || result.errors.length)
      throw new Error(`Cloudflare ${method} returned unsuccessful API result`);
    return result;
  };
  const list = async path => {
    const results = [];
    for (let page = 1; ; page++) {
      const body = await request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      if (!Array.isArray(body.result)) throw new Error('Invalid Cloudflare list result');
      results.push(...body.result);
      const pages = body.result_info?.total_pages;
      if (pages !== undefined ? page >= pages : body.result.length < 100) break;
      if (page >= 10000) throw new Error('Cloudflare pagination exceeded bound');
    }
    return results;
  };
  return {
    zone: async (rootDomain, expectedId) => {
      const matches = (await list(`/zones?name=${encodeURIComponent(rootDomain)}`)).filter(z => z.name === rootDomain);
      if (matches.length !== 1 || matches[0].status !== 'active' || (expectedId && matches[0].id !== expectedId))
        throw new Conflict(`Cloudflare exact active zone mismatch for ${rootDomain}`);
      return matches[0];
    },
    records: (zoneId, name) => list(`/zones/${zoneId}/dns_records${name ? `?name=${encodeURIComponent(name)}` : ''}`),
    create: async (zoneId, record) => (await request(`/zones/${zoneId}/dns_records`, 'POST', record)).result,
  };
}
