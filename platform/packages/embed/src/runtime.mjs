// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { mountSurface } from '/assets/surface.mjs';
import { createBrowserApiClient } from '/embed/api-client.mjs';

const moduleUrl = new URL(import.meta.url);
const script = [...document.scripts].find((candidate) => {
  try {
    return new URL(candidate.src).href === moduleUrl.href && candidate.dataset.atelierInstallKey;
  } catch {
    return false;
  }
});
if (!script) throw new Error('ATELIER_INSTALL_SCRIPT_REQUIRED');

const key = script.dataset.atelierInstallKey;
const selector = script.dataset.atelierMount ?? '[data-atelier-mount]';
const root = document.querySelector(selector);
if (!(root instanceof Element)) throw new Error('ATELIER_MOUNT_REQUIRED');

const allowedStyleProperties = new Set([
  'backgroundColor',
  'borderColor',
  'borderRadius',
  'boxShadow',
  'color',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'height',
  'letterSpacing',
  'lineHeight',
  'padding',
]);
const cssName = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const declarations = (values = {}) =>
  Object.entries(values)
    .filter(
      ([name, value]) =>
        allowedStyleProperties.has(name) &&
        typeof value === 'string' &&
        value.length <= 300 &&
        !/[{};]/.test(value) &&
        !/url\s*\(|@import/i.test(value),
    )
    .map(([name, value]) => `${cssName(name)}:${value}`)
    .join(';');

function installStyles(manifest) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${moduleUrl.origin}/assets/surface.css`;
  document.head.append(link);
  const roles = manifest.designContract?.roles ?? {};
  const scope = `[data-atelier-install="${manifest.install.id}"]`;
  const style = document.createElement('style');
  style.dataset.atelierDesign = manifest.install.designFingerprint;
  style.textContent = `${scope}{${declarations(roles.root)}}${scope} :where(button,[role=button]){${declarations(roles.button)}}${scope} :where(input,select,textarea){${declarations(roles.input)}}${scope} :where([data-surface-card]){${declarations(roles.card)}}`;
  document.head.append(style);
}

async function report(manifest, error = null) {
  await fetch(`${moduleUrl.origin}/api/install/v1/events`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', 'X-Atelier-Install-Key': key },
    body: JSON.stringify({
      installId: manifest.install.id,
      bundleHash: manifest.install.bundleHash,
      routeMounted: !error,
      bridgeReachable: !error,
      authorityConfigured: !error,
      error,
    }),
  });
}

try {
  const response = await fetch(
    `${moduleUrl.origin}/api/embed/v1/manifest?key=${encodeURIComponent(key)}`,
    { mode: 'cors', credentials: 'omit', cache: 'no-store' },
  );
  const manifest = await response.json();
  if (!response.ok) throw new Error(manifest.error?.message ?? 'Atelier UI manifest failed to load');
  root.dataset.atelierInstall = manifest.install.id;
  root.dataset.atelierDesign = manifest.install.designFingerprint;
  installStyles(manifest);
  const client = createBrowserApiClient(manifest.capabilities);
  mountSurface(root, manifest.bundle, {
    context: { route: location.pathname },
    load: client.load,
    dispatch: client.dispatch,
  });
  await report(manifest);
  globalThis.dispatchEvent(
    new CustomEvent('atelier:ready', { detail: { installId: manifest.install.id } }),
  );
} catch (error) {
  root.replaceChildren();
  const alert = document.createElement('p');
  alert.setAttribute('role', 'alert');
  alert.textContent = error instanceof Error ? error.message : 'Atelier UI failed to load';
  root.append(alert);
  globalThis.dispatchEvent(new CustomEvent('atelier:error', { detail: alert.textContent }));
}
