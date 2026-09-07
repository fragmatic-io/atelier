// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { assert, choice, hash, noPrototypeKeys } from '../../control-plane/src/util.mjs';

const ROLES = new Set(['root', 'button', 'input', 'card', 'nav']);
const PROPERTIES = new Set([
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'color',
  'backgroundColor',
  'borderColor',
  'borderRadius',
  'paddingBlock',
  'paddingInline',
  'height',
  'gap',
  'boxShadow',
]);

function cssValue(value, role, property) {
  assert(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 180 &&
      !/url\s*\(|[;{}<>]|javascript:/i.test(value) &&
      /^[\w\s#().,%/'"+-]+$/.test(value),
    400,
    'DESIGN_VALUE',
    `Unsafe ${role}.${property} design value`,
  );
  return value.trim();
}

export function normalizeDesignContract(input, { partial = false } = {}) {
  assert(input && typeof input === 'object', 400, 'DESIGN_CONTRACT', 'Design contract is required');
  noPrototypeKeys(input);
  const roles = {};
  for (const [role, values] of Object.entries(input.roles ?? {})) {
    assert(ROLES.has(role), 400, 'DESIGN_ROLE', 'Unknown design role');
    assert(values && typeof values === 'object', 400, 'DESIGN_ROLE', 'Invalid design role');
    roles[role] = {};
    for (const [property, value] of Object.entries(values)) {
      assert(PROPERTIES.has(property), 400, 'DESIGN_PROPERTY', 'Unknown design property');
      roles[role][property] = cssValue(value, role, property);
    }
    assert(Object.keys(roles[role]).length > 0, 400, 'DESIGN_ROLE', 'Empty design role');
  }
  assert(partial || roles.root, 400, 'DESIGN_ROOT', 'The approved design root is required');
  const viewport = input.viewport
    ? {
        bucket: choice(input.viewport.bucket, ['mobile', 'tablet', 'desktop'], 'Viewport bucket'),
        colorScheme: choice(input.viewport.colorScheme, ['light', 'dark'], 'Color scheme'),
      }
    : partial
      ? undefined
      : { bucket: 'desktop', colorScheme: 'light' };
  return {
    version: 1,
    ...(viewport ? { viewport } : {}),
    roles,
    privacy: {
      pageTextCaptured: false,
      domCaptured: false,
      formValuesCaptured: false,
      computedStylesOnly: true,
    },
  };
}

export function mergeDesignContract(observed, overrides = {}) {
  const safeObserved = normalizeDesignContract(observed),
    safeOverrides = normalizeDesignContract(overrides, { partial: true });
  return normalizeDesignContract({
    ...safeObserved,
    ...(safeOverrides.viewport ? { viewport: safeOverrides.viewport } : {}),
    roles: Object.fromEntries(
      [...new Set([...Object.keys(safeObserved.roles), ...Object.keys(safeOverrides.roles)])].map(
        (role) => [role, { ...safeObserved.roles[role], ...safeOverrides.roles[role] }],
      ),
    ),
  });
}

export const designFingerprint = (contract) => hash(normalizeDesignContract(contract));
