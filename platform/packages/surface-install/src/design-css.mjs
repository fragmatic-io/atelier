// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

const allowed = new Set([
  'backgroundColor',
  'borderColor',
  'borderRadius',
  'boxShadow',
  'color',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'height',
  'letterSpacing',
  'lineHeight',
  'padding',
]);
const cssName = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const declarations = (values = {}) =>
  Object.entries(values)
    .filter(
      ([name, value]) =>
        allowed.has(name) &&
        typeof value === 'string' &&
        value.length <= 300 &&
        !/[{};]/.test(value) &&
        !/url\s*\(|@import/i.test(value),
    )
    .map(([name, value]) => `${cssName(name)}:${value}`)
    .join(';');

export function designStyles(installId, contract) {
  const scope = `[data-atelier-install="${installId}"]`;
  const roles = contract?.roles ?? {};
  return `${scope}{${declarations(roles.root)}}${scope} :where(button,[role=button]){${declarations(roles.button)}}${scope} :where(input,select,textarea){${declarations(roles.input)}}${scope} :where([data-surface-card]){${declarations(roles.card)}}`;
}
