// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { assert, noPrototypeKeys } from './util.mjs';

export const MAX_SURFACE_QUERY_CAPABILITIES = 8;
export const MAX_SURFACE_ACTION_CAPABILITIES = 4;

const STR = { type: 'string', minLength: 1, maxLength: 200 };

function requiredInputNames(capability) {
  return [...new Set(capability.inputSchema?.required ?? [])];
}

export function surfaceExecutableModel(model, slotId) {
  const slot = model.slots?.find((candidate) => candidate.id === slotId);
  const guaranteedContext = new Set(slot?.contextSchema?.required ?? []);
  return {
    ...model,
    capabilities: model.capabilities.filter((capability) => {
      if (capability.kind !== 'query') return true;
      return requiredInputNames(capability).every((name) => {
        const property = capability.inputSchema?.properties?.[name];
        return property?.['x-location'] !== 'header' && guaranteedContext.has(name);
      });
    }),
  };
}

export function architectSchema(task) {
  const queryIds = [...new Set(task.requiredInformation.map((item) => item.capabilityId))];
  const actionIds = [...new Set(task.permittedActions)];
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      goal: STR,
      workflow: { type: 'array', items: STR, minItems: 1, maxItems: 8 },
      successCriteria: { type: 'array', items: STR, minItems: 1, maxItems: 6 },
      avoid: { type: 'array', items: STR, maxItems: 6 },
      queryCapabilityIds: {
        type: 'array',
        items: { type: 'string', enum: queryIds },
        minItems: 1,
        maxItems: Math.min(MAX_SURFACE_QUERY_CAPABILITIES, queryIds.length),
      },
      actionCapabilityIds: {
        type: 'array',
        items: { type: 'string', enum: actionIds.length ? actionIds : ['none'] },
        maxItems: actionIds.length ? Math.min(MAX_SURFACE_ACTION_CAPABILITIES, actionIds.length) : 0,
      },
    },
    required: [
      'goal',
      'workflow',
      'successCriteria',
      'avoid',
      'queryCapabilityIds',
      'actionCapabilityIds',
    ],
  };
}

export function selectedCapabilityModel(model, task, architecture) {
  noPrototypeKeys(architecture);
  const allowedQueries = new Set(task.requiredInformation.map((item) => item.capabilityId));
  const allowedActions = new Set(task.permittedActions);
  const queryIds = [...new Set(architecture.queryCapabilityIds ?? [])];
  const actionIds = [...new Set(architecture.actionCapabilityIds ?? [])];
  assert(
    queryIds.length > 0 &&
      queryIds.length <= MAX_SURFACE_QUERY_CAPABILITIES &&
      queryIds.every((id) => allowedQueries.has(id)),
    400,
    'INVALID_CAPABILITY_SELECTION',
    'Architect selected a query outside the authorized surface inventory',
  );
  assert(
    actionIds.length <= MAX_SURFACE_ACTION_CAPABILITIES &&
      actionIds.every((id) => allowedActions.has(id)),
    400,
    'INVALID_CAPABILITY_SELECTION',
    'Architect selected an action outside the authorized surface inventory',
  );
  const selected = new Set([...queryIds, ...actionIds]);
  return {
    ...model,
    capabilities: model.capabilities.filter((capability) => selected.has(capability.id)),
  };
}
