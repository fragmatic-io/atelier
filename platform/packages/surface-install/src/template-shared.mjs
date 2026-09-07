// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

export const file = (path, purpose, content) => ({ path, purpose, action: 'create', content });
export const quote = (value) => JSON.stringify(value);
export const routeSegments = (path) =>
  path.split('/').filter(Boolean).join('/') || 'atelier-workspace';
export const relativeToRoot = (segmentCount) => '../'.repeat(segmentCount + 1);
export const jsxText = (value) => `{${quote(value)}}`;
export const markupText = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

const declarations = (values = {}) =>
  Object.entries(values)
    .map(([property, value]) => {
      const css = property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      return `  ${css}: ${value};`;
    })
    .join('\n');

export function designStyles(install) {
  const roles = install.designContract.roles;
  return `/* Atelier host design contract ${install.designFingerprint}. Reviewed in Studio. */
[data-atelier-surface] {
${declarations(roles.root)}
}
[data-atelier-surface] :where(button, [role='button']) {
${declarations(roles.button)}
}
[data-atelier-surface] :where(input, select, textarea) {
${declarations(roles.input)}
}
[data-atelier-surface] :where([data-surface-card]) {
${declarations(roles.card)}
}
`;
}

function publicConfig(install) {
  return {
    installId: install.id,
    bundleHash: install.bundleHash,
    controlOrigin: install.controlOrigin,
    verificationKey: install.verificationKey,
    bridgePath: install.bridgePath,
    slotId: install.slotId,
    routePath: install.routePath,
    mode: install.mode,
  };
}

export function reactMount(install, { next = false } = {}) {
  const component =
    install.mode === 'route'
      ? 'AtelierRoute'
      : install.mode === 'drawer'
        ? 'AtelierDrawerSlot'
        : 'AtelierSlot';
  const config = JSON.stringify(publicConfig(install), null, 2);
  return `${next ? "'use client';\n" : ''}import { useEffect, useMemo } from 'react';
import { AtelierProvider, ${component} } from '@atelier/platform/react';
import { createHostClient } from '@atelier/platform/host-client';

const install = ${config};

export function AtelierSurfaceMount({ context = {} }) {
  const host = useMemo(() => createHostClient({ basePath: install.bridgePath }), []);

  useEffect(() => {
    let active = true;
    async function reportInstall() {
      let bridgeReachable = false;
      let authorityConfigured = false;
      let error = null;
      try {
        const response = await fetch(install.bridgePath + '/install-health', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const health = await response.json();
        bridgeReachable = response.ok && health.environmentConfigured === true;
        authorityConfigured = response.ok && health.authorityConfigured === true;
        if (!response.ok) error = health.error?.message ?? 'Bridge health check failed';
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'Bridge health check failed';
      }
      if (!active) return;
      const response = await fetch(install.controlOrigin + '/api/install/v1/events', {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          'X-Atelier-Install-Key': install.verificationKey,
        },
        body: JSON.stringify({
          installId: install.installId,
          bundleHash: install.bundleHash,
          routeMounted: true,
          bridgeReachable,
          authorityConfigured,
          error,
        }),
      });
      if (!response.ok) throw new Error('Atelier install verification returned ' + response.status);
    }
    reportInstall().catch((error) => {
      window.dispatchEvent(new CustomEvent('atelier:install-error', { detail: error.message }));
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div data-atelier-surface data-atelier-design={${quote(install.designFingerprint)}}>
      <AtelierProvider host={host}>
        <${component}
          id={install.slotId}
          context={context}
          fallback={<div role="status">Loading workspace…</div>}
          onError={(error) =>
            window.dispatchEvent(new CustomEvent('atelier:surface-error', { detail: error }))
          }
        />
      </AtelierProvider>
    </div>
  );
}
`;
}

export function environmentExample(install) {
  return `# Server only. Never prefix these with NEXT_PUBLIC_ or VITE_.
ATELIER_CONTROL_ORIGIN=${install.controlOrigin}
ATELIER_TENANT_ID=${install.tenantId}
ATELIER_PROJECT_ID=${install.projectId}
ATELIER_HOST_TOKEN=CREATE_A_READ_SCOPED_HOST_TOKEN_IN_STUDIO
ATELIER_CONFIRMATION_KEY=GENERATE_WITH_OPENSSL_RAND_BASE64_32
ATELIER_ACTION_LEDGER=.local/atelier/actions.sqlite
`;
}
