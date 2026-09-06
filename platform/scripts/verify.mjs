#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// Kept for callers of the older path; it runs the current verifier, not cached V2.1 evidence.
if (!process.argv.includes('--package')) process.argv.push('--package');
await import('./reconstruction-verify.mjs');
