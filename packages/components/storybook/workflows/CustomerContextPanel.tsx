// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

import { useMemo, useState, type ReactElement } from 'react';
import { Drawer, Select, Tabs } from '../../src/index.js';
import { CUSTOMERS } from './workflow-data.js';

const LENS_OPTIONS = [
  { value: 'risk', label: 'Risk lens' },
  { value: 'revenue', label: 'Revenue lens' },
  { value: 'support', label: 'Support lens' },
];

export function CustomerContextPanel(): ReactElement {
  const [customerId, setCustomerId] = useState(CUSTOMERS[0]?.id ?? '');
  const [lens, setLens] = useState('risk');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const customer = useMemo(
    () => CUSTOMERS.find((item) => item.id === customerId) ?? CUSTOMERS[0],
    [customerId],
  );

  return (
    <section data-cir-workflow="CustomerContextPanel">
      <header data-cir-workflow-header>
        <div>
          <p data-cir-kicker>Customer context</p>
          <h2>{customer?.name}</h2>
        </div>
        <Select label="View" options={LENS_OPTIONS} value={lens} onChange={setLens} />
      </header>

      <div data-cir-context-grid>
        <nav data-cir-customer-list aria-label="Customers">
          {CUSTOMERS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-cir-customer-row
              data-selected={item.id === customer?.id}
              onClick={() => {
                setCustomerId(item.id);
              }}
            >
              <strong>{item.name}</strong>
              <span>{item.health}</span>
            </button>
          ))}
        </nav>

        <section data-cir-customer-main>
          <div data-cir-profile-strip>
            <dl>
              <dt>Segment</dt>
              <dd>{customer?.segment}</dd>
            </dl>
            <dl>
              <dt>Plan</dt>
              <dd>{customer?.plan}</dd>
            </dl>
            <dl>
              <dt>ARR</dt>
              <dd>{customer?.arr}</dd>
            </dl>
            <dl>
              <dt>Owner</dt>
              <dd>{customer?.owner}</dd>
            </dl>
          </div>

          <Tabs
            defaultActiveId="summary"
            tabs={[
              {
                id: 'summary',
                label: 'Summary',
                content: (
                  <div data-cir-context-copy>
                    <p>{customer?.risk}</p>
                    <p>Latest manifest route compiled with role-scoped customer data grants.</p>
                  </div>
                ),
              },
              {
                id: 'timeline',
                label: 'Timeline',
                content: (
                  <ol data-cir-mini-timeline>
                    <li>Refund exception opened by support ops.</li>
                    <li>Policy evaluator requested verbal confirmation.</li>
                    <li>Account owner reviewed carrier dispute notes.</li>
                  </ol>
                ),
              },
              {
                id: 'policies',
                label: 'Policies',
                content: (
                  <ul data-cir-policy-list>
                    <li>Data grant: customer.read</li>
                    <li>Action grant: refund.write with confirmation</li>
                    <li>Audit sink: operational_decisions</li>
                  </ul>
                ),
              },
            ]}
          />

          <footer data-cir-context-footer>
            <span data-cir-lens>Active lens: {lens}</span>
            <button
              type="button"
              data-cir-open-notes
              onClick={() => {
                setDrawerOpen(true);
              }}
            >
              Open risk notes
            </button>
          </footer>
        </section>
      </div>

      <Drawer
        open={drawerOpen}
        title="Risk notes"
        onClose={() => {
          setDrawerOpen(false);
        }}
      >
        <div data-cir-drawer-notes>
          <p>{customer?.risk}</p>
          <p>Next step: request accountable owner confirmation before dispatch.</p>
        </div>
      </Drawer>
    </section>
  );
}
