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

function installStyles(manifest) {
  for (const href of [
    `${moduleUrl.origin}/assets/surface.css`,
    `${moduleUrl.origin}/assets/agent.css`,
    `${moduleUrl.origin}/embed/v1.css`,
    manifest.designStylesheet,
  ]) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.crossOrigin = 'anonymous';
    link.href = href;
    document.head.append(link);
  }
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
  const suppliedContext = globalThis.AtelierHost?.context?.() ?? {};
  if (!suppliedContext || typeof suppliedContext !== 'object' || Array.isArray(suppliedContext))
    throw new Error('ATELIER_HOST_CONTEXT_INVALID');
  const context = { ...suppliedContext, route: location.pathname };
  mountSurface(workspace.surface, manifest.bundle, {
    context,
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
      context,
      onTool: async ({ threadId, call, confirm }) => {
        if (call.contract.kind === 'command') {
          const accepted = await confirm({
            title: 'Confirm this application action',
            description:
              `${call.capabilityId} runs in this browser through your current application session and remains subject to its authorization rules.`,
            input: call.input,
            accept: 'Run action',
          });
          if (!accepted)
            return agentClient.rpc('deny', { threadId, callId: call.id });
        }
        return agentClient.executeClientTool(threadId, call, {
          confirmed: call.contract.kind === 'command',
        });
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
