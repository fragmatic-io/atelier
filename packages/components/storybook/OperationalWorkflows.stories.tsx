// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

import type { Meta, StoryObj } from '@storybook/react';
import {
  ApprovalCommandCenter as ApprovalCommandCenterWorkflow,
  CustomerContextPanel as CustomerContextPanelWorkflow,
  ExceptionReviewWorkbench as ExceptionReviewWorkbenchWorkflow,
} from './workflows/index.js';

// Storybook's public `Meta` type carries permissive addon parameter shapes.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const meta = {
  title: 'Components/Operational workflows',
  parameters: {
    options: {
      showPanel: false,
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ExceptionReviewWorkbench: Story = {
  name: 'ExceptionReviewWorkbench',
  render: () => (
    <main data-cir-story-root>
      <section data-cir-story-shell>
        <ExceptionReviewWorkbenchWorkflow />
      </section>
    </main>
  ),
};

export const CustomerContextPanel: Story = {
  name: 'CustomerContextPanel',
  render: () => (
    <main data-cir-story-root>
      <section data-cir-story-shell>
        <CustomerContextPanelWorkflow />
      </section>
    </main>
  ),
};

export const ApprovalCommandCenter: Story = {
  name: 'ApprovalCommandCenter',
  render: () => (
    <main data-cir-story-root>
      <section data-cir-story-shell>
        <ApprovalCommandCenterWorkflow />
      </section>
    </main>
  ),
};

export const AllOperationalWorkflows: Story = {
  name: 'All operational workflows',
  render: () => (
    <main data-cir-story-root>
      <section data-cir-story-shell data-cir-workflow-stack>
        <ExceptionReviewWorkbenchWorkflow />
        <CustomerContextPanelWorkflow />
        <ApprovalCommandCenterWorkflow />
      </section>
    </main>
  ),
};
