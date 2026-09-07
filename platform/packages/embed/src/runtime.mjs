// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { mountSurface } from '/assets/surface.mjs';
import { createBrowserApiClient } from '/embed/api-client.mjs';
import { createHostedAgentTransport } from '/embed/agent-transport.mjs';
import { hostedWorkspace } from '/embed/workspace.mjs';
import { AgentClient, defineClientTool } from '/assets/agent-client.mjs';
import { mountAgentChat } from '/assets/chat.mjs';

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
  for (const href of ['/assets/surface.css', '/assets/agent.css', '/embed/v1.css']) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${moduleUrl.origin}${href}`;
    document.head.append(link);
  }
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
  const allCapabilities = [
    ...new Map(
      [...manifest.capabilities, ...(manifest.agent?.clientTools ?? [])].map((item) => [item.id, item]),
    ).values(),
  ];
  const browserApi = createBrowserApiClient(allCapabilities);
  const workspace = hostedWorkspace(root, { hasAgent: manifest.agent?.available === true });
  mountSurface(workspace.surface, manifest.bundle, {
    context: { route: location.pathname },
    load: browserApi.load,
    dispatch: browserApi.dispatch,
  });
  if (workspace.agent) {
    const agentClient = new AgentClient({
      transport: createHostedAgentTransport(moduleUrl.origin, key),
      tools: manifest.agent.clientTools.map((tool) =>
        defineClientTool({
          name: tool.id,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          execute: (input) => browserApi.dispatch(tool.id, input),
        }),
      ),
    });
    mountAgentChat(workspace.agent, {
      client: agentClient,
      name: manifest.agent.name,
      subtitle: manifest.agent.subtitle,
      context: { route: location.pathname },
      onTool: async ({ threadId, call, confirm }) => {
        if (call.contract.kind === 'command') {
          const accepted = await confirm({
            title: 'Confirm this application action',
            description:
              'The action runs in this browser through your current application session and remains subject to its authorization rules.',
            input: call.input,
            accept: 'Run action',
          });
          if (!accepted)
            return agentClient.rpc('deny', { threadId, callId: call.id });
        }
        return agentClient.executeClientTool(threadId, call);
      },
    });
  }
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
