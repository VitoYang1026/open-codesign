/**
 * Title generation for the chatgpt-codex provider. The generic generateTitle()
 * in core goes through pi-ai and needs an API key; for OAuth-only ChatGPT
 * subscription we have to route through CodexClient instead.
 *
 * Phase 1: ask the model for a short summary via the Responses API, trim to
 * 60 chars, fall back to the prompt prefix on any failure.
 */

import { CodexClient } from '@open-codesign/providers/codex';
import { CodesignError, ERROR_CODES } from '@open-codesign/shared';
import { getCodexTokenStore } from './codex-oauth-ipc';

const TITLE_INSTRUCTIONS =
  'Return a 2-5 word title summarizing the user prompt in its original language. No quotes, no trailing punctuation. Title only — nothing else.';

export async function generateCodexTitle(prompt: string, modelId: string): Promise<string> {
  const store = getCodexTokenStore();
  const stored = await store.read();
  if (stored === null || stored.accountId === null) {
    throw new CodesignError(
      'ChatGPT 订阅未登录或无法读取账户 ID，请重新登录。',
      ERROR_CODES.PROVIDER_AUTH_MISSING,
    );
  }
  const client = new CodexClient({ store, accountId: stored.accountId });
  const result = await client.chat({
    model: modelId,
    instructions: TITLE_INSTRUCTIONS,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt.slice(0, 400) }],
      },
    ],
  });
  const title = result.text
    .trim()
    .replace(/^["'「『]+|["'」』]+$/g, '')
    .slice(0, 60);
  return title.length > 0 ? title : prompt.slice(0, 40);
}
