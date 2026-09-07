// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { markupText } from './template-shared.mjs';

export function hostedScriptBundle(install) {
  const mountId = `atelier-${install.id}`;
  const snippet = `<div id="${markupText(mountId)}" data-atelier-mount></div>\n<script\n  type="module"\n  src="${markupText(install.controlOrigin)}/embed/v1.mjs"\n  data-atelier-install-key="${markupText(install.verificationKey)}"\n  data-atelier-mount="#${markupText(mountId)}"\n></script>`;
  return {
    files: [],
    patches: [
      {
        target: `the customer-owned page at ${install.routePath}`,
        purpose: `Mount the Atelier-hosted ${install.mode} UI with one script`,
        snippet,
      },
    ],
  };
}
