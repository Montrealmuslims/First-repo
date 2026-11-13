import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skip, startApp } from './helpers.js';

describe('private deployment: signup allowlist', { skip }, () => {
  let ctx;
  before(async () => {
    process.env.SIGNUP_ALLOWED_EMAILS = 'mom@example.com, Dad@Example.com';
    ctx = await startApp();
  });
  after(async () => { delete process.env.SIGNUP_ALLOWED_EMAILS; await ctx?.close(); });

  const signup = (email) => ctx.call('POST', '/v1/auth/signup', { body: { email, password: 'long-password-1', fullName: 'X' } });

  test('listed emails can sign up (case-insensitive)', async () => {
    assert.equal((await signup('mom@example.com')).status, 201);
    assert.equal((await signup('DAD@example.com')).status, 201);
  });

  test('anyone else is refused', async () => {
    const r = await signup('stranger@example.com');
    assert.equal(r.status, 403);
    assert.match(r.body.error, /restricted/);
  });
});
