// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

function responseError(response, value) {
  return Object.assign(new Error(value?.error?.message ?? `Atelier request failed with ${response.status}`), {
    status: response.status,
    code: value?.error?.code,
  });
}

export function createHostedAgentTransport(
  controlOrigin,
  installKey,
  { fetcher = fetch, storage = localStorage } = {},
) {
  const storageKey = `atelier:browser-subject:${installKey.slice(-20)}`;
  let subject = storage.getItem(storageKey);
  if (!subject) {
    subject = crypto.randomUUID();
    storage.setItem(storageKey, subject);
  }
  let active = null;

  async function session() {
    if (active && active.expiresAt > Date.now() + 60_000) return active.session;
    const response = await fetcher(`${controlOrigin}/api/embed/v1/session`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Atelier-Install-Key': installKey,
      },
      body: JSON.stringify({ subject }),
    });
    const value = await response.json();
    if (!response.ok) throw responseError(response, value);
    active = value;
    return active.session;
  }

  return async (body, { signal } = {}) => {
    const response = await fetcher(`${controlOrigin}/api/embed/v1/agent`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Atelier-Install-Key': installKey,
        'X-Atelier-Agent-Session': await session(),
      },
      body: JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok) throw responseError(response, value);
    if (body.action === 'artifact' && value.preview?.url)
      value.preview.url = new URL(value.preview.url, controlOrigin).href;
    return value;
  };
}
