// Vercel serverless entry point: every request is rewritten here (vercel.json)
// and handled by the same Express app that `npm start` runs.

import { createApp } from '../src/app.js';
import { loadFieldCrypto } from '../src/lib/fieldCrypto.js';
import { createNotifier } from '../src/lib/notifier.js';
import { createConsentVerifier } from '../src/lib/consentVerifier.js';
import { forgetPushTokens } from '../src/lib/auth.js';
import { classifyWithLLM, classifyBatchWithLLM } from '../src/analyzer/llmClassifier.js';

const llm = Boolean(process.env.ANTHROPIC_API_KEY);

// Built once per instance and reused across requests.
const app = createApp({
  fieldCrypto: await loadFieldCrypto(),
  notifier: await createNotifier({ onInvalidTokens: forgetPushTokens }),
  classify: llm ? classifyWithLLM : null,
  classifyBatch: llm ? classifyBatchWithLLM : null,
  consentVerifier: createConsentVerifier(),
});

export default app;
