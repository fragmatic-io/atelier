// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import type { Meta, StoryObj } from '@storybook/react';

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
              <article key={id} data-cir-story-card>
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
