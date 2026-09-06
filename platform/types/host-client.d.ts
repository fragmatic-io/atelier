import type { BrowserHostClient } from './common.js';
export * from './common.js';
/** No control-plane token belongs in this browser object. */
export function createHostClient(options?: {
  basePath?: string;
  csrfToken?: () => string | null;
  fetcher?: typeof fetch;
}): BrowserHostClient;
