// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { AgentClient, sameOriginTransport } from './client.mjs';
import { IndexedDbJournal } from './journal.mjs';
import { mountAgentChat } from './chat.mjs';
const bootstrap = await (await fetch('/api/bootstrap')).json();
const transport = sameOriginTransport('/api/agent', { csrf: () => bootstrap.csrf });
const client = new AgentClient({
  transport,
  journal: new IndexedDbJournal({
    namespace: `${bootstrap.tenantId}:${bootstrap.projectId}:${bootstrap.subject.id}`,
  }),
});
async function refresh() {
  const b = await (await fetch('/api/bootstrap')).json();
  document.getElementById('counter').textContent =
    `${b.customer.interventions} recorded intervention(s)`;
}
document.getElementById('refresh').onclick = refresh;
await refresh();
mountAgentChat(document.getElementById('chat'), {
  client,
  name: 'Northstar assistant',
  subtitle:
    'Explicit offline model fixture. Actual host authorization, customer data and confirmed interventions.',
  context: bootstrap.context,
  mode: 'model',
  onTool: async ({ threadId, call, confirm }) => {
    let ticket;
    if (call.contract.kind === 'command') {
      const proposed = await transport({ action: 'confirm', threadId, callId: call.id });
      const accepted = await confirm({
        title: `Confirm ${call.capabilityId}?`,
        description:
          'This changes the local business database. The backend rechecks your exact input and current permissions.',
        input: proposed.input,
        accept: 'Confirm action',
      });
      if (!accepted) {
        await transport({ action: 'deny', threadId, callId: call.id });
        throw new Error('The action was declined.');
      }
      ticket = proposed.ticket;
    }
    const result = await transport({
      action: 'execute',
      threadId,
      callId: call.id,
      input: { ticket },
    });
    await refresh();
    return result;
  },
});
addEventListener('pagehide', () => client.close());
