// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

const mount = document.querySelector('#redoc');
const match = location.pathname.match(/^\/api-reference\/([^/]+)\/([^/]+)$/);

function fail(message) {
  mount.innerHTML = '';
  const panel = document.createElement('section');
  panel.className = 'api-docs-error';
  const title = document.createElement('h1');
  title.textContent = 'API reference unavailable';
  const detail = document.createElement('p');
  detail.textContent = message;
  panel.append(title, detail);
  mount.append(panel);
}

if (!match) fail('The project reference URL is invalid.');
else if (!window.Redoc) fail('The pinned Redoc renderer did not load.');
else {
  const [, tenantId, projectId] = match;
  const response = await fetch(
    `/api/tenants/${encodeURIComponent(tenantId)}/projects/${encodeURIComponent(projectId)}/openapi`,
    { credentials: 'same-origin', headers: { Accept: 'application/json' } },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    fail(body.error?.message ?? `The API reference request failed (${response.status}).`);
  } else {
    const spec = await response.json();
    document.title = `${spec.info.title} — Atelier`;
    window.Redoc.init(
      spec,
      {
        expandResponses: '200,201',
        hideDownloadButton: true,
        nativeScrollbars: true,
        pathInMiddlePanel: true,
        requiredPropsFirst: true,
        sortOperationsAlphabetically: true,
        theme: {
          colors: { primary: { main: '#435747' }, text: { primary: '#252b24' } },
          typography: {
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
            headings: {
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
            },
          },
          sidebar: { backgroundColor: '#f0f2e9', textColor: '#435747' },
          rightPanel: { backgroundColor: '#252b24' },
        },
      },
      mount,
    );
  }
}
