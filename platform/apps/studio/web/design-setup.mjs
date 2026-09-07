// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

const value = (contract, role, property) => contract?.roles?.[role]?.[property] ?? '';

export function designReviewFields(observation, e) {
  const contract = observation.contract;
  return `<div class="privacy-preview"><strong>Computed styles only</strong><p>${e(observation.sourceName)} observed this contract. No page text, HTML, form value or user data is present. Saving creates a versioned contract used by generated surface kits.</p></div><div class="two-fields"><label>Font family<input name="fontFamily" value="${e(value(contract, 'root', 'fontFamily'))}" required></label><label>Base font size<input name="fontSize" value="${e(value(contract, 'root', 'fontSize'))}" required></label></div><div class="two-fields"><label>Foreground<input name="color" value="${e(value(contract, 'root', 'color'))}" required></label><label>Background<input name="backgroundColor" value="${e(value(contract, 'root', 'backgroundColor'))}" required></label></div><div class="two-fields"><label>Control radius<input name="borderRadius" value="${e(value(contract, 'button', 'borderRadius') || value(contract, 'root', 'borderRadius'))}" required></label><label>Control height<input name="height" value="${e(value(contract, 'button', 'height') || value(contract, 'input', 'height'))}" required></label></div><label class="checkbox"><input type="checkbox" name="reviewed" required>I reviewed these host design tokens and approve them for generated surfaces.</label>`;
}

export function designOverrides(body) {
  return {
    roles: {
      root: {
        fontFamily: body.fontFamily,
        fontSize: body.fontSize,
        color: body.color,
        backgroundColor: body.backgroundColor,
      },
      button: { borderRadius: body.borderRadius, height: body.height },
      input: { borderRadius: body.borderRadius, height: body.height },
    },
  };
}
