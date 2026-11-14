import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skip, startApp, setupFamily } from './helpers.js';

describe('family members (co-parent / grandparent with a username)', { skip }, () => {
  let ctx;
  before(async () => { ctx = await startApp(); });
  after(async () => ctx?.close());

  const login = (email, password) => ctx.call('POST', '/v1/auth/login', { body: { email, password } });

  test('owner adds a member with a username; member signs in and sees the children', async () => {
    const owner = await setupFamily(ctx);
    const add = await ctx.call('POST', '/v1/family/members', {
      token: owner.token, body: { fullName: 'جدّو', username: 'Grandpa', password: 'grandpa-pass-1' },
    });
    assert.equal(add.status, 201);
    assert.equal(add.body.username, 'grandpa');
    assert.equal(add.body.role, 'guardian');

    assert.equal((await login('grandpa', 'wrong-password')).status, 401);
    const session = await login('GRANDPA', 'grandpa-pass-1');
    assert.equal(session.status, 200);
    const token = session.body.token;

    const me = await ctx.call('GET', '/v1/auth/me', { token });
    assert.equal(me.body.username, 'grandpa');
    assert.equal(me.body.email, null);
    assert.equal(me.body.role, 'guardian');

    const kids = await ctx.call('GET', '/v1/children', { token });
    assert.deepEqual(kids.body.children.map((c) => c.id), [owner.childId]);

    // A member can use parent features (e.g. lock settings read) …
    assert.equal((await ctx.call('GET', `/v1/children/${owner.childId}/alerts`, { token })).status, 200);
    // … but cannot manage the family or delete a child.
    assert.equal((await ctx.call('POST', '/v1/family/members', { token, body: { fullName: 'x', username: 'xyz', password: 'long-password-9' } })).status, 403);
    assert.equal((await ctx.call('DELETE', `/v1/children/${owner.childId}`, { token })).status, 403);

    const members = await ctx.call('GET', '/v1/family/members', { token: owner.token });
    assert.deepEqual(members.body.members.map((m) => m.role), ['owner', 'guardian']);
    assert.equal(members.body.members[0].isYou, true);
  });

  test('alerts reach every family member', async () => {
    const owner = await setupFamily(ctx);
    await ctx.call('POST', '/v1/family/members', { token: owner.token, body: { fullName: 'Nana', username: 'nana', password: 'nana-pass-123' } });
    const nana = (await login('nana', 'nana-pass-123')).body.token;
    await ctx.call('PUT', '/v1/auth/push-token', { token: nana, body: { pushToken: 'ExponentPushToken[nana]' } });
    ctx.notifications.length = 0;
    await ctx.call('POST', '/v1/device/messages', {
      token: owner.deviceToken,
      body: { items: [{ source: 'sms', direction: 'incoming', text: 'روح موت محد يحبك', occurredAt: new Date().toISOString() }] },
    });
    assert.ok(ctx.notifications[0].parentPushTokens.includes('ExponentPushToken[nana]'));
  });

  test('validation: taken usernames, bad usernames, short passwords', async () => {
    const owner = await setupFamily(ctx);
    const add = (body) => ctx.call('POST', '/v1/family/members', { token: owner.token, body });
    assert.equal((await add({ fullName: 'A', username: 'taken.name', password: 'long-password-1' })).status, 201);
    assert.equal((await add({ fullName: 'B', username: 'taken.name', password: 'long-password-1' })).status, 409);
    assert.equal((await add({ fullName: 'C', username: 'no spaces!', password: 'long-password-1' })).status, 400);
    assert.equal((await add({ fullName: 'D', username: 'ab', password: 'long-password-1' })).status, 400);
    assert.equal((await add({ fullName: 'E', username: 'okname', password: 'short' })).status, 400);
    assert.equal((await add({ fullName: 'F', password: 'long-password-1' })).status, 400);
  });

  test('owner resets a member password (old sessions end) and removes a member', async () => {
    const owner = await setupFamily(ctx);
    const { body: m } = await ctx.call('POST', '/v1/family/members', { token: owner.token, body: { fullName: 'Uncle', username: 'uncle', password: 'first-pass-123' } });
    const old = (await login('uncle', 'first-pass-123')).body.token;

    assert.equal((await ctx.call('PUT', `/v1/family/members/${m.id}/password`, { token: owner.token, body: { password: 'second-pass-123' } })).status, 204);
    assert.equal((await ctx.call('GET', '/v1/auth/me', { token: old })).status, 401);
    assert.equal((await login('uncle', 'first-pass-123')).status, 401);
    const fresh = (await login('uncle', 'second-pass-123')).body.token;

    assert.equal((await ctx.call('DELETE', `/v1/family/members/${m.id}`, { token: owner.token })).status, 204);
    assert.equal((await ctx.call('GET', '/v1/children', { token: fresh })).status, 401);
    assert.equal((await login('uncle', 'second-pass-123')).status, 401);

    // The owner can't be removed this way, and other families' members are out of reach.
    const me = (await ctx.call('GET', '/v1/auth/me', { token: owner.token })).body;
    assert.equal((await ctx.call('DELETE', `/v1/family/members/${me.id}`, { token: owner.token })).status, 400);
    const other = await setupFamily(ctx);
    const { body: theirs } = await ctx.call('POST', '/v1/family/members', { token: other.token, body: { fullName: 'X', username: 'theirs', password: 'long-password-1' } });
    assert.equal((await ctx.call('DELETE', `/v1/family/members/${theirs.id}`, { token: owner.token })).status, 404);
  });
});
