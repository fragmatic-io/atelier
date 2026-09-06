// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { sha256, stableId } from '../../contracts/src/index.mjs';

export function normalizeSemanticEvent(event, { clock = () => new Date() } = {}) {
  if (!event?.type) throw new Error('Semantic event type is required');
  return {
    eventId:
      event.eventId ??
      stableId('workflow_event', { ...event, nonce: event.at ?? clock().toISOString() }),
    type: String(event.type),
    at: event.at ?? clock().toISOString(),
    sessionId: String(event.sessionId ?? 'anonymous-session'),
    userId: event.userId ? String(event.userId) : null,
    role: String(event.role ?? 'user'),
    route: event.route ? String(event.route) : null,
    entity: event.entity ?? null,
    capabilityId: event.capabilityId ?? null,
    metadata: sanitizeMetadata(event.metadata ?? {}),
  };
}

function sanitizeMetadata(metadata) {
  const safe = {};
  const denied = /value|body|payload|content|email|phone|address|secret|token|password/i;
  for (const [key, value] of Object.entries(metadata)) {
    if (denied.test(key)) continue;
    if (['string', 'number', 'boolean'].includes(typeof value) || value === null) safe[key] = value;
    else if (Array.isArray(value))
      safe[key] = value
        .filter((x) => ['string', 'number', 'boolean'].includes(typeof x))
        .slice(0, 20);
  }
  return safe;
}

export class WorkflowRecorder {
  constructor({ maxEvents = 20_000 } = {}) {
    this.maxEvents = maxEvents;
    this.events = [];
  }
  record(event) {
    const normalized = normalizeSemanticEvent(event);
    this.events.push(normalized);
    if (this.events.length > this.maxEvents)
      this.events.splice(0, this.events.length - this.maxEvents);
    return normalized;
  }
  export() {
    return this.events.map((x) => structuredClone(x));
  }
}

function groupSessions(events) {
  const map = new Map();
  for (const raw of events) {
    const event = normalizeSemanticEvent(raw);
    const list = map.get(event.sessionId) ?? [];
    list.push(event);
    map.set(event.sessionId, list);
  }
  for (const list of map.values()) list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return map;
}

function normalizedRoute(event) {
  let route = event.route;
  if (!route) return null;
  const entityId = event.entity?.id;
  if (entityId) route = route.replace(String(entityId), ':id');
  return route.replace(/\/(?:c_\d+|[0-9a-f]{8,}(?:-[0-9a-f]{4,})*|\d+)(?=\/|$)/gi, '/:id');
}

function routeTransitions(session) {
  const routes = session.map(normalizedRoute).filter(Boolean);
  const transitions = [];
  for (let i = 1; i < routes.length; i += 1)
    if (routes[i] !== routes[i - 1]) transitions.push([routes[i - 1], routes[i]]);
  return { routes, transitions };
}

function patternSignals(session) {
  const { routes, transitions } = routeTransitions(session);
  const counts = new Map();
  for (const route of routes) counts.set(route, (counts.get(route) ?? 0) + 1);
  const revisits = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const repeatedFilters = session.filter((x) => x.type === 'filter.applied').length;
  const copies = session.filter(
    (x) => x.type === 'content.copied' || x.type === 'identifier.copied',
  ).length;
  const undos = session.filter((x) => /undo|reversed/.test(x.type)).length;
  const errors = session.filter((x) => /error|failed/.test(x.type)).length;
  const abandonment = session.some((x) => /abandoned/.test(x.type));
  return {
    routeCount: new Set(routes).size,
    transitions: transitions.length,
    revisits,
    repeatedFilters,
    copies,
    undos,
    errors,
    abandonment,
    frictionScore:
      transitions.length * 0.08 +
      revisits * 0.15 +
      repeatedFilters * 0.12 +
      copies * 0.18 +
      undos * 0.2 +
      errors * 0.2 +
      (abandonment ? 0.5 : 0),
  };
}

function routeSignature(session) {
  const routes = session.map(normalizedRoute).filter(Boolean);
  return routes.filter((route, index) => index === 0 || route !== routes[index - 1]).join(' → ');
}

export function mineWorkflowOpportunities(
  events,
  { minSessions = 2, minFrictionScore = 0.45, availableSlots = [] } = {},
) {
  const sessions = groupSessions(events);
  const patterns = new Map();
  for (const session of sessions.values()) {
    const signal = patternSignals(session);
    if (signal.frictionScore < minFrictionScore) continue;
    const role = session[0]?.role ?? 'user';
    const entityType = session.find((x) => x.entity?.type)?.entity?.type ?? 'unknown';
    const signature = routeSignature(session);
    const key = `${role}|${entityType}|${signature}`;
    const group = patterns.get(key) ?? { role, entityType, signature, sessions: [], aggregate: [] };
    group.sessions.push(session);
    group.aggregate.push(signal);
    patterns.set(key, group);
  }
  const opportunities = [];
  for (const pattern of patterns.values()) {
    if (pattern.sessions.length < minSessions) continue;
    const avg = (key) =>
      pattern.aggregate.reduce((sum, x) => sum + Number(x[key] ?? 0), 0) / pattern.aggregate.length;
    const startRoute = pattern.sessions[0].find((x) => x.route)?.route ?? '/';
    const candidateSlots = availableSlots.filter(
      (slot) => slot.id.includes(pattern.entityType.toLowerCase()) || slot.mode === 'route',
    );
    const evidence = {
      sessionCount: pattern.sessions.length,
      averageTransitions: Number(avg('transitions').toFixed(2)),
      averageRevisits: Number(avg('revisits').toFixed(2)),
      averageCopies: Number(avg('copies').toFixed(2)),
      averageRepeatedFilters: Number(avg('repeatedFilters').toFixed(2)),
      abandonmentRate: Number(
        (pattern.aggregate.filter((x) => x.abandonment).length / pattern.aggregate.length).toFixed(
          3,
        ),
      ),
      observedPath: pattern.signature,
    };
    const expectedReduction = Math.max(1, Math.round(evidence.averageTransitions * 0.6));
    opportunities.push({
      id: stableId('opportunity', {
        role: pattern.role,
        entityType: pattern.entityType,
        signature: pattern.signature,
      }),
      affectedRoles: [pattern.role],
      entityType: pattern.entityType,
      triggeringContexts: [
        { route: startRoute, role: pattern.role, entityType: pattern.entityType },
      ],
      observedWorkflow: pattern.signature,
      frictionEvidence: evidence,
      proposedGoal: `Consolidate ${pattern.entityType} context and next actions for ${pattern.role}`,
      candidateInsertionPoints: candidateSlots.map((x) => x.id),
      expectedImprovement: {
        pageTransitionsReduced: expectedReduction,
        duplicatedQueriesRemoved: Math.round(evidence.averageRepeatedFilters),
        copiesRemoved: Math.round(evidence.averageCopies),
      },
      confidence: Number(
        Math.min(0.98, 0.45 + pattern.sessions.length * 0.08 + avg('frictionScore') * 0.1).toFixed(
          3,
        ),
      ),
      evidenceHash: sha256(evidence),
    });
  }
  return opportunities.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}

export function adaptationAllowed(level, change) {
  const required = {
    prioritize: 0,
    suggest: 0,
    reorder: 1,
    density: 1,
    defaults: 1,
    hide_module: 2,
    compose_bundle: 3,
    generate_component: 4,
    add_capability: 5,
  }[change];
  return required !== undefined && level >= required;
}
