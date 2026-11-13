import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticatedUserId } from '../supabase/functions/_shared/auth.ts';

const url = 'https://example.supabase.co';
const key = 'public-project-key';
const request = token => new Request('https://example.test/save', {
  headers: token ? { Authorization: token } : {},
});

test('missing and malformed authorization cannot reach the Auth service', async () => {
  for (const token of [null, 'Basic credentials', 'Bearer', 'Bearer two tokens']) {
    assert.equal(await authenticatedUserId(request(token), url, key, () => {
      throw new Error('unexpected request');
    }), null);
  }
});

test('anonymous, expired and forged tokens do not identify a user', async () => {
  for (const token of ['anon-key', 'expired-token', 'forged-token']) {
    assert.equal(await authenticatedUserId(request(`Bearer ${token}`), url, key,
      async () => new Response('{}', { status: 401 })), null);
  }
});

test('only the verified Auth response supplies the owner, regardless of body user ID', async () => {
  const req = new Request('https://example.test/save', {
    method: 'POST', headers: { Authorization: 'Bearer user-session' },
    body: JSON.stringify({ user_id: 'another-user' }),
  });
  assert.equal(await authenticatedUserId(req, url, key, async (endpoint, options) => {
    assert.equal(endpoint, `${url}/auth/v1/user`);
    assert.equal(options.headers.authorization, 'Bearer user-session');
    assert.equal(options.headers.apikey, key);
    return Response.json({ id: 'verified-user' });
  }), 'verified-user');
});

test('malformed successful Auth responses fail closed', async () => {
  for (const user of [null, [], {}, { id: 123 }, { id: '' }]) {
    assert.equal(await authenticatedUserId(request('Bearer token'), url, key,
      async () => Response.json(user)), null);
  }
});
