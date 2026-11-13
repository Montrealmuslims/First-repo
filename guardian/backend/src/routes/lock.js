// Remote device lock (parent side). The child's app polls /v1/device/heartbeat
// and locks the screen while the child is locked.

import { Router } from 'express';
import { pool } from '../lib/db.js';
import { audit, HttpError } from '../lib/auth.js';
import { parse, z } from '../lib/validate.js';
import { childParam } from './children.js';

const LockBody = z.object({
  // null / omitted = locked until a parent unlocks
  minutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
  message: z.string().trim().max(140).optional(),
});

/** Lock status for a child row with locked_until / lock_message / locked_at. */
export function lockStatus(row) {
  const until = row.locked_until;
  const locked = until != null && (until === Infinity || String(until) === 'infinity' || new Date(until) > new Date());
  if (!locked) return { locked: false, lockedUntil: null, message: null, lockedAt: null };
  const forever = until === Infinity || String(until) === 'infinity';
  return {
    locked: true,
    lockedUntil: forever ? null : new Date(until).toISOString(), // null = until unlocked
    message: row.lock_message ?? null,
    lockedAt: row.locked_at,
  };
}

async function hasLockConsent(childId) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM consents WHERE child_id = $1 AND revoked_at IS NULL AND 'device_lock' = ANY(scopes)`,
    [childId],
  );
  return rowCount > 0;
}

export function lockRouter() {
  const router = Router();
  router.param('childId', childParam);

  router.get('/children/:childId/lock', async (req, res) => {
    const { rows: [row] } = await pool.query(
      'SELECT locked_until, lock_message, locked_at FROM children WHERE id = $1', [req.params.childId]);
    const { rows: devices } = await pool.query(
      `SELECT id, model, lock_capable AS "lockCapable", last_seen_at AS "lastSeenAt"
         FROM devices WHERE child_id = $1 AND revoked_at IS NULL ORDER BY enrolled_at`,
      [req.params.childId],
    );
    res.json({ ...lockStatus(row), consented: await hasLockConsent(req.params.childId), devices });
  });

  /** PUT /v1/children/:childId/lock  { minutes?: 1..1440 | null, message?: string } */
  router.put('/children/:childId/lock', async (req, res) => {
    const body = parse(LockBody, req.body ?? {});
    if (!(await hasLockConsent(req.params.childId))) {
      throw new HttpError(409, 'Device lock is not covered by the current consent');
    }
    const { rows: [row] } = await pool.query(
      `UPDATE children
          SET locked_until = CASE WHEN $2::int IS NULL THEN 'infinity'::timestamptz
                                  ELSE now() + make_interval(mins => $2::int) END,
              lock_message = $3, locked_by = $4, locked_at = now()
        WHERE id = $1
        RETURNING locked_until, lock_message, locked_at`,
      [req.params.childId, body.minutes ?? null, body.message || null, req.parent.id],
    );
    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'device.lock', childId: req.params.childId, ip: req.ip });
    res.json(lockStatus(row));
  });

  router.delete('/children/:childId/lock', async (req, res) => {
    await pool.query(
      `UPDATE children SET locked_until = NULL, lock_message = NULL, locked_by = NULL, locked_at = NULL WHERE id = $1`,
      [req.params.childId],
    );
    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'device.unlock', childId: req.params.childId, ip: req.ip });
    res.json(lockStatus({}));
  });

  return router;
}
