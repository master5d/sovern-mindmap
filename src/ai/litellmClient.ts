import { ChatMessage } from '../types';
import { GATEWAY_BASE, MODEL } from './config';

/** POST chat-completions to the LiteLLM gateway (OpenAI-compatible). Returns assistant text. */
export async function requestCompletion(
  messages: ChatMessage[],
  opts?: { signal?: AbortSignal },
): Promise<string> {
  const res = await fetch(`${GATEWAY_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.2 }),
    signal: opts?.signal,
  });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('gateway returned no content');
  return content;
}
