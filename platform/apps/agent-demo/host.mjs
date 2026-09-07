// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { AgentClient, defineClientTool, sameOriginTransport } from './client.mjs';
import { IndexedDbJournal } from './journal.mjs';
import { mountAgentChat } from './chat.mjs';
const bootstrap = await (await fetch('/api/bootstrap')).json();
const transport = sameOriginTransport('/api/agent', { csrf: () => bootstrap.csrf });
const client = new AgentClient({
  transport,
  journal: new IndexedDbJournal({
    namespace: `${bootstrap.tenantId}:${bootstrap.projectId}:${bootstrap.subject.id}`,
  }),
  tools: [
    defineClientTool({
      name: 'customer.get',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      execute: async ({ customerId }) => {
        const response = await fetch(`/api/customers/${encodeURIComponent(customerId)}`);
        if (!response.ok) throw new Error('Customer context failed');
        return response.json();
      },
    }),
    defineClientTool({
      name: 'intervention.create',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      execute: async ({ customerId, ...input }) => {
        const response = await fetch(
          `/api/customers/${encodeURIComponent(customerId)}/interventions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': bootstrap.csrf },
            body: JSON.stringify(input),
          },
        );
        if (!response.ok) throw new Error('Customer intervention failed');
        return response.json();
      },
    }),
  ],
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
    let confirmed = false;
    if (call.contract.kind === 'command') {
      const accepted = await confirm({
        title: `Confirm ${call.capabilityId}?`,
        description:
          'This changes the local business database. The backend rechecks your exact input and current permissions.',
        input: call.input,
        accept: 'Confirm action',
      });
      if (!accepted) {
        await transport({ action: 'deny', threadId, callId: call.id });
        throw new Error('The action was declined.');
      }
      confirmed = true;
    }
    const result = await client.executeClientTool(threadId, call, { confirmed });
    await refresh();
    return result;
  },
});
addEventListener('pagehide', () => client.close());
