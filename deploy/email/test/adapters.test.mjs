import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudflareAdapter, awsAdapter } from '../adapters.mjs';

test('Cloudflare exact active zone resolution rejects mismatched ID/name and duplicate match', async () => {
  for (const zones of [[{ name: 'example.com', id: 'wrong', status: 'active' }], [{ name: 'www.example.com', id: 'expected', status: 'active' }],
    [{ name: 'example.com', id: 'expected', status: 'pending' }], [{ name: 'example.com', id: 'expected', status: 'active' }, { name: 'example.com', id: 'other', status: 'active' }]]) {
    const cf = cloudflareAdapter('fake-test-token', async () => ({ ok: true, json: async () => ({ success: true, errors: [], result: zones, result_info: { total_pages: 1 } }) }));
    await assert.rejects(cf.zone('example.com', 'expected'), /zone mismatch/);
  }
});
test('Cloudflare pagination reads full zone using bearer token and write supports POST only', async () => {
  const calls = [];
  const cf = cloudflareAdapter('fake-test-token', async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url), page = parsed.searchParams.get('page');
    return { ok: true, json: async () => ({ success: true, errors: [], result: options.method === 'POST' ? { id: 'new' } : [{ id: page }], result_info: { total_pages: 2 } }) };
  });
  assert.deepEqual((await cf.records('zone')).map(r => r.id), ['1', '2']);
  await cf.create('zone', { type: 'TXT', name: 'a.example.com', content: 'safe' });
  assert.deepEqual(calls.map(c => c.options.method), ['GET', 'GET', 'POST']);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fake-test-token');
  assert.equal(cf.update, undefined); assert.equal(cf.delete, undefined);
});
test('Cloudflare auth/error details are excluded from failure text', async () => {
  const cf = cloudflareAdapter('fake-test-token', async () => ({ ok: false, status: 403, json: async () => { throw new Error('must not read body'); } }));
  await assert.rejects(cf.records('zone'), /^Error: Cloudflare GET failed with HTTP 403$/);
  assert.throws(() => cloudflareAdapter(''), /restricted token/);
});
test('pinned SDK exports required SESv2 commands; adapter construction does not call network', () => {
  const aws = awsAdapter('ca-central-1'); assert.equal(typeof aws.createIdentity, 'function'); aws.destroy();
});
