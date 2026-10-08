// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import Ajv from 'ajv';
import { assert, noPrototypeKeys } from '../../control-plane/src/util.mjs';
import { DESIGN_ROLES } from './design-registry.mjs';

const name = { type: 'string', minLength: 1, maxLength: 160 };
const names = { type: 'array', maxItems: 32, uniqueItems: true, items: name };
export const COMPONENT_DESIGN_CONTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: name,
    version: name,
    dataBound: { type: 'boolean' },
    roles: { type: 'array', maxItems: 5, uniqueItems: true, items: { enum: Object.keys(DESIGN_ROLES) } },
    states: {
      type: 'array', minItems: 1, maxItems: 6, uniqueItems: true,
      items: { enum: ['ready', 'loading', 'empty', 'error', 'disabled', 'success'] },
    },
    interaction: {
      type: 'object', additionalProperties: false,
      properties: {
        keyboard: { const: true },
        focusVisible: { const: true },
        accessibleName: { const: true },
        actions: names,
      },
      required: ['keyboard', 'focusVisible', 'accessibleName', 'actions'],
    },
    taste: {
      type: 'object', additionalProperties: false,
      properties: { tokenNames: names, patternNames: names },
      required: ['tokenNames', 'patternNames'],
    },
  },
  required: ['id', 'version', 'dataBound', 'roles', 'states', 'interaction', 'taste'],
};
const check = new Ajv({ strict: true, allErrors: true }).compile(COMPONENT_DESIGN_CONTRACT_SCHEMA);

/** Contracts come from the reviewed registry, never from generated source.
 * Declaring a state/interaction is not evidence that its browser test passed. */
export function normalizeComponentDesignContracts(values, { tokens = {}, roles = {}, guidance = null } = {}) {
  assert(Array.isArray(values) && values.length <= 200, 400, 'COMPONENT_DESIGN_CONTRACT', 'Expected at most 200 component contracts');
  noPrototypeKeys(values);
  const ids = new Set();
  const patterns = new Set((guidance?.patterns ?? []).map((pattern) => pattern.name));
  const result = values.map((value) => {
    assert(check(value), 400, 'COMPONENT_DESIGN_CONTRACT', 'Invalid trusted component design contract', check.errors);
    assert(!ids.has(value.id), 400, 'COMPONENT_DESIGN_CONTRACT', 'Duplicate component contract ID');
    ids.add(value.id);
    assert(value.states.includes('ready'), 400, 'COMPONENT_STATES', 'Every component must declare its ready state');
    assert(!value.dataBound || ['loading', 'empty', 'error'].every((state) => value.states.includes(state)), 400, 'COMPONENT_STATES', 'Data-bound components require loading, empty and error states');
    assert(value.roles.every((role) => Object.hasOwn(roles, role)), 400, 'COMPONENT_DESIGN_EVIDENCE', 'Component roles require approved host evidence');
    assert(value.taste.tokenNames.every((token) => Object.hasOwn(tokens, token)), 400, 'COMPONENT_DESIGN_EVIDENCE', 'Component references an unresolved token');
    assert(value.taste.patternNames.every((pattern) => patterns.has(pattern)), 400, 'COMPONENT_DESIGN_EVIDENCE', 'Component references unapproved design guidance');
    return {
      ...structuredClone(value),
      roles: [...value.roles].sort(),
      states: [...value.states].sort(),
      interaction: { ...value.interaction, actions: [...value.interaction.actions].sort() },
      taste: { tokenNames: [...value.taste.tokenNames].sort(), patternNames: [...value.taste.patternNames].sort() },
    };
  });
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
