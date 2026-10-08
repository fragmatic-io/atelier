#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { fileURLToPath } from 'node:url';
import { collectSourceBinding, collectToolchain } from './acceptance/binding.mjs';
import { loadEvidenceConfiguration, verifySignedReport } from './acceptance/evidence.mjs';
import { ensure } from './acceptance/release-policy.mjs';
import { resolveBrowserPython } from './run-browser-integration.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
ensure(process.env.ATELIER_RELEASE_POLICY && process.env.ATELIER_RELEASE_EVIDENCE,
  'SECURITY_REVIEW_BLOCKED', 'Supply the operator trust policy and signed security evidence manifest');
const python = await resolveBrowserPython({ root });
const binding = await collectSourceBinding(root, { toolchain: collectToolchain(root, { python }) });
const configuration = await loadEvidenceConfiguration({
  binding,
  policyPath: process.env.ATELIER_RELEASE_POLICY,
  manifestPath: process.env.ATELIER_RELEASE_EVIDENCE,
});
// Trust comes from the separately configured reviewer roster, never from a
// public key supplied alongside an otherwise self-attested report.
const result = await verifySignedReport('independent-security', configuration);
process.stdout.write(`${JSON.stringify({ passed: true, ...result, gitCommit: binding.gitCommit })}\n`);
