// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: `bulk-edit-affordance` gates the checkbox column on the
 * existence of a `*.bulk_*` capability, surfaces a sticky action bar
 * once selection is non-empty, and pins the standard keyboard shortcuts
 * (Cmd+A, Esc, Shift+Click). The eval ensures none of the four
 * load-bearing rules drift out of the skill body.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(here, '../../skills/bulk-edit-affordance.skill.md');

export default defineEval({
  id: 'skill/bulk-edit-affordance/gates-and-shortcuts',
  description:
    'bulk-edit-affordance gates checkbox column on bulk_* capability and pins Cmd+A / Esc shortcuts.',
  kind: 'skill',
  tags: ['lists', 'tables', 'bulk'],
  input: SKILL_PATH,
  run: async (path: string) => {
    const raw = await readFile(path, 'utf8');
    const parsed = parseSkillMarkdown(raw);
    const blob = `${parsed.skill.when_to_use}\n${parsed.skill.example_flow}\n${parsed.skill.known_failure_modes.join('\n')}`;
    return {
      name: parsed.skill.name,
      mentions_bulk_capability_gate: /\.bulk_/.test(blob),
      mentions_cmd_a: /Cmd\/Ctrl\+A|Cmd\+A/.test(blob),
      mentions_esc_clear: /Esc/.test(blob),
      mentions_shift_click: /Shift\+Click/i.test(blob),
      mentions_floating_bar: /floating|sticky/i.test(blob),
      confirms_destructive: /verbal_required|ConfirmDialog/i.test(blob),
    };
  },
  expected: {
    name: 'bulk-edit-affordance',
    mentions_bulk_capability_gate: true,
    mentions_cmd_a: true,
    mentions_esc_clear: true,
    mentions_shift_click: true,
    mentions_floating_bar: true,
    confirms_destructive: true,
  },
});
