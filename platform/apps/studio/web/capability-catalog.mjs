// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { escapeHtml as e, humanize } from '/assets/surface.mjs';

export function capabilitySelectionSummary(capabilities) {
  return {
    total: capabilities.length,
    queries: capabilities.filter((capability) => capability.kind === 'query').length,
    commands: capabilities.filter((capability) => capability.kind === 'command').length,
    sensitive: capabilities.filter((capability) => capability.risk === 'sensitive').length,
    destructive: capabilities.filter((capability) => capability.risk === 'destructive').length,
    missingPermissions: capabilities.filter(
      (capability) => !(capability.requiredPermissions ?? []).length,
    ).length,
  };
}

export function renderCapabilityCatalog(model, pill) {
  const pending = model.capabilities.filter((capability) => !capability.securityReviewed).length;
  const agentEnabled = model.capabilities.filter((capability) => capability.agentEnabled).length;
  return `<div class="info-strip">Atelier recommendations are based on declared and observed evidence. <strong>Review approval and agent access are separate decisions.</strong> Bulk approval never exposes a capability to an agent.</div><div class="capability-toolbar"><div><h2>Capabilities <span class="count">${model.capabilities.length}</span></h2><p class="muted"><span id="cap-selection-count">0 selected</span> · ${pending} pending · ${agentEnabled} agent tools</p></div><div class="capability-actions"><input class="filter-input" id="cap-filter" aria-label="Filter capabilities" placeholder="Filter capabilities…"><button class="btn secondary sm" data-action="select-visible-capabilities">Select visible</button><button class="btn secondary sm" data-action="clear-capability-selection" disabled>Clear</button><button class="btn secondary sm" data-action="bulk-reopen-selected" disabled>Reopen selected</button><button class="btn secondary sm" data-action="bulk-review-selected" disabled>Approve selected</button><button class="btn sm" data-action="bulk-review-all" ${pending ? '' : 'disabled'}>Approve all pending (${pending})</button></div></div><div class="panel no-pad table-wrap"><table class="table" id="cap-table"><thead><tr><th><span class="visually-hidden">Select</span></th><th>CAPABILITY</th><th>EVIDENCE</th><th>RECOMMENDATION</th><th>REVIEW</th><th>AGENTS</th><th></th></tr></thead><tbody>${model.capabilities
    .map((capability) => {
      const sources = [...new Set((capability.evidence ?? []).map((item) => item.source))];
      const decision = capability.securityReviewed
        ? 'approved'
        : capability.reviewDecision === 'rejected'
          ? 'rejected'
          : 'pending';
      return `<tr data-capability-id="${e(capability.id)}"><td><input type="checkbox" data-cap-select value="${e(capability.id)}" aria-label="Select ${e(capability.title ?? humanize(capability.id))}"></td><td class="small"><strong>${e(capability.title ?? humanize(capability.id))}</strong><div class="muted code">${e(capability.operation ? `${capability.operation.method} ${capability.operation.path}` : capability.id)}</div></td><td class="small">${sources.map((source) => pill(source)).join(' ') || pill('unknown')}</td><td class="small"><strong>${e(humanize(capability.recommendation?.review ?? 'manual_review'))}</strong><div class="muted">${e(capability.recommendation?.reasons?.[0] ?? 'Human review required')}</div></td><td>${pill(decision)}</td><td>${pill(capability.agentEnabled ? 'enabled' : 'disabled')}</td><td><button class="btn secondary sm" data-action="review-cap" data-id="${e(capability.id)}">Review</button></td></tr>`;
    })
    .join('')}</tbody></table></div><div class="capability-agent-bar"><div><strong>Agent access is a separate gate</strong><p class="muted">Select already-approved capabilities, then explicitly enable or disable their use by chat and surface agents.</p></div><div class="buttons"><button class="btn secondary sm" data-action="bulk-agent-disable" disabled>Disable selected</button><button class="btn secondary sm" data-action="bulk-agent-enable" disabled>Enable selected for agents</button></div></div>`;
}

export function selectedCapabilityIds(root = document) {
  return [...root.querySelectorAll('[data-cap-select]:checked')].map((input) => input.value);
}

export function visibleCapabilityIds(root = document) {
  return [...root.querySelectorAll('#cap-table tbody tr:not([hidden])')].map(
    (row) => row.dataset.capabilityId,
  );
}
