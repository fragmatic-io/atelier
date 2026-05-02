// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Per-test cleanup for `@testing-library/react`. With Vitest's
 * `globals: false` (the repo default), the library's auto-cleanup hook
 * does not register. Importing this file from each `*.test.tsx` wires
 * `cleanup()` to run after every test so DOM state from one test does not
 * leak into the next.
 */
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
