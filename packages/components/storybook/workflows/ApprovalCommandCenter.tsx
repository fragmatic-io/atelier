// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

import { useMemo, useState, type ReactElement } from 'react';
import { CommandPalette, Modal, type CommandPaletteCommand } from '../../src/index.js';
import { APPROVALS } from './workflow-data.js';

export function ApprovalCommandCenter(): ReactElement {
  const [selectedId, setSelectedId] = useState(APPROVALS[0]?.id ?? '');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [audit, setAudit] = useState('Approval queue synced from capability audit state.');

  const selected = useMemo(
    () => APPROVALS.find((item) => item.id === selectedId) ?? APPROVALS[0],
    [selectedId],
  );

  const commands: CommandPaletteCommand[] = [
    {
      id: 'approve',
      label: `Approve ${selected?.id ?? 'request'}`,
      group: 'Approval',
      hotkey: 'cmd+enter',
      icon: 'check',
      onSelect: () => {
        setConfirmOpen(true);
      },
    },
    {
      id: 'reassign',
      label: 'Reassign to policy owner',
      group: 'Routing',
      hotkey: 'cmd+r',
      icon: 'user-round',
      onSelect: () => {
        setAudit(`Reassigned ${selected?.id} to policy owner.`);
      },
    },
    {
      id: 'hold',
      label: 'Place on hold',
      group: 'Risk',
      hotkey: 'cmd+h',
      icon: 'pause',
      onSelect: () => {
        setAudit(`Placed ${selected?.id} on hold pending more evidence.`);
      },
    },
  ];

  return (
    <section data-cir-workflow="ApprovalCommandCenter">
      <header data-cir-workflow-header>
        <div>
          <p data-cir-kicker>Approval command center</p>
          <h2>Policy-aware approvals</h2>
        </div>
        <button
          type="button"
          data-cir-open-command-palette
          onClick={() => {
            setPaletteOpen(true);
          }}
        >
          Open command palette
        </button>
      </header>

      <div data-cir-approval-layout>
        <aside data-cir-approval-queue aria-label="Approvals">
          {APPROVALS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-cir-approval-item
              data-selected={item.id === selected?.id}
              onClick={() => {
                setSelectedId(item.id);
                setAudit(`Focused ${item.id}.`);
              }}
            >
              <span>
                <small>{item.id}</small>
                <strong>{item.title}</strong>
                <small>{item.requester}</small>
              </span>
              <em>{item.due}</em>
            </button>
          ))}
        </aside>

        <section data-cir-command-main>
          <div data-cir-command-record>
            <p data-cir-record-id>{selected?.id}</p>
            <h3>{selected?.title}</h3>
            <dl>
              <dt>Policy</dt>
              <dd>{selected?.policy}</dd>
              <dt>Impact</dt>
              <dd>{selected?.impact}</dd>
              <dt>Status</dt>
              <dd>{selected?.status}</dd>
            </dl>
          </div>

          <div data-cir-command-actions>
            <button
              type="button"
              data-cir-primary-approve
              onClick={() => {
                setConfirmOpen(true);
              }}
            >
              Approve with confirmation
            </button>
            <button
              type="button"
              onClick={() => {
                setAudit(`Requested more evidence for ${selected?.id}.`);
              }}
            >
              Request evidence
            </button>
          </div>

          <p data-cir-audit-line>{audit}</p>
        </section>
      </div>

      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => {
          setPaletteOpen(false);
        }}
        bindOpenHotkey={false}
      />

      <Modal
        open={confirmOpen}
        title="Confirm approval dispatch"
        onClose={() => {
          setConfirmOpen(false);
        }}
      >
        <p data-cir-modal-copy>
          This will dispatch the selected capability action and write an audit entry.
        </p>
        <button
          type="button"
          data-cir-confirm-approval
          onClick={() => {
            setConfirmOpen(false);
            setAudit(`Approved ${selected?.id} and dispatched audited action.`);
          }}
        >
          Confirm approval
        </button>
      </Modal>
    </section>
  );
}
