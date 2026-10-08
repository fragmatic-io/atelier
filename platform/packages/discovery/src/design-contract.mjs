// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { assert, choice, hash, noPrototypeKeys } from '../../control-plane/src/util.mjs';
import { DESIGN_ROLES, DESIGN_PROPERTIES, safeDesignValue } from '../../design-genome/src/design-registry.mjs';

export function normalizeDesignContract(input, { partial = false } = {}) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 400, 'DESIGN_CONTRACT', 'Design contract is required');
  noPrototypeKeys(input);
  assert(input.roles === undefined || (input.roles && typeof input.roles === 'object' && !Array.isArray(input.roles)), 400, 'DESIGN_ROLE', 'Invalid design roles');
  const roles = {};
  for (const [role, values] of Object.entries(input.roles ?? {})) {
    assert(Object.hasOwn(DESIGN_ROLES, role), 400, 'DESIGN_ROLE', 'Unknown design role');
    assert(values && typeof values === 'object' && !Array.isArray(values), 400, 'DESIGN_ROLE', 'Invalid design role');
    roles[role] = {};
    for (const [property, value] of Object.entries(values)) {
      assert(Object.hasOwn(DESIGN_PROPERTIES, property), 400, 'DESIGN_PROPERTY', 'Unknown design property');
      roles[role][property] = safeDesignValue(value, role, property);
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
