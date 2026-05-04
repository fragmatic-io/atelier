// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

import { useMemo, useState, type ReactElement } from 'react';
import { ActionMenu, Modal, Select, Tabs, Tooltip } from '../../src/index.js';
import { EXCEPTIONS, type ExceptionRecord } from './workflow-data.js';

const OWNER_OPTIONS = [
  { value: 'Maya', label: 'Maya' },
  { value: 'Jon', label: 'Jon' },
  { value: 'Unassigned', label: 'Unassigned' },
];

export function ExceptionReviewWorkbench(): ReactElement {
  const [selectedId, setSelectedId] = useState(EXCEPTIONS[0]?.id ?? '');
  const [owner, setOwner] = useState('Maya');
  const [modalOpen, setModalOpen] = useState(false);
  const [audit, setAudit] = useState('Loaded resolver-validated exception queue.');

  const selected = useMemo(
    () => EXCEPTIONS.find((item) => item.id === selectedId) ?? EXCEPTIONS[0],
    [selectedId],
  );

  return (
    <section data-cir-workflow="ExceptionReviewWorkbench">
      <header data-cir-workflow-header>
        <div>
          <p data-cir-kicker>Exception review</p>
          <h2>High-risk operational decisions</h2>
        </div>
        <div data-cir-workflow-metric>
          <span>{EXCEPTIONS.length}</span>
          <small>open exceptions</small>
        </div>
      </header>

      <div data-cir-workbench-grid>
        <aside data-cir-queue-panel aria-label="Exception queue">
          {EXCEPTIONS.map((item) => (
            <ExceptionQueueButton
              key={item.id}
              item={item}
              selected={item.id === selected?.id}
              onSelect={() => {
                setSelectedId(item.id);
                setAudit(`Opened ${item.id} for policy review.`);
              }}
            />
          ))}
        </aside>

        <main data-cir-decision-panel>
          <div data-cir-decision-toolbar>
            <div>
              <p data-cir-record-id>{selected?.id}</p>
              <h3>{selected?.title}</h3>
            </div>
            <ActionMenu
              trigger="Actions"
              items={[
                {
                  id: 'assign',
                  label: 'Assign owner',
                  onSelect: () => {
                    setAudit(`Assigned ${selected?.id} to ${owner}.`);
                  },
                },
                {
                  id: 'escalate',
                  label: 'Escalate',
                  onSelect: () => {
                    setAudit(`Escalated ${selected?.id} to compliance lead.`);
                  },
                },
              ]}
            />
          </div>

          <div data-cir-decision-summary>
            <span data-severity={selected?.severity}>{selected?.severity}</span>
            <span>{selected?.customer}</span>
            <span>{selected?.amount}</span>
            <span>{selected?.age}</span>
          </div>

          <Tabs
            tabs={[
              {
                id: 'evidence',
                label: 'Evidence',
                content: (
                  <div data-cir-evidence-grid>
                    <p>{selected?.reason}</p>
                    <dl>
                      <dt>Status</dt>
                      <dd>{selected?.status}</dd>
                      <dt>Policy</dt>
                      <dd>baseline.confirmation.verbal_required</dd>
                      <dt>Grant</dt>
                      <dd>refund:write scoped to support manager</dd>
                    </dl>
                  </div>
                ),
              },
              {
                id: 'policy',
                label: 'Policy',
                content: (
                  <div data-cir-policy-stack>
                    <p>Required confirmation cannot be omitted by generated UI.</p>
                    <p>Resolver validation passed before this workbench rendered.</p>
                  </div>
                ),
              },
            ]}
          />

          <div data-cir-approval-row>
            <Select label="Owner" options={OWNER_OPTIONS} value={owner} onChange={setOwner} />
            <Tooltip content="Records confirmation intent before dispatch">
              <button
                type="button"
                data-cir-resolve-exception
                onClick={() => {
                  setModalOpen(true);
                }}
              >
                Resolve exception
              </button>
            </Tooltip>
          </div>

          <p data-cir-audit-line>{audit}</p>
        </main>
      </div>

      <Modal
        open={modalOpen}
        title="Confirm exception resolution"
        onClose={() => {
          setModalOpen(false);
        }}
      >
        <p data-cir-modal-copy>
          Resolution will dispatch a reversible refund action with audit trail attached.
        </p>
        <button
          type="button"
          data-cir-confirm-resolution
          onClick={() => {
            setModalOpen(false);
            setAudit(`Resolved ${selected?.id} with ${owner} as accountable owner.`);
          }}
        >
          Confirm resolution
        </button>
      </Modal>
    </section>
  );
}

function ExceptionQueueButton({
  item,
  selected,
  onSelect,
}: {
  item: ExceptionRecord;
  selected: boolean;
  onSelect: () => void;
}): ReactElement {
  return (
    <button type="button" data-cir-queue-item data-selected={selected} onClick={onSelect}>
      <span>
        <strong>{item.id}</strong>
        <small>{item.customer}</small>
      </span>
      <span data-severity={item.severity}>{item.severity}</span>
    </button>
  );
}
