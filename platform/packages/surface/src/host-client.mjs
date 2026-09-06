// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/** Calls YOUR app's authenticated, same-origin endpoints. Never pass an Atelier API token. */
export function createHostClient({
  basePath = '/api/atelier',
  csrfToken = () => null,
  fetcher = globalThis.fetch,
} = {}) {
  if (!basePath.startsWith('/') || basePath.startsWith('//') || basePath.includes('://'))
    throw new Error('Use a same-origin host API path');
  async function post(path, body, signal) {
    const csrf = csrfToken();
    const res = await fetcher(basePath + '/' + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: JSON.stringify(body),
      signal,
      redirect: 'error',
    });
    const value = await res.json();
    if (!res.ok)
      throw Object.assign(
        new Error(value.error?.message ?? 'This operation could not be completed'),
        { code: value.error?.code },
      );
    return value;
  }
  return {
    resolve: (slotId, context, signal) => post('resolve', { slotId, context }, signal),
    load: (args, signal) => post('load', args, signal),
    confirm: (args, signal) => post('confirm', args, signal),
    dispatch: (args, signal) => post('dispatch', args, signal),
  };
}
