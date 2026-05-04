import { describe, expect, it } from 'vitest';

import { COMPONENT_BINDINGS } from '../src/registry.js';
import { COMPONENT_STORY_FIXTURES } from '../storybook/fixtures.js';

describe('Storybook component coverage', () => {
  it('has one review fixture per registered component binding', () => {
    expect(Object.keys(COMPONENT_STORY_FIXTURES).sort()).toEqual(
      Object.keys(COMPONENT_BINDINGS).sort(),
    );
  });
});
