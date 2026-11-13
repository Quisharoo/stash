import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { authenticatedUserId, unauthorized } from '../supabase/functions/_shared/auth.ts';

const names = ['save-page', 'save-kindle', 'sync-twitter', 'auth-twitter', 'fetch-url'];

async function load(name, { owner = null, client = () => { throw new Error('unexpected privileged database access'); } } = {}) {
  const source = await readFile(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
  const runnable = stripTypeScriptTypes(source.replace(/^import .*;?\r?\n/gm, ''));
  let handler;
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-key', SUPABASE_SERVICE_ROLE_KEY: 'server-only-key' };
  const authenticate = (request, url, key) => authenticatedUserId(request, url, key, async () =>
    owner ? Response.json({ id: owner }) : new Response('{}', { status: 401 }));
  new Function('serve', 'createClient', 'Deno', 'authenticatedUserId', 'unauthorized', runnable)(
    value => { handler = value; }, client, { env: { get: key => env[key] } }, authenticate, unauthorized,
  );
  return handler;
}

for (const name of names) {
  test(`${name} rejects missing and invalid credentials before privileged work`, async () => {
    const handler = await load(name);
    for (const token of [null, 'Bearer anon-key', 'Bearer expired-user-token']) {
      const response = await handler(new Request('https://example.test/function', {
        method: 'POST', headers: token ? { Authorization: token } : {},
        body: JSON.stringify({ user_id: 'victim', userId: 'victim' }),
      }));
      assert.equal(response.status, 401);
    }
    assert.equal((await handler(new Request('https://example.test/function', { method: 'OPTIONS' }))).status, 200);
  });
}

test('save-page ignores a forged body owner and uses a session-scoped database client', async () => {
  let inserted;
  const handler = await load('save-page', { owner: 'real-owner', client: (url, key, options) => {
    assert.equal(key, 'public-key');
    assert.equal(options.global.headers.Authorization, 'Bearer valid-session');
    return { from: table => {
      assert.equal(table, 'saves');
      return { insert: row => { inserted = row; return {
        select: () => ({ single: async () => ({ data: row, error: null }) }),
      }; } };
    } };
  } });
  const response = await handler(new Request('https://example.test/function', {
    method: 'POST', headers: { Authorization: 'Bearer valid-session' },
    body: JSON.stringify({ user_id: 'victim', url: 'https://example.test/article',
      prefetched: { title: 'Synthetic article', content: 'Synthetic content' } }),
  }));
  assert.equal(response.status, 200);
  assert.equal(inserted.user_id, 'real-owner');
});

test('send-digest rejects user and anonymous credentials before reading or sending mail', async () => {
  const handler = await load('send-digest');
  for (const token of [null, 'Bearer anon-key', 'Bearer valid-user-session']) {
    const response = await handler(new Request('https://example.test/function', {
      method: 'POST', headers: token ? { Authorization: token } : {},
    }));
    assert.equal(response.status, 401);
  }
});
