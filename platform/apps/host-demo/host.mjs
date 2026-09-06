// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { mountSurface } from '/surface.mjs';
import { createHostClient } from '/host-client.mjs';
const { csrf } = await (await fetch('/api/bootstrap')).json();
const host = createHostClient({ csrfToken: () => csrf }),
  root = document.getElementById('extension'),
  slotId = 'customer.detail.right-rail',
  context = { customerId: 'northstar' };
try {
  const { bundle } = await host.resolve(slotId, context);
  if (!bundle) {
    root.textContent =
      'No approved staging surface yet. Publish one in Atelier Studio, then reload.';
  } else
    mountSurface(root, bundle, {
      context,
      load: (capability, context, signal) =>
        host.load({ slotId, releaseId: bundle.releaseId, capability, context }, signal),
      dispatch: async (capability, input) => {
        const args = { slotId, releaseId: bundle.releaseId, capability, input, context };
        const { ticket } = await host.confirm(args);
        return host.dispatch({ ...args, ticket });
      },
    });
} catch (error) {
  root.textContent =
    'The extension is unavailable. Your existing app is unaffected. ' + error.message;
}
