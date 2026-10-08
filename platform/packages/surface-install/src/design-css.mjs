// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

import { normalizeDesignContract } from '../../discovery/src/design-contract.mjs';
import { designRoleStyles } from '../../design-genome/src/design-registry.mjs';

export function designStyles(installId, contract) {
  return designRoleStyles(
    `[data-atelier-install="${installId}"]`,
    normalizeDesignContract(contract).roles,
  );
}
