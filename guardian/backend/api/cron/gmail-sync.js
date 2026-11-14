// Daily Gmail scan, called by Vercel Cron (see vercel.json). Does nothing
// unless GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI are set.
// (A long-running worker, `npm run worker`, scans every 5 minutes instead.)

import { syncAllGmail } from '../../src/jobs/gmailSync.js';
import { gmailConfig } from '../../src/lib/gmail.js';
import { loadFieldCrypto } from '../../src/lib/fieldCrypto.js';
import { createNotifier } from '../../src/lib/notifier.js';
import { forgetPushTokens } from '../../src/lib/auth.js';
import { classifyWithLLM, classifyBatchWithLLM } from '../../src/analyzer/llmClassifier.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.statusCode = 401;
    res.end('Unauthorized');
    return;
  }
  res.setHeader('content-type', 'application/json');
  if (!gmailConfig()) {
    res.end(JSON.stringify({ ok: true, skipped: 'gmail not configured' }));
    return;
  }
  const llm = Boolean(process.env.ANTHROPIC_API_KEY);
  const summary = await syncAllGmail({
    fieldCrypto: await loadFieldCrypto(),
    notifier: await createNotifier({ onInvalidTokens: forgetPushTokens }),
    classify: llm ? classifyWithLLM : null,
    classifyBatch: llm ? classifyBatchWithLLM : null,
  });
  res.end(JSON.stringify({ ok: true, summary }));
}
