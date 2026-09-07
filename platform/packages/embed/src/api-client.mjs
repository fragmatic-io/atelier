// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

export function createBrowserApiClient(
  capabilities,
  {
    origin = location.origin,
    fetcher = fetch,
    csrfToken = () =>
      document.querySelector('meta[name="csrf-token"]')?.content ??
      globalThis.AtelierHost?.csrfToken?.() ??
      null,
  } = {},
) {
  const contracts = new Map(capabilities.map((capability) => [capability.id, capability]));
  const execute = async (capabilityId, input = {}, signal) => {
    const contract = contracts.get(capabilityId);
    if (!contract) throw new Error('This API operation is not in the approved surface contract.');
    const method = contract.operation.method;
    let path = contract.operation.path;
    const consumed = new Set();
    path = path.replace(/\{([^}]+)\}/g, (_match, name) => {
      const value = input[name];
      if (value === undefined || value === null || value === '')
        throw new Error(`Missing required path value: ${name}`);
      consumed.add(name);
      return encodeURIComponent(String(value));
    });
    const url = new URL(path, origin);
    if (url.origin !== origin) throw new Error('Only same-origin API calls are allowed.');
    const properties = contract.inputSchema?.properties ?? {};
    const payload = {};
    for (const [name, value] of Object.entries(input)) {
      const property = properties[name];
      if (!property || consumed.has(name) || value === undefined || value === null) continue;
      const location = property['x-location'];
      if (location === 'header') continue;
      if (
        location === 'query' ||
        (!location && ['GET', 'HEAD'].includes(method))
      ) {
        if (['string', 'number', 'boolean'].includes(typeof value))
          url.searchParams.set(name, String(value));
      } else payload[name] = value;
    }
    const csrf = csrfToken();
    const response = await fetcher(url, {
      method,
      credentials: 'same-origin',
      redirect: 'error',
      signal,
      headers: {
        Accept: 'application/json',
        ...(!['GET', 'HEAD'].includes(method) ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      ...(!['GET', 'HEAD'].includes(method) ? { body: JSON.stringify(payload) } : {}),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const value =
      response.status === 204
        ? null
        : contentType.includes('application/json')
          ? await response.json()
          : await response.text();
    if (!response.ok)
      throw new Error(
        value?.detail ?? value?.error?.message ?? `API operation failed with ${response.status}`,
      );
    return value;
  };
  return {
    load: (capabilityId, context, signal) => execute(capabilityId, context, signal),
    dispatch: (capabilityId, input, { signal } = {}) => execute(capabilityId, input, signal),
  };
}
