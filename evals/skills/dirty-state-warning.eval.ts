// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval: `dirty-state-warning` encodes the gate that suppresses a
 * navigation prompt when (a) the form is clean, (b) it has been mounted
 * less than 5 seconds, or (c) `intent.automation_trust === 'permissive'`
 * and a successful auto-save fired in the last 10 seconds. The eval
 * pins the three suppression branches against the skill body so a
 * silent edit cannot drop one without the eval flagging it.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(here, '../../skills/dirty-state-warning.skill.md');

export default defineEval({
  id: 'skill/dirty-state-warning/suppression-branches',
  description:
    'dirty-state-warning encodes the dirty + 5s mount + permissive autosave suppression branches.',
  kind: 'skill',
  tags: ['forms', 'navigation'],
  input: SKILL_PATH,
  run: async (path: string) => {
    const raw = await readFile(path, 'utf8');
    const parsed = parseSkillMarkdown(raw);
    const blob = `${parsed.skill.when_to_use}\n${parsed.skill.example_flow}\n${parsed.skill.when_not_to_use}`;
    return {
      name: parsed.skill.name,
      mentions_dirty_check: /is_dirty|dirty/.test(blob),
      mentions_mount_window: /5000|5\s*sec|5-second|< 5/.test(blob),
      mentions_permissive_branch: /permissive/.test(blob),
      mentions_autosave_window: /10[_\s-]?000|10\s*sec/.test(blob),
      uses_modal_confirmation: /confirmation:\s*'?modal'?/.test(blob),
    };
  },
  expected: {
    name: 'dirty-state-warning',
    mentions_dirty_check: true,
    mentions_mount_window: true,
    mentions_permissive_branch: true,
    mentions_autosave_window: true,
    uses_modal_confirmation: true,
  },
});
