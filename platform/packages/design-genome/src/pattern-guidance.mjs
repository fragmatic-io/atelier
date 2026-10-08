// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { hash } from '../../control-plane/src/util.mjs';

// Authored design guidance, not a screenshot corpus or a claim of measured taste.
// These patterns never grant capabilities, add data fields or replace host tokens.
const entries = [
  {
    id: 'queue-scan', family: 'triage', layout: 'workbench', variants: ['table', 'facts'],
    signals: ['queue', 'triage', 'inbox', 'workload', 'backlog'], needs: ['collection'],
    intent: 'Scan comparable records, understand priority and inspect one item.',
    hierarchy: ['Record identity', 'Priority and reason', 'Owner and next action'],
    guidance: ['Align comparable values in columns; keep identity readable on narrow screens.', 'Explain priority only with supplied evidence. Preserve the selected record while its detail is inspected.'],
    avoid: ['A separate card for every field', 'Color as the only priority signal', 'Invented rankings or bulk actions'],
  },
  {
    id: 'queue-decision', family: 'triage', layout: 'focus', variants: ['facts', 'timeline'],
    signals: ['triage', 'resolve', 'intervention', 'incident', 'ticket'], needs: ['action'],
    intent: 'Give an operator the context needed for one safe intervention.',
    hierarchy: ['What needs attention', 'Evidence and recent context', 'Available intervention'],
    guidance: ['Keep the decision and its consequence close to the action.', 'Keep pending, confirmed, failed and uncertain action outcomes distinct.'],
    avoid: ['Success before host confirmation', 'Hidden destructive consequences', 'Automatic retries of uncertain writes'],
  },
  {
    id: 'entity-context', family: 'entity-detail', layout: 'focus', variants: ['facts', 'metrics'],
    signals: ['customer', 'account', 'entity', 'detail', 'profile', 'context'], needs: [],
    intent: 'Identify the correct record and understand its current situation.',
    hierarchy: ['Record identity', 'Current state', 'Relevant context and next step'],
    guidance: ['Put identity before operational signals. Distinguish unknown values from zero.', 'Group fields by the questions they answer; retain source-specific error states.'],
    avoid: ['Repeated headings with no information', 'Treating absent data as a positive result', 'Decorative metrics with no decision value'],
  },
  {
    id: 'entity-history', family: 'entity-detail', layout: 'workbench', variants: ['timeline', 'facts'],
    signals: ['history', 'activity', 'journey', 'events', 'timeline'], needs: ['collection'],
    intent: 'Understand what happened to a record and what state it is in now.',
    hierarchy: ['Current state', 'Ordered events', 'Event details'],
    guidance: ['Show ordering and timestamps only when present in the approved data.', 'Separate current facts from historical events; make long histories bounded and navigable.'],
    avoid: ['Fabricated timestamps', 'A timeline when data has no ordering evidence', 'Losing context when an event is opened'],
  },
  {
    id: 'form-edit', family: 'create-edit', layout: 'focus', variants: ['facts'],
    signals: ['edit', 'update', 'form', 'save', 'modify'], needs: ['action'],
    intent: 'Review existing values and make a deliberate change.',
    hierarchy: ['What will change', 'Required input and constraints', 'Save outcome'],
    guidance: ['Use persistent labels and input types from approved schemas.', 'Keep entered values after validation errors and move focus to actionable feedback.'],
    avoid: ['Placeholder-only labels', 'Resetting user input after a failure', 'Inventing editable fields or mutation arguments'],
  },
  {
    id: 'form-create', family: 'create-edit', layout: 'focus', variants: ['facts'],
    signals: ['create', 'new', 'book', 'booking', 'schedule', 'submit'], needs: ['action'],
    intent: 'Collect the minimum information needed to create one valid record.',
    hierarchy: ['Purpose and constraints', 'Required details', 'Review and submit'],
    guidance: ['Separate required and optional input. Explain constraints before submission.', 'Expose the exact confirmation and completion states supplied by the host.'],
    avoid: ['Unnecessary multistep flows', 'Fake availability or calculated prices', 'Duplicate submission while a command is pending'],
  },
  {
    id: 'monitor-summary', family: 'monitor-analyze', layout: 'workbench', variants: ['metrics', 'facts'],
    signals: ['monitor', 'analytics', 'metric', 'performance', 'capacity', 'overview'], needs: ['numeric'],
    intent: 'Understand the current operating condition and where investigation is needed.',
    hierarchy: ['Scope and available time window', 'Decision-relevant measurements', 'Supporting context'],
    guidance: ['Preserve units and source labels. Make missing and stale data explicit when the contract exposes them.', 'Use charts only when real series and a meaningful comparison are available.'],
    avoid: ['Invented trends, percentages or historical comparisons', 'A metric card for every number', 'Conflating loading with zero'],
  },
  {
    id: 'analysis-records', family: 'monitor-analyze', layout: 'workbench', variants: ['table', 'metrics'],
    signals: ['analyze', 'analysis', 'report', 'records', 'explore', 'investigate'], needs: ['collection'],
    intent: 'Compare records and inspect the evidence behind a summary.',
    hierarchy: ['Question and scope', 'Comparable records', 'Details and limitations'],
    guidance: ['Keep sorting and filtering tied to actual supplied fields.', 'Label truncation and partial results; keep row identity while exploring.'],
    avoid: ['Aggregating unavailable records', 'Hiding omitted results', 'Hover-only access to important values'],
  },
  {
    id: 'review-comparison', family: 'compare-approve', layout: 'comparison', variants: ['table', 'facts'],
    signals: ['compare', 'comparison', 'review', 'options', 'difference'], needs: ['collection'],
    intent: 'Compare alternatives using the same evidence and criteria.',
    hierarchy: ['Comparison criteria', 'Aligned differences', 'Decision context'],
    guidance: ['Keep criteria aligned and units consistent across alternatives.', 'On narrow screens, preserve the comparison labels when rows stack.'],
    avoid: ['Unequal visual emphasis without a reason', 'Invented recommendations', 'A comparison layout for a single record'],
  },
  {
    id: 'review-approval', family: 'compare-approve', layout: 'focus', variants: ['facts', 'timeline'],
    signals: ['approve', 'approval', 'reject', 'authorize', 'decision'], needs: ['action'],
    intent: 'Review the exact proposal and consequence before making a decision.',
    hierarchy: ['Proposal identity', 'Evidence and effect', 'Decision and confirmation'],
    guidance: ['Show which exact record or revision the approval affects.', 'Keep approval, publication and completion separate where the host contract separates them.'],
    avoid: ['Approving a changed or stale proposal', 'Treating model confidence as review authority', 'Ambiguous primary and destructive actions'],
  },
  {
    id: 'settings-inspect', family: 'settings-admin', layout: 'focus', variants: ['facts', 'table'],
    signals: ['settings', 'configuration', 'admin', 'permissions', 'access'], needs: [],
    intent: 'Understand configuration, scope and effective access.',
    hierarchy: ['Configuration scope', 'Effective values', 'Dependencies and available changes'],
    guidance: ['Make project and environment scope visible before controls.', 'Use clear descriptions for inherited, unavailable and read-only settings.'],
    avoid: ['Showing secrets', 'A disabled control with no explanation', 'Presenting inferred access as authorized access'],
  },
  {
    id: 'settings-change', family: 'settings-admin', layout: 'focus', variants: ['facts'],
    signals: ['configure', 'settings', 'policy', 'enable', 'disable', 'admin'], needs: ['action'],
    intent: 'Make an explicit configuration change with a clear consequence.',
    hierarchy: ['Affected scope', 'Proposed change and effect', 'Confirm and observe result'],
    guidance: ['Distinguish a local draft from an applied setting.', 'Expose consequential changes before confirmation and report the actual host outcome.'],
    avoid: ['Optimistic success for security-sensitive changes', 'Hidden autosave', 'Inferring authority from a visible control'],
  },
];
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
export const PATTERN_CATALOG = freeze({
  version: 1,
  provenance: 'Atelier-authored operational design guidance',
  validation: 'Not a measured visual reference corpus; render and task review remain required.',
  patterns: entries,
});
export const PATTERN_CATALOG_HASH = hash(PATTERN_CATALOG);

/** Bounded, transparent retrieval from task text and authorized capability shapes. */
export function selectPatternGuidance({ task, model, designContext = null, limit = 3 }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 3) throw new Error('Pattern guidance limit must be 1–3');
  const authorized = new Set((task.requiredInformation ?? []).map((field) => field.capabilityId));
  const queries = (model.capabilities ?? []).filter((cap) => cap.kind === 'query' && authorized.has(cap.id));
  const words = new Set(String(task.goal ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const facts = {
    collection: queries.some((cap) => cap.outputSchema?.type === 'array'),
    action: (task.permittedActions ?? []).length > 0,
    numeric: queries.some((cap) => Object.values(
      (cap.outputSchema?.type === 'array' ? cap.outputSchema.items : cap.outputSchema)?.properties ?? {},
    ).some((field) => ['number', 'integer'].includes(field?.type))),
  };
  const ranked = entries
    .filter((pattern) => pattern.needs.every((need) => facts[need]))
    .map((pattern) => ({ pattern, matches: pattern.signals.filter((word) => words.has(word)) }))
    .filter((entry) => entry.matches.length > 0)
    .sort((a, b) => b.matches.length - a.matches.length || a.pattern.id.localeCompare(b.pattern.id));
  if (!ranked.length) {
    const fallback = entries.find((pattern) => pattern.id === (facts.collection ? 'analysis-records' : 'entity-context'));
    ranked.push({ pattern: fallback, matches: [] });
  }
  return {
    version: 1,
    catalogHash: PATTERN_CATALOG_HASH,
    designContextHash: designContext?.hash ?? null,
    constraints: [
      'Use the approved host design context for tokens, density and component roles.',
      'Guidance cannot add capabilities, fields, controls or live data not authorized by the task.',
      'Pattern selection is heuristic guidance. Browser, task, accessibility and human review determine acceptance.',
    ],
    candidates: ranked.slice(0, limit).map(({ pattern, matches }) => ({
      ...structuredClone(pattern),
      selectionReason: matches.length ? `Task terms: ${matches.join(', ')}` : 'Fallback matched the authorized data shape.',
    })),
  };
}
