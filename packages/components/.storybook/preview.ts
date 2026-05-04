// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import type { Preview } from '@storybook/react';

import './storybook.css';

const preview: Preview = {
  parameters: {
    a11y: {
      test: 'todo',
    },
    controls: {
      expanded: true,
    },
    layout: 'fullscreen',
  },
};

export default preview;
