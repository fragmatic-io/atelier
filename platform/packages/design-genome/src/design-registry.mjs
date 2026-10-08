// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { assert } from '../../control-plane/src/util.mjs';

export const DESIGN_REGISTRY_VERSION = 1;

// Approval and both renderers share this vocabulary. Selectors are
// implementation-owned; contracts contain values, never selectors.
export const DESIGN_ROLES = Object.freeze({
  root: '',
  button: 'button,[role="button"],[data-atelier-design-role="button"]',
  input: 'input,select,textarea,[data-atelier-design-role="input"]',
  card: '[data-surface-card],[data-atelier-design-role="card"]',
  nav: 'nav,[role="navigation"],[data-atelier-design-role="nav"]',
});

export const DESIGN_PROPERTIES = Object.freeze({
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  lineHeight: 'line-height',
  color: 'color',
  backgroundColor: 'background-color',
  borderColor: 'border-color',
  borderRadius: 'border-radius',
  paddingBlock: 'padding-block',
  paddingInline: 'padding-inline',
  height: 'height',
  gap: 'gap',
  boxShadow: 'box-shadow',
});

export function safeDesignValue(value, role = 'token', property = 'value') {
  assert(
    typeof value === 'string' &&
      value.trim().length > 0 &&
      value.length <= 180 &&
      !/url\s*\(|expression\s*\(|[;{}<>]|javascript:|@import/i.test(value) &&
      /^[\w\s#().,%/'"+-]+$/.test(value),
    400,
    'DESIGN_VALUE',
    `Unsafe ${role}.${property} design value`,
  );
  return value.trim();
}

export function designRoleStyles(scope, roles, { important = false } = {}) {
  assert(
    scope === '#root' || /^\[data-atelier-install="[A-Za-z0-9_-]{1,160}"\]$/.test(scope),
    400,
    'DESIGN_SCOPE',
    'Design styles require an implementation-owned root',
  );
  assert(roles && typeof roles === 'object' && !Array.isArray(roles), 400, 'DESIGN_ROLE', 'Invalid design roles');
  for (const role of Object.keys(roles))
    assert(Object.hasOwn(DESIGN_ROLES, role), 400, 'DESIGN_ROLE', 'Unknown design role');
  return Object.entries(DESIGN_ROLES)
    .filter(([role]) => Object.hasOwn(roles, role))
    .map(([role, selector]) => {
      const values = roles[role];
      assert(values && typeof values === 'object' && !Array.isArray(values), 400, 'DESIGN_ROLE', 'Invalid design role');
      for (const property of Object.keys(values))
        assert(Object.hasOwn(DESIGN_PROPERTIES, property), 400, 'DESIGN_PROPERTY', 'Unknown design property');
      const declarations = Object.entries(DESIGN_PROPERTIES)
        .filter(([property]) => Object.hasOwn(values, property))
        .map(([property, cssName]) => `${cssName}:${safeDesignValue(values[property], role, property)}${important ? '!important' : ''}`)
        .join(';');
      assert(declarations, 400, 'DESIGN_ROLE', 'Empty design role');
      return `${scope}${selector ? ` :where(${selector})` : ''}{${declarations}}`;
    })
    .join('');
}
