// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { normalizeAllowedOrigin } from '../../discovery/src/contracts.mjs';
import { assert, choice, text } from '../../control-plane/src/util.mjs';

export const SURFACE_FRAMEWORKS = ['nextjs-app', 'react-router', 'dom'];
export const SURFACE_MODES = ['route', 'inline', 'drawer'];

function localPath(value, label, max = 160) {
  const path = text(value, label, { max });
  const segments = path.split('/').filter(Boolean);
  assert(
    path.startsWith('/') &&
      !path.startsWith('//') &&
      !path.includes('://') &&
      !/[?#\\]/.test(path) &&
      segments.every((part) => /^[A-Za-z0-9_-]+$/.test(part)),
    400,
    'INSTALL_PATH',
    `${label} must contain only safe same-origin path segments`,
  );
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

export function normalizeSurfaceInstall(input, model) {
  const framework = choice(input.framework, SURFACE_FRAMEWORKS, 'Framework');
  const mode = choice(input.mode ?? 'route', SURFACE_MODES, 'Surface mode');
  const routePath = localPath(input.routePath ?? '/atelier-workspace', 'Route path');
  const bridgePath = localPath(input.bridgePath ?? '/api/atelier', 'Bridge path');
  assert(
    bridgePath !== '/',
    400,
    'INSTALL_PATH',
    'Bridge path cannot replace the application root',
  );
  const slotId = text(input.slotId, 'Slot ID', { max: 160 });
  assert(
    model?.slots?.some((slot) => slot.id === slotId),
    400,
    'INSTALL_SLOT',
    'Choose a slot declared by the current project model',
  );
  assert(
    !routePath.startsWith(bridgePath + '/') && routePath !== bridgePath,
    400,
    'INSTALL_PATH_COLLISION',
    'Surface route and server bridge paths must be different',
  );
  return {
    framework,
    mode,
    routePath,
    bridgePath,
    slotId,
    navLabel: text(input.navLabel ?? 'Workspace', 'Navigation label', { max: 60 }),
    applicationOrigin: normalizeAllowedOrigin(input.applicationOrigin),
    environment: choice(input.environment ?? 'staging', ['staging', 'production'], 'Environment'),
  };
}

export function normalizeInstallReceipt(input) {
  assert(input && typeof input === 'object', 400, 'INSTALL_RECEIPT', 'Receipt is required');
  return {
    installId: text(input.installId, 'Install ID', { max: 80 }),
    bundleHash: text(input.bundleHash, 'Bundle hash', { max: 80 }),
    routeMounted: input.routeMounted === true,
    bridgeReachable: input.bridgeReachable === true,
    authorityConfigured: input.authorityConfigured === true,
    error: input.error ? text(input.error, 'Install error', { max: 300 }) : null,
  };
}
