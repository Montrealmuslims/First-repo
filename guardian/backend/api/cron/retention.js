// Daily data-retention job, called by Vercel Cron (see vercel.json).
// Vercel sends "Authorization: Bearer $CRON_SECRET"; anything else is refused.

import { runRetention } from '../../src/jobs/retention.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.statusCode = 401;
    res.end('Unauthorized');
    return;
  }
  const deleted = await runRetention();
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ ok: true, deleted }));
}
