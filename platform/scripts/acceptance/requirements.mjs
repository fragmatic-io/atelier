// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const statuses = new Set(['missing', 'partial', 'implemented', 'verified', 'externally_blocked']);
const classifications = new Set([
  'unit',
  'integration',
  'browser',
  'live',
  'operations',
  'documentation',
]);

export async function validateRequirements(root, profile = 'core') {
  const path = join(root, 'docs/v2.3/REQUIREMENTS.json');
  const ledger = JSON.parse(await readFile(path, 'utf8'));
  if (
    ledger.schemaVersion !== 1 ||
    ledger.release !== '2.3.0-rc.1' ||
    !Array.isArray(ledger.requirements)
  ) {
    throw new Error('REQUIREMENTS_SCHEMA: invalid v2.3 requirements ledger');
  }
  const ids = new Set();
  const errors = [];
  for (const item of ledger.requirements) {
    if (!/^V23-[A-Z]+-\d{2}$/.test(item.id) || ids.has(item.id))
      errors.push(`${item.id ?? 'unknown'} has an invalid or duplicate ID`);
    ids.add(item.id);
    if (typeof item.behavior !== 'string' || item.behavior.length < 20)
      errors.push(`${item.id} needs a concrete behavior`);
    if (!statuses.has(item.status)) errors.push(`${item.id} has an invalid status`);
    if (!classifications.has(item.classification))
      errors.push(`${item.id} has an invalid evidence classification`);
    if (!Array.isArray(item.implementation) || !item.implementation.length)
      errors.push(`${item.id} has no implementation paths`);
    if (!Array.isArray(item.tests) || !item.tests.length)
      errors.push(`${item.id} has no tests or acceptance harness`);
    if (!Array.isArray(item.limitations))
      errors.push(`${item.id} has no explicit limitations array`);
    for (const file of [...(item.implementation ?? []), ...(item.tests ?? [])]) {
      try {
        await access(join(root, file));
      } catch {
        errors.push(`${item.id} references missing path ${file}`);
      }
    }
    if (['missing', 'partial'].includes(item.status)) errors.push(`${item.id} is ${item.status}`);
    if (item.status === 'externally_blocked' && !item.limitations.length)
      errors.push(`${item.id} is externally blocked without a reason`);
    if (profile === 'release' && item.status !== 'verified')
      errors.push(`${item.id} is ${item.status}; release profile requires verified`);
  }
  if (errors.length) throw new Error(`REQUIREMENTS_FAILED:\n${errors.join('\n')}`);
  return {
    count: ledger.requirements.length,
    statuses: Object.fromEntries(
      [...statuses].map((status) => [
        status,
        ledger.requirements.filter((item) => item.status === status).length,
      ]),
    ),
    releaseReady: ledger.requirements.every((item) => item.status === 'verified'),
  };
}
