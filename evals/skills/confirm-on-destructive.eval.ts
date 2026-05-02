// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: `confirm-on-destructive` pins the per-action confirmation
 * table — `'modal'` for delete-one, `'verbal_required'` for delete-many
 * or unrecoverable actions — and the hard rule that
 * `automation_trust === 'permissive'` never bypasses the gate. The
 * `'verbal_required'` value is a real `ConfirmationLevel` (Wave 5c).
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(here, '../../skills/confirm-on-destructive.skill.md');

export default defineEval({
  id: 'skill/confirm-on-destructive/levels-and-permissive-rule',
  description:
    'confirm-on-destructive pins modal vs verbal_required by cardinality + reversibility, and forbids permissive bypass.',
  kind: 'skill',
  tags: ['confirmation', 'destructive'],
  input: SKILL_PATH,
  run: async (path: string) => {
    const raw = await readFile(path, 'utf8');
    const parsed = parseSkillMarkdown(raw);
    const blob = `${parsed.skill.when_to_use}\n${parsed.skill.example_flow}\n${parsed.skill.known_failure_modes.join('\n')}`;
    return {
      name: parsed.skill.name,
      mentions_modal_for_single: /modal/i.test(blob) && /single|delete-one|one row/i.test(blob),
      mentions_verbal_required: /verbal_required/.test(blob),
      mentions_permissive_no_bypass:
        /permissive/.test(blob) && /(never|not|no)\s+(auto|bypass|suppress|skip)/i.test(blob),
      mentions_typed_phrase: /phrase/i.test(blob),
      audit_consent: /audit/i.test(blob),
    };
  },
  expected: {
    name: 'confirm-on-destructive',
    mentions_modal_for_single: true,
    mentions_verbal_required: true,
    mentions_permissive_no_bypass: true,
    mentions_typed_phrase: true,
    audit_consent: true,
  },
});
