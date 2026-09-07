// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { assert, canonical, hash } from '../../control-plane/src/util.mjs';

const text = { type: 'string', minLength: 1, maxLength: 500 };
export const DESIGN_SYNTHESIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 1000 },
    density: { type: 'string', enum: ['compact', 'balanced', 'spacious'] },
    hierarchy: { type: 'string', enum: ['flat', 'sectioned', 'layered'] },
    interactionTone: { type: 'string', enum: ['quiet', 'direct', 'expressive'] },
    patterns: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: text,
          guidance: text,
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidence: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                role: { type: 'string', enum: ['root', 'button', 'input', 'card', 'nav'] },
                property: { type: 'string', minLength: 1, maxLength: 80 },
                value: { type: 'string', minLength: 1, maxLength: 300 },
              },
              required: ['role', 'property', 'value'],
            },
          },
        },
        required: ['name', 'guidance', 'confidence', 'evidence'],
      },
    },
    avoid: { type: 'array', maxItems: 10, items: text },
  },
  required: ['summary', 'density', 'hierarchy', 'interactionTone', 'patterns', 'avoid'],
};

export function bindDesignSynthesis(value, contract) {
  for (const pattern of value.patterns)
    for (const evidence of pattern.evidence)
      assert(
        contract.roles?.[evidence.role]?.[evidence.property] === evidence.value,
        409,
        'DESIGN_SYNTHESIS_UNGROUNDED',
        `Design synthesis evidence is absent from the approved contract: ${evidence.role}.${evidence.property}`,
      );
  const body = structuredClone(value);
  return {
    ...body,
    contractFingerprint: hash(contract),
    synthesisFingerprint: hash(canonical(body)),
  };
}
