// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { createElement, type CSSProperties } from 'react';
import type { Decorator, Preview } from '@storybook/react';

import { brandKitToCssVars, resolveAtelierBrandKit } from '../src/index.js';

import './storybook.css';

type BrandStyle = CSSProperties & Record<`--atelier-${string}`, string>;

const brandDecorator: Decorator = (Story, context) => {
  const brandKit = resolveAtelierBrandKit(readDesignSystemGlobal(context as unknown));
  const style = brandKitToCssVars(brandKit) as BrandStyle;

  return createElement(
    'div',
    {
      'data-atelier-brand': brandKit.id,
      'data-atelier-brand-version': brandKit.version,
      style,
    },
    createElement(Story),
  );
};

function readDesignSystemGlobal(context: unknown): string | undefined {
  if (typeof context !== 'object' || context === null || !('globals' in context)) {
    return undefined;
  }

  const globals = context.globals;
  if (typeof globals !== 'object' || globals === null || !('designSystem' in globals)) {
    return undefined;
  }

  const value = globals.designSystem;
  return typeof value === 'string' ? value : undefined;
}

const preview: Preview = {
  decorators: [brandDecorator],
  globalTypes: {
    designSystem: {
      description: 'Brand kit preset used by the component catalog',
      defaultValue: 'neutral',
      toolbar: {
        title: 'Design system',
        icon: 'paintbrush',
        dynamicTitle: true,
        items: [
          { value: 'neutral', title: 'Atelier Neutral' },
          { value: 'commerce', title: 'Commerce Ops' },
          { value: 'console', title: 'Ops Console' },
        ],
      },
    },
  },
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
