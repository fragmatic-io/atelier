// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import type { Meta, StoryObj } from '@storybook/react';
import { useState, type ReactElement } from 'react';

import { ActionMenu, Drawer, Modal, type ActionMenuItem } from '../src/index.js';
import { COMPONENT_STORY_FIXTURES, COMPONENT_STORY_IDS, renderComponentStory } from './fixtures.js';

// Storybook's public `Meta` type carries permissive addon parameter shapes.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const meta = {
  title: 'Components/Catalog',
  parameters: {
    options: {
      showPanel: false,
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const AllComponents: Story = {
  name: 'All components',
  render: () => (
    <main data-cir-story-root>
      <section data-cir-story-shell>
        <header data-cir-story-header>
          <div>
            <h1>Atelier component catalog</h1>
            <p>
              Every registered `@atelier/components` binding gets a review fixture here. This is the
              visual contract generated manifests rely on.
            </p>
          </div>
          <span data-cir-story-count>{COMPONENT_STORY_IDS.length} components</span>
        </header>
        <div data-cir-story-grid>
          {COMPONENT_STORY_IDS.map((id) => {
            const fixture = COMPONENT_STORY_FIXTURES[id];
            return (
              <article key={id} data-cir-story-card data-cir-story-id={id}>
                <header data-cir-story-card-header>
                  <h2>{id}</h2>
                  <span>{fixture?.title ?? 'Missing fixture'}</span>
                </header>
                <div data-cir-story-stage>{renderComponentStory(id)}</div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  ),
};

export const InteractionPrimitives: Story = {
  name: 'Interaction primitives',
  render: () => <InteractionPrimitiveWorkbench />,
};

function InteractionPrimitiveWorkbench(): ReactElement {
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastAction, setLastAction] = useState('None');

  const menuItems: ActionMenuItem[] = [
    { id: 'approve', label: 'Approve', onSelect: () => setLastAction('Approve') },
    { id: 'assign', label: 'Assign', onSelect: () => setLastAction('Assign') },
    { id: 'escalate', label: 'Escalate', onSelect: () => setLastAction('Escalate') },
  ];

  return (
    <main data-cir-story-root>
      <section data-cir-story-shell>
        <header data-cir-story-header>
          <div>
            <h1>Interaction primitives</h1>
            <p>Focused review surface for Radix-backed menu, modal, and drawer behavior.</p>
          </div>
        </header>
        <section data-cir-interaction-workbench>
          <div data-cir-interaction-controls>
            <ActionMenu trigger="Actions" items={menuItems} />
            <button
              type="button"
              data-cir-open-modal
              onClick={() => {
                setModalOpen(true);
              }}
            >
              Open modal
            </button>
            <button
              type="button"
              data-cir-open-drawer
              onClick={() => {
                setDrawerOpen(true);
              }}
            >
              Open drawer
            </button>
          </div>
          <p data-cir-last-action>Last action: {lastAction}</p>
        </section>
        <Modal
          open={modalOpen}
          title="Manifest details"
          onClose={() => {
            setModalOpen(false);
          }}
        >
          <p>Validated at resolver.</p>
          <button
            type="button"
            data-cir-dialog-close
            onClick={() => {
              setModalOpen(false);
            }}
          >
            Close
          </button>
        </Modal>
        <Drawer
          open={drawerOpen}
          title="Customer context"
          onClose={() => {
            setDrawerOpen(false);
          }}
        >
          <p>Recent activity</p>
          <button
            type="button"
            data-cir-dialog-close
            onClick={() => {
              setDrawerOpen(false);
            }}
          >
            Close
          </button>
        </Drawer>
      </section>
    </main>
  );
}
