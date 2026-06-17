// Gateway base path. Dev: '/llm' is proxied to the LiteLLM gateway by vite.config.ts.
export const GATEWAY_BASE = (import.meta.env.VITE_LLM_GATEWAY as string) ?? '/llm';
// Model alias resolved by the gateway (free→local→paid hierarchy lives in the gateway).
export const MODEL = (import.meta.env.VITE_LLM_MODEL as string) ?? 'sovern-default';
