// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import Ajv from 'ajv';
import { assert, canonical, hash, noPrototypeKeys } from '../../control-plane/src/util.mjs';
import { normalizeDesignContract } from '../../discovery/src/design-contract.mjs';
import { DESIGN_PROPERTIES, safeDesignValue } from './design-registry.mjs';
import { DESIGN_SYNTHESIS_SCHEMA, bindDesignSynthesis } from './synthesis.mjs';
import { normalizeComponentDesignContracts } from './component-contract.mjs';

export const DESIGN_CONTEXT_VERSION = 1;
const guidanceCheck = new Ajv({ strict: true, allErrors: true }).compile(DESIGN_SYNTHESIS_SCHEMA);
const contextKeys = new Set(['version', 'projectVersion', 'contractFingerprint', 'tokens', 'roles', 'viewport', 'guidance', 'componentContracts', 'hash']);
const guidanceKeys = new Set([...Object.keys(DESIGN_SYNTHESIS_SCHEMA.properties), 'contractFingerprint', 'synthesisFingerprint', 'provider', 'model', 'cacheHit']);

export function normalizeDesignTokens(input = {}) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 400, 'DESIGN_TOKENS', 'Design tokens must be a name/value object');
  noPrototypeKeys(input);
  assert(Object.keys(input).length <= 512, 400, 'DESIGN_TOKENS', 'At most 512 resolved CSS tokens are supported');
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    const name = key.replace(/^--/, '');
    assert(/^[A-Za-z_][A-Za-z0-9_-]{0,99}$/.test(name) && !['__proto__', 'constructor', 'prototype'].includes(name), 400, 'DESIGN_TOKEN_NAME', 'Invalid CSS token name');
    const safe = safeDesignValue(value, 'token', name);
    assert(!Object.hasOwn(result, name) || result[name] === safe, 400, 'DESIGN_TOKEN_COLLISION', 'Conflicting normalized token names');
    result[name] = safe;
  }
  return result;
}

function resolveTokens(input, roles) {
  const tokens = normalizeDesignTokens(input);
  for (const [role, values] of Object.entries(roles))
    for (const [property, value] of Object.entries(values)) {
      const name = `atelier-${role}-${DESIGN_PROPERTIES[property]}`;
      assert(!Object.hasOwn(tokens, name) || tokens[name] === value, 400, 'DESIGN_TOKEN_COLLISION', 'The atelier role-token namespace is reserved for approved evidence');
      tokens[name] = value;
    }
  const first = (...values) => values.find((value) => typeof value === 'string' && value.length);
  const { root = {}, button = {}, input: field = {}, card = {} } = roles;
  // Semantic aliases bind existing source-kit conventions to actual evidence.
  // No inferred palette, dimensions or dark-mode values are generated here.
  const aliases = {
    surface: first(root.backgroundColor, tokens.surface, tokens['color-surface'], tokens['color-background']),
    text: first(root.color, tokens.text, tokens['color-text'], tokens['color-foreground']),
    primary: first(button.backgroundColor, tokens.primary, tokens['color-primary'], tokens['color-brand']),
    'primary-contrast': first(button.color, tokens['primary-contrast'], tokens['color-primary-contrast']),
    border: first(field.borderColor, card.borderColor, button.borderColor, root.borderColor, tokens.border, tokens['color-border']),
    soft: first(card.backgroundColor, tokens.soft, tokens['color-background']),
    muted: first(tokens.muted, tokens['color-text-muted']),
    'font-family': first(root.fontFamily, tokens['font-family']),
    'font-size': first(root.fontSize, tokens['font-size']),
    'font-weight': first(root.fontWeight, tokens['font-weight']),
    'line-height': first(root.lineHeight, tokens['line-height']),
  };
  for (const [name, value] of Object.entries(aliases)) if (value !== undefined) tokens[name] = value;
  return normalizeDesignTokens(tokens);
}

function resolveGuidance(value, contract) {
  if (value == null) return null;
  assert(contract, 409, 'DESIGN_REVIEW_REQUIRED', 'Design guidance requires an approved contract');
  assert(value && typeof value === 'object' && !Array.isArray(value), 400, 'DESIGN_SYNTHESIS', 'Invalid approved design guidance');
  noPrototypeKeys(value);
  assert(Object.keys(value).every((key) => guidanceKeys.has(key)), 400, 'DESIGN_SYNTHESIS', 'Unsupported design guidance field');
  const body = Object.fromEntries(Object.keys(DESIGN_SYNTHESIS_SCHEMA.properties).map((key) => [key, value[key]]));
  assert(guidanceCheck(body), 400, 'DESIGN_SYNTHESIS', 'Invalid approved design guidance', guidanceCheck.errors);
  const bound = bindDesignSynthesis(body, contract);
  assert(value.contractFingerprint === bound.contractFingerprint, 409, 'DESIGN_CONTRACT_CHANGED', 'Design guidance belongs to another approved contract');
  assert(value.synthesisFingerprint === bound.synthesisFingerprint, 409, 'DESIGN_SYNTHESIS_CHANGED', 'Approved design guidance integrity failed');
  return bound;
}

/** Resolve once from project-owned, reviewed inputs, then pass this exact
 * context to generation, compilation and certification. This pure function
 * validates binding/integrity; the caller still verifies approval and scope. */
export function resolveDesignContext({ model = {}, approvedContract = null, approvedSynthesis = null, componentContracts = [] } = {}) {
  const projectVersion = model.projectVersion ?? 'unbound';
  assert(typeof projectVersion === 'string' && projectVersion.length > 0 && projectVersion.length <= 200, 400, 'DESIGN_PROJECT_VERSION', 'A bounded project version is required');
  const contract = approvedContract == null ? null : normalizeDesignContract(approvedContract);
  const roles = contract?.roles ?? {};
  const tokens = resolveTokens(model.designGenome?.hardTokens?.all ?? {}, roles);
  const guidance = resolveGuidance(approvedSynthesis, contract);
  const contracts = normalizeComponentDesignContracts(componentContracts, { tokens, roles, guidance });
  const approvedActions = new Set((model.capabilities ?? []).filter((capability) => capability.securityReviewed === true).map((capability) => capability.id));
  assert(contracts.every((contract) => contract.interaction.actions.every((action) => approvedActions.has(action))), 403, 'UNAPPROVED_ACTION', 'A component contract expanded the reviewed action set');
  const body = {
    version: DESIGN_CONTEXT_VERSION,
    projectVersion,
    contractFingerprint: contract ? hash(contract) : null,
    tokens,
    roles,
    viewport: contract?.viewport ?? null,
    guidance,
    componentContracts: contracts,
  };
  assert(Buffer.byteLength(canonical(body)) <= 180000, 400, 'DESIGN_CONTEXT_SIZE', 'Resolved design context exceeds its budget');
  return { ...body, hash: hash(body) };
}

export function assertDesignContext(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 400, 'DESIGN_CONTEXT', 'Resolved design context is required');
  noPrototypeKeys(value);
  assert(Object.keys(value).every((key) => contextKeys.has(key)) && [...contextKeys].every((key) => Object.hasOwn(value, key)), 400, 'DESIGN_CONTEXT', 'Invalid design context fields');
  assert(value.version === DESIGN_CONTEXT_VERSION, 400, 'DESIGN_CONTEXT_VERSION', 'Unsupported design context version');
  const { hash: claimed, ...body } = value;
  assert(typeof claimed === 'string' && /^[a-f0-9]{64}$/.test(claimed) && claimed === hash(body), 409, 'DESIGN_CONTEXT_TAMPER', 'Resolved design context integrity failed');
  assert(typeof value.projectVersion === 'string' && value.projectVersion.length > 0 && value.projectVersion.length <= 200, 400, 'DESIGN_PROJECT_VERSION', 'Invalid design project version');
  const tokens = normalizeDesignTokens(value.tokens);
  assert(canonical(tokens) === canonical(value.tokens), 400, 'DESIGN_TOKENS', 'Design tokens must already be normalized');
  let contract = null;
  if (value.contractFingerprint !== null) {
    contract = normalizeDesignContract({ roles: value.roles, viewport: value.viewport });
    assert(value.contractFingerprint === hash(contract), 409, 'DESIGN_CONTEXT_TAMPER', 'Approved design contract binding failed');
    assert(canonical(value.roles) === canonical(contract.roles) && canonical(value.viewport) === canonical(contract.viewport), 400, 'DESIGN_CONTEXT', 'Approved design evidence must already be normalized');
  } else {
    assert(value.roles && typeof value.roles === 'object' && !Array.isArray(value.roles) && Object.keys(value.roles).length === 0 && value.viewport === null, 400, 'DESIGN_CONTEXT', 'Unbound contexts cannot claim host roles or viewport evidence');
  }
  assert(canonical(resolveTokens(tokens, contract?.roles ?? {})) === canonical(tokens), 409, 'DESIGN_CONTEXT_TAMPER', 'Resolved host token bindings changed');
  const guidance = resolveGuidance(value.guidance, contract);
  assert(canonical(guidance) === canonical(value.guidance), 400, 'DESIGN_SYNTHESIS', 'Resolved design guidance must already be normalized');
  const contracts = normalizeComponentDesignContracts(value.componentContracts, { tokens, roles: value.roles, guidance });
  assert(canonical(contracts) === canonical(value.componentContracts), 400, 'COMPONENT_DESIGN_CONTRACT', 'Component design contracts must already be normalized');
  assert(Buffer.byteLength(canonical(body)) <= 180000, 400, 'DESIGN_CONTEXT_SIZE', 'Resolved design context exceeds its budget');
  return value;
}
