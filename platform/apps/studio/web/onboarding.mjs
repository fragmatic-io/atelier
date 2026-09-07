// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

const stepCopy = {
  connect: ['Connect discovery', 'Install the browser observer or attach an API contract.'],
  discover: [
    'Collect evidence',
    'Atelier inventories new operation and schema revisions automatically.',
  ],
  review: ['Review capabilities', 'Confirm purpose, safety, permissions and chatbot exposure.'],
  agent: ['Configure delivery', 'Prepare custom surfaces and the optional chatbot agent.'],
  publish: ['Verify and publish', 'Test the guided experience before publishing a signed release.'],
};

function fact(step) {
  if (step.id === 'connect')
    return `${step.facts.sources} evidence source${step.facts.sources === 1 ? '' : 's'}`;
  if (step.id === 'discover')
    return `${step.facts.capabilities} capabilities from ${step.facts.observations} observed revisions`;
  if (step.id === 'review') return `${step.facts.reviewed} of ${step.facts.total} reviewed`;
  if (step.id === 'agent')
    return `${step.facts.surfaces} surfaces, ${step.facts.agentEnabled} agent tools`;
  return `${step.facts.published} published, ${step.facts.verifiedInstalls} installed`;
}

export function renderOnboarding({ status, model, projectId, e, icon, pill, button }) {
  const current = status.steps.findIndex((step) => !step.complete);
  const active = current === -1 ? status.steps.length - 1 : current;
  const sources = status.sources ?? [];
  const reviewed = status.facts.reviewed;
  const total = status.facts.capabilities;
  const enabled = status.facts.agentEnabled;
  const installs = status.installs ?? [];
  const design = status.design ?? { observations: [], approved: null };
  const synthesis = (design.syntheses ?? []).find(
    (candidate) =>
      candidate.contractFingerprint === design.approved?.fingerprint &&
      candidate.status !== 'rejected',
  );
  return `
    <section class="setup-summary" aria-labelledby="setup-title">
      <div>
        <span class="setup-label">Guided setup</span>
        <h2 id="setup-title">${status.state === 'ready' ? 'Your integration is ready.' : 'Take Atelier from evidence to experiences.'}</h2>
        <p>Turn API and workflow evidence into approved agent tools, rich chat responses and adaptive product surfaces. Every status below comes from stored evidence.</p>
      </div>
      <div class="setup-state">${pill(status.state)}<span>Updated ${new Date(status.generatedAt).toLocaleTimeString()}</span></div>
    </section>

    <nav class="setup-rail" aria-label="Onboarding progress">
      ${status.steps
        .map((step, index) => {
          const state = step.complete ? 'complete' : index === active ? 'active' : 'waiting';
          return `<a class="setup-step ${state}" href="#setup-${step.id}">
            <span class="step-index">${step.complete ? icon('check') : index + 1}</span>
            <span><strong>${e(stepCopy[step.id][0])}</strong><small>${e(fact(step))}</small></span>
          </a>`;
        })
        .join('')}
    </nav>

    <div class="setup-sections">
      <section class="setup-section" id="setup-connect">
        <div class="setup-section-head"><span class="step-index">1</span><div><h2>Connect discovery</h2><p>Start without sharing application source code.</p></div>${button('connect-observer', 'Create snippet', 'code')}</div>
        <div class="setup-grid">
          <div>
            <h3>Browser observer</h3>
            <p>Observes same-origin API contracts. Values are redacted locally before anything is sent.</p>
            <div class="privacy-receipt">
              <strong>Always collected</strong><span>Method, route template, field names, types, status class, page path and role cohort</span>
              <strong>Never collected</strong><span>Headers, cookies, credentials, query strings, raw free text, raw identifiers or source code</span>
              <strong>Optional safe values</strong><span>Only approved categorical fields such as status, severity or plan</span>
              <strong>Optional design contract</strong><span>Fixed computed styles from explicitly marked elements; never text, HTML or form values</span>
            </div>
            <p class="setup-note">Your application Content Security Policy must allow the Atelier script origin and collector connection. A blocked policy is reported in the browser console and the dashboard remains waiting.</p>
          </div>
          <div>
            <h3>Connected evidence</h3>
            ${
              sources.length
                ? `<div class="source-list">${sources
                    .map(
                      (source) =>
                        `<div class="source-row"><div>${pill(source.status)}<strong>${e(source.name)}</strong><small>${e(source.kind)}${source.lastSeenAt ? `, last seen ${new Date(source.lastSeenAt).toLocaleString()}` : ', waiting for first contact'}</small></div>${['browser', 'server'].includes(source.kind) ? `<button class="btn ghost sm" data-action="revoke-discovery" data-id="${e(source.id)}">Revoke</button>` : ''}</div>`,
                    )
                    .join('')}</div>`
                : '<div class="setup-empty">No discovery source is connected yet.</div>'
            }
          </div>
        </div>
      </section>

      <section class="setup-section" id="setup-discover">
        <div class="setup-section-head"><span class="step-index">2</span><div><h2>Add API evidence</h2><p>Observed traffic and declared contracts stay visibly distinct.</p></div><div class="buttons">${button('import-spec-url', 'Import URL', 'link', true)}${button('upload-spec', 'Upload OpenAPI', 'upload', true)}</div></div>
        <div class="evidence-facts">
          <div><strong>${status.facts.observations}</strong><span>Observed revisions</span></div>
          <div><strong>${status.facts.capabilities}</strong><span>Current capabilities</span></div>
          <div><strong>${sources.filter((source) => source.kind === 'openapi').length}</strong><span>Declared contracts</span></div>
        </div>
        <p class="setup-note">A runtime observation cannot prove optional fields, error behavior or server-only operations. OpenAPI is treated as declared behavior and observations validate actual use.</p>
      </section>

      <section class="setup-section" id="setup-review">
        <div class="setup-section-head"><span class="step-index">3</span><div><h2>Review capability inventory</h2><p>Atelier recommends. A human decides.</p></div><a class="btn" href="/project/${e(projectId)}/model">Review inventory ${icon('arrow')}</a></div>
        <div class="review-meter" role="group" aria-label="Capability review coverage"><div><strong>${reviewed}</strong><span>reviewed</span></div><div><strong>${Math.max(0, total - reviewed)}</strong><span>remaining</span></div><div><strong>${enabled}</strong><span>chatbot tools</span></div></div>
        <p class="setup-note">Discovered, approved, chatbot enabled and published are separate states. Rejecting a capability records a decision without exposing it.</p>
      </section>

      <section class="setup-section" id="setup-agent">
        <div class="setup-section-head"><span class="step-index">4</span><div><h2>Configure delivery</h2><p>Custom surfaces and chatbot tools share one inventory, but have separate release decisions.</p></div></div>
        <div class="delivery-tracks">
          <article><span class="setup-label">Custom surfaces</span><h3>Design and install an adaptive workspace</h3><p>Atelier serves a reviewed surface on a new or existing customer page through one module script.</p><p class="setup-note">The browser observer never injects UI. The hosted runtime renders Atelier's versioned UI, then calls only approved same-origin API paths through the application's existing signed-in session. No customer API credential or server bridge is sent to Atelier.</p><div class="design-contract-state">${pill(design.approved ? 'approved' : design.observations.length ? 'review' : 'waiting')}<span>${design.approved ? `Host design ${e(design.approved.fingerprint.slice(0, 10))} approved` : design.observations.length ? 'A new computed-style contract is ready for review' : 'Mark a design root and open the customer app'}</span></div><div class="design-contract-state">${pill(synthesis?.status ?? 'not synthesized')}<span>${synthesis?.status === 'approved' ? 'Agentic Design Genome guidance approved for generation' : synthesis?.status === 'draft' ? 'Intelligent semantic guidance is ready for human review' : 'Optional intelligence may interpret approved tokens, never change them'}</span></div><div class="buttons">${button('approve-design', design.approved ? 'Review design again' : 'Review host design', 'layers', true, design.observations.length ? '' : 'disabled aria-disabled="true"')}${synthesis?.status === 'draft' ? button('review-design-synthesis', 'Review intelligent design', 'spark', true) : button('synthesize-design', synthesis?.status === 'approved' ? 'Synthesize again' : 'Synthesize design', 'spark', true, design.approved ? '' : 'disabled aria-disabled="true"')}${button('new-experience', status.steps[3].facts.surfaces ? 'Create another surface' : 'Design a surface', 'spark')}${button('install-surface', installs.length ? 'Create another embed' : 'Install hosted UI', 'code', true)}</div></article>
          <article><span class="setup-label">Chatbot agent</span><h3>Configure conversation</h3><p>Select a real model connection and expose only reviewed capabilities. Atelier hosts chat and orchestration; every selected API tool runs in the signed-in customer browser.</p>${button('configure-agent', status.steps[3].facts.profile ? 'Update chatbot' : 'Configure chatbot', 'spark')}</article>
        </div>
        <div class="install-status"><div class="section-head"><h3>Surface installation receipts</h3><span>${status.facts.verifiedInstalls} verified</span></div>${
          installs.length
            ? installs
                .map(
                  (install) =>
                    `<div class="source-row"><div>${pill(install.status)}<strong>${e(install.navLabel)} · ${e(install.routePath)}</strong><small>${e(install.framework)} · ${e(install.mode)} · ${e(install.slotId)}</small><div class="install-facts"><span class="${install.facts.designContractBound ? 'ok' : ''}">${icon(install.facts.designContractBound ? 'check' : 'clock')}design</span><span class="${install.facts.routeMounted ? 'ok' : ''}">${icon(install.facts.routeMounted ? 'check' : 'clock')}mount</span><span class="${install.facts.bridgeReachable ? 'ok' : ''}">${icon(install.facts.bridgeReachable ? 'check' : 'clock')}hosted UI</span><span class="${install.facts.authorityConfigured ? 'ok' : ''}">${icon(install.facts.authorityConfigured ? 'check' : 'clock')}API client</span></div>${install.lastError ? `<small class="install-error">${e(install.lastError)}</small>` : ''}</div><button class="btn ghost sm" data-action="revoke-surface-install" data-id="${e(install.id)}">Revoke</button></div>`,
                )
                .join('')
            : '<div class="setup-empty">No surface installer has been generated.</div>'
        }</div>
        <div class="agent-readiness">
          <div class="fact-check ${status.steps[3].facts.surfaces ? 'complete' : ''}">${icon(status.steps[3].facts.surfaces ? 'check' : 'clock')}<span><strong>Published surfaces</strong><small>${status.steps[3].facts.surfaces ? `${status.steps[3].facts.surfaces} current release${status.steps[3].facts.surfaces === 1 ? '' : 's'}` : 'Create, review and publish a custom surface'}</small></span></div>
          <div class="fact-check ${status.steps[3].facts.provider ? 'complete' : ''}">${icon(status.steps[3].facts.provider ? 'check' : 'clock')}<span><strong>Model provider</strong><small>${status.steps[3].facts.provider ? 'Connected' : 'Connect Claude CLI, Codex CLI or an API provider'}</small></span></div>
          <div class="fact-check ${enabled ? 'complete' : ''}">${icon(enabled ? 'check' : 'clock')}<span><strong>Tool allowlist</strong><small>${enabled ? `${enabled} approved capabilities` : 'Enable at least one reviewed capability'}</small></span></div>
          <div class="fact-check ${status.steps[3].facts.profile ? 'complete' : ''}">${icon(status.steps[3].facts.profile ? 'check' : 'clock')}<span><strong>Agent profile</strong><small>${status.steps[3].facts.profile ? 'Saved against the current model' : 'Voice, retention and tools need review'}</small></span></div>
          <div class="fact-check ${status.steps[3].facts.specialists ? 'complete' : ''}">${icon(status.steps[3].facts.specialists ? 'check' : 'clock')}<span><strong>Deep-answer specialists</strong><small>${status.steps[3].facts.specialists ? `${status.steps[3].facts.specialists} bounded specialist roles` : 'Optional research, workflow and explanation roles'}</small></span></div>
          <div class="fact-check ${status.steps[3].facts.designApproved ? 'complete' : ''}">${icon(status.steps[3].facts.designApproved ? 'check' : 'clock')}<span><strong>Host design contract</strong><small>${status.steps[3].facts.designApproved ? 'Approved and version-bound' : 'Required before generating an installer'}</small></span></div>
        </div>
      </section>

      <section class="setup-section" id="setup-publish">
        <div class="setup-section-head"><span class="step-index">5</span><div><h2>Verify and publish</h2><p>Test custom surfaces and chat against real authorization, confirmation and failure behavior.</p></div><a class="btn ${model ? '' : 'disabled'}" href="${model ? `/project/${e(projectId)}/lab` : '#setup-discover'}">Open experience lab ${icon('arrow')}</a></div>
        <div class="acceptance-list">
          <span>${icon('shield')} Unreviewed tools and actions are denied</span>
          <span>${icon('check')} Authorized queries render rich components</span>
          <span>${icon('check')} Command requires exact confirmation</span>
          <span>${icon('clock')} Provider and network failures remain explicit</span>
        </div>
      </section>
    </div>`;
}

export function snippet(origin, source, environment = 'production') {
  const safe = source.safeSampleFields?.length
    ? `\n  data-safe-sample-fields="${source.safeSampleFields.join(',')}"`
    : '';
  const samples = source.semanticSamples ? '\n  data-semantic-samples="true"' : '';
  const design = source.designCapture ? '\n  data-design-capture="true"' : '';
  return `<script\n  src="${origin}/observe/v1.js"\n  data-project-key="${source.projectKey}"\n  data-environment="${environment}"${samples}${safe}${design}\n  defer\n><\/script>`;
}
