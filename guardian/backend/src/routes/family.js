// Family members: the owner adds other adults (a co-parent, a grandparent)
// who can see the children and use every parent feature except managing the
// family and deleting children. Members sign in with an email or a username.

import { Router } from 'express';
import { pool, withTransaction } from '../lib/db.js';
import { familyOfParent, audit, HttpError } from '../lib/auth.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../lib/passwords.js';
import { parse, z, uuid } from '../lib/validate.js';

const password = z.string().min(MIN_PASSWORD_LENGTH, `at least ${MIN_PASSWORD_LENGTH} characters`).max(200);
const username = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, '3–30 letters, digits, dot, dash or underscore');

const AddBody = z.object({
  fullName: z.string().trim().min(1).max(100),
  username: username.optional(),
  email: z.email().max(254).transform((e) => e.toLowerCase()).optional(),
  password,
}).refine((b) => b.username || b.email, 'username or email is required');

const PasswordBody = z.object({ password });

async function requireOwner(req) {
  const fam = await familyOfParent(req.parent.id);
  if (fam.role !== 'owner') throw new HttpError(403, 'Only the family owner can manage family members');
  return fam.familyId;
}

/** The member must belong to the owner's family and not be the owner. */
async function memberOf(familyId, parentId) {
  const { rows } = await pool.query(
    'SELECT role FROM family_members WHERE family_id = $1 AND parent_id = $2',
    [familyId, parse(uuid, parentId)],
  );
  if (!rows[0]) throw new HttpError(404, 'Member not found');
  if (rows[0].role === 'owner') throw new HttpError(400, 'The owner cannot be changed here');
}

export function familyRouter() {
  const router = Router();

  router.get('/family/members', async (req, res) => {
    const { familyId } = await familyOfParent(req.parent.id);
    const { rows } = await pool.query(
      `SELECT p.id, p.full_name AS "fullName", p.email, p.username, fm.role, p.mfa_enabled AS "mfaEnabled"
         FROM family_members fm JOIN parents p ON p.id = fm.parent_id
        WHERE fm.family_id = $1 AND p.deleted_at IS NULL
        ORDER BY fm.role, p.created_at`,
      [familyId],
    );
    res.json({ members: rows.map((m) => ({ ...m, isYou: m.id === req.parent.id })) });
  });

  router.post('/family/members', async (req, res) => {
    const familyId = await requireOwner(req);
    const body = parse(AddBody, req.body);
    const passwordHash = await hashPassword(body.password);
    const member = await withTransaction(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO parents (email, username, password_hash, full_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING id, full_name AS "fullName", email, username`,
        [body.email ?? null, body.username ?? null, passwordHash, body.fullName],
      );
      if (!rows[0]) throw new HttpError(409, 'That username or email is already taken');
      await db.query(`INSERT INTO family_members (family_id, parent_id, role) VALUES ($1, $2, 'guardian')`, [familyId, rows[0].id]);
      await audit({ actorType: 'parent', actorId: req.parent.id, action: 'family.member_add', targetId: rows[0].id, ip: req.ip }, db);
      return rows[0];
    });
    res.status(201).json({ ...member, role: 'guardian' });
  });

  /** Owner sets a new password for a member (e.g. they forgot it). Signs them out everywhere. */
  router.put('/family/members/:parentId/password', async (req, res) => {
    const familyId = await requireOwner(req);
    await memberOf(familyId, req.params.parentId);
    const { password: pw } = parse(PasswordBody, req.body);
    await pool.query('UPDATE parents SET password_hash = $2 WHERE id = $1', [req.params.parentId, await hashPassword(pw)]);
    await pool.query('UPDATE parent_sessions SET revoked_at = now() WHERE parent_id = $1 AND revoked_at IS NULL', [req.params.parentId]);
    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'family.member_password', targetId: req.params.parentId, ip: req.ip });
    res.status(204).end();
  });

  /** Remove a member: their access ends immediately and their account is anonymised. */
  router.delete('/family/members/:parentId', async (req, res) => {
    const familyId = await requireOwner(req);
    await memberOf(familyId, req.params.parentId);
    await withTransaction(async (db) => {
      await db.query('DELETE FROM family_members WHERE family_id = $1 AND parent_id = $2', [familyId, req.params.parentId]);
      await db.query('UPDATE parent_sessions SET revoked_at = now(), push_token = NULL WHERE parent_id = $1', [req.params.parentId]);
      await db.query(
        `UPDATE parents SET email = 'deleted+' || id || '@invalid', username = NULL, full_name = 'deleted',
                password_hash = '!', mfa_secret_enc = NULL, mfa_enabled = false, deleted_at = now() WHERE id = $1`,
        [req.params.parentId],
      );
      await audit({ actorType: 'parent', actorId: req.parent.id, action: 'family.member_remove', targetId: req.params.parentId, ip: req.ip }, db);
    });
    res.status(204).end();
  });

  return router;
}
