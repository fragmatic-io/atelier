// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

/** Accept the documented API request example or its inner task contract.
 * Actions are explicit caller selections; the server rechecks current review. */
export function sourceGenerationRequest({ goal = '', profile, contract = null }) {
  if (!['standard', 'production'].includes(profile)) throw new Error('Choose a supported quality profile.');
  if (profile === 'production' && !contract)
    throw new Error('Choose an independent task contract for production quality. See docs/PRODUCTION_UI.md for the schema and an example.');
  const qualityContract = contract?.qualityContract ?? contract ?? { profile: 'standard' };
  if (!qualityContract || typeof qualityContract !== 'object' || Array.isArray(qualityContract))
    throw new Error('The task contract must be a JSON object.');
  if (qualityContract.profile !== profile)
    throw new Error('The selected quality profile must match the task contract.');
  const actions = contract?.actions ?? qualityContract.actionIds ?? [];
  if (!Array.isArray(actions) || actions.length > 16 || actions.some((action) => typeof action !== 'string' || !action || action.length > 200))
    throw new Error('Declare up to sixteen reviewed capability IDs in actions.');
  const requestedGoal = goal.trim() || contract?.goal || qualityContract.goal;
  if (typeof requestedGoal !== 'string' || !requestedGoal.trim()) throw new Error('Describe the component task.');
  return { goal: requestedGoal.trim(), actions: [...actions], qualityContract };
}

/** A display summary, never an approval or publication authority. */
export function qualitySummary(component) {
  const policy = component.compiled?.qualityContract;
  const evidence = component.evidence;
  const design = component.compiled?.designContext;
  const bound = Boolean(evidence && evidence.digest === component.digest &&
    evidence.designContextHash === (design?.hash ?? null) &&
    evidence.qualityContractHash === (policy?.hash ?? null));
  const checks = Array.isArray(evidence?.checks) ? evidence.checks : [];
  const captures = Array.isArray(component.captures) ? component.captures : [];
  return {
    profile: policy?.profile === 'production' ? 'Production' : 'Standard smoke',
    scenarios: policy?.scenarios?.length ?? 0,
    binding: !evidence ? 'Not run' : bound ? 'Exact artifact' : 'Missing or stale binding',
    browser: !evidence ? 'Not run' : !bound ? 'Unverified for this artifact' : (evidence.browserPassed ?? evidence.passed) ? 'Passed' : 'Needs repair',
    visual: !evidence ? 'Not run' : !bound ? 'Unverified for this artifact' : evidence.visual?.passed ? 'Passed' : evidence.visual?.status ?? 'Not run',
    manualAccessibilityItems: checks.reduce((count, check) => count + (check.accessibility?.incomplete?.length ?? 0), 0),
    cases: checks.length,
    captureCount: bound ? captures.length : 0,
    bound,
    designHash: design?.hash ?? null,
    taskHash: policy?.hash ?? null,
  };
}

export function qualityEvidencePanel(el, component) {
  const summary = qualitySummary(component);
  const panel = el('section', { class: 'quality-evidence', 'aria-label': 'Artifact quality evidence' });
  const facts = [
    ['Quality profile', summary.profile],
    ['Independent scenarios', String(summary.scenarios)],
    ['Evidence binding', summary.binding],
    ['Browser result', summary.browser],
    ['Visual review', summary.visual],
    ['Manual accessibility items', String(summary.manualAccessibilityItems)],
    ['Executed cases', String(summary.cases)],
    ['Retained captures', String(summary.captureCount)],
  ];
  panel.append(el('h3', { text: 'Quality evidence' }), el('dl', { class: 'quality-facts' },
    ...facts.flatMap(([term, value]) => [el('dt', { text: term }), el('dd', { text: value })])));
  if (summary.profile !== 'Production') panel.append(el('p', {
    class: 'micro muted',
    text: 'Standard smoke checks do not establish production quality. A production contract fixes independent task expectations before generation.',
  }));
  panel.append(el('p', {
    class: 'micro muted',
    text: 'Automated accessibility checks and model visual critique support human review. Inspect interaction, keyboard use and the intended host before approving.',
  }));
  const captures = summary.bound ? component.captures ?? [] : [];
  if (captures.length) {
    const gallery = el('details', { class: 'quality-gallery' }, el('summary', { text: 'Inspect certification screenshots' }));
    for (const capture of captures.slice(0, 80)) {
      if (typeof capture.dataUrl !== 'string' || capture.dataUrl.length > 4_000_000 ||
        !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(capture.dataUrl)) continue;
      const name = capture.name ?? capture.case?.name ?? 'Certification capture';
      gallery.append(el('figure', {},
        el('img', { src: capture.dataUrl, alt: String(name), loading: 'lazy' }),
        el('figcaption', { class: 'micro', text: `${name} · ${String(capture.sha256 ?? '').slice(0, 12)}` })));
    }
    panel.append(gallery);
  }
  if (component.evidence) panel.append(el('details', {},
    el('summary', { text: 'Inspect measured results and visual critique' }),
    el('pre', { class: 'micro', text: JSON.stringify(component.evidence, null, 2) })));
  if (component.compiled?.qualityContract) panel.append(el('details', {},
    el('summary', { text: 'Inspect the fixed task contract' }),
    el('pre', { class: 'micro', text: JSON.stringify(component.compiled.qualityContract, null, 2) })));
  return panel;
}
