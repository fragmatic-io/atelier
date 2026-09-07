// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

export function hostedWorkspace(root, { hasAgent }) {
  if (!hasAgent) {
    const surface = element('div', 'atelier-hosted-surface');
    root.replaceChildren(surface);
    return { surface, agent: null };
  }
  const nav = element('nav', 'atelier-hosted-tabs');
  nav.setAttribute('aria-label', 'Atelier workspace');
  const surfaceButton = element('button', 'is-active', 'Workspace');
  const agentButton = element('button', '', 'Assistant');
  const surface = element('section', 'atelier-hosted-pane');
  const agent = element('section', 'atelier-hosted-pane atelier-agent-root');
  agent.hidden = true;
  const select = (target) => {
    const showAgent = target === agent;
    surface.hidden = showAgent;
    agent.hidden = !showAgent;
    surfaceButton.classList.toggle('is-active', !showAgent);
    agentButton.classList.toggle('is-active', showAgent);
  };
  surfaceButton.addEventListener('click', () => select(surface));
  agentButton.addEventListener('click', () => select(agent));
  nav.append(surfaceButton, agentButton);
  root.replaceChildren(nav, surface, agent);
  return { surface, agent };
}
