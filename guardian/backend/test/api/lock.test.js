import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skip, startApp, setupFamily } from './helpers.js';

const beat = (ctx, token, lockCapable = true) =>
  ctx.call('POST', '/v1/device/heartbeat', { token, body: { lockCapable, appVersion: '1.0.0' } });

describe('remote device lock', { skip }, () => {
  let ctx;
  before(async () => { ctx = await startApp(); });
  after(async () => ctx?.close());

  test('lock needs the device_lock consent scope', async () => {
    const f = await setupFamily(ctx); // default scopes: no device_lock
    const r = await ctx.call('PUT', `/v1/children/${f.childId}/lock`, { token: f.token, body: { minutes: 30 } });
    assert.equal(r.status, 409);
    const status = await ctx.call('GET', `/v1/children/${f.childId}/lock`, { token: f.token });
    assert.equal(status.body.consented, false);
  });

  test('timed lock reaches the device via heartbeat, then unlock clears it', async () => {
    const f = await setupFamily(ctx, { scopes: ['device_lock'] });
    assert.equal((await beat(ctx, f.deviceToken)).body.lock.locked, false);

    const locked = await ctx.call('PUT', `/v1/children/${f.childId}/lock`, { token: f.token, body: { minutes: 30, message: 'وقت المذاكرة' } });
    assert.equal(locked.status, 200);
    assert.equal(locked.body.locked, true);
    const minutesLeft = (new Date(locked.body.lockedUntil) - Date.now()) / 60000;
    assert.ok(minutesLeft > 29 && minutesLeft <= 30, `got ${minutesLeft}`);

    const hb = await beat(ctx, f.deviceToken);
    assert.equal(hb.body.lock.locked, true);
    assert.equal(hb.body.lock.message, 'وقت المذاكرة');
    assert.equal(hb.body.displayName, 'سارة');

    const list = await ctx.call('GET', '/v1/children', { token: f.token });
    assert.equal(list.body.children[0].locked, true);

    assert.equal((await ctx.call('DELETE', `/v1/children/${f.childId}/lock`, { token: f.token })).body.locked, false);
    assert.equal((await beat(ctx, f.deviceToken)).body.lock.locked, false);

    const audit = await ctx.pool.query(`SELECT action FROM audit_log WHERE child_id = $1 AND action LIKE 'device.%' ORDER BY at`, [f.childId]);
    assert.deepEqual(audit.rows.map((r) => r.action), ['device.lock', 'device.unlock']);
  });

  test('"until unlocked" lock has no end time; expired timed lock is not locked', async () => {
    const f = await setupFamily(ctx, { scopes: ['device_lock'] });
    const r = await ctx.call('PUT', `/v1/children/${f.childId}/lock`, { token: f.token, body: {} });
    assert.equal(r.body.locked, true);
    assert.equal(r.body.lockedUntil, null);
    assert.equal((await beat(ctx, f.deviceToken)).body.lock.locked, true);

    await ctx.pool.query(`UPDATE children SET locked_until = now() - interval '1 second' WHERE id = $1`, [f.childId]);
    assert.equal((await beat(ctx, f.deviceToken)).body.lock.locked, false);
  });

  test('revoking consent stops the lock being enforced', async () => {
    const f = await setupFamily(ctx, { scopes: ['device_lock'] });
    await ctx.call('PUT', `/v1/children/${f.childId}/lock`, { token: f.token, body: { minutes: 60 } });
    await ctx.call('DELETE', `/v1/children/${f.childId}/consents`, { token: f.token });
    assert.equal((await beat(ctx, f.deviceToken)).body.lock.locked, false);
  });

  test('device reports whether it can lock; parent sees it', async () => {
    const f = await setupFamily(ctx, { scopes: ['device_lock'] });
    await beat(ctx, f.deviceToken, false);
    const status = await ctx.call('GET', `/v1/children/${f.childId}/lock`, { token: f.token });
    assert.equal(status.body.devices[0].lockCapable, false);
    assert.equal(status.body.consented, true);
  });

  test('validation and isolation', async () => {
    const a = await setupFamily(ctx, { scopes: ['device_lock'] });
    const b = await setupFamily(ctx, { scopes: ['device_lock'] });
    assert.equal((await ctx.call('PUT', `/v1/children/${a.childId}/lock`, { token: a.token, body: { minutes: 0 } })).status, 400);
    assert.equal((await ctx.call('PUT', `/v1/children/${a.childId}/lock`, { token: a.token, body: { message: 'x'.repeat(141) } })).status, 400);
    assert.equal((await ctx.call('PUT', `/v1/children/${a.childId}/lock`, { token: b.token, body: { minutes: 5 } })).status, 404);
    assert.equal((await ctx.call('POST', '/v1/device/heartbeat', { token: a.deviceToken, body: {} })).status, 400);
  });
});
