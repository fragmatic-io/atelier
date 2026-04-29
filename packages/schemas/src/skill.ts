// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill schema — the structured frontmatter of a `.skill.md` file.
 *
 * Mirrors the YAML in `/Users/vid/cir/docs/artifacts.md` §Skill. Only the
 * frontmatter is structured; the markdown body (the prose explanation the
 * compiler reads) is NOT validated here. A frontmatter parser lives in
 * `@cir/policies` (Phase 3).
 *
 * Skills are "a capability plus how to use it well" — the smallest unit
 * of company knowledge safely transferable to an agent (ETHOS principle 4).
 */

import { z } from 'zod';
import { CapabilityId, SemverString, SkillId } from './common.js';

export const SkillSchema = z.object({
  /** Skill identifier — matches the filename, lowercase + dashes. */
  name: SkillId,
  /** Semver of this skill. Bump on any meaningful change. */
  version: SemverString,
  /** One-line summary that the compiler can scan during retrieval. */
  description: z.string().min(1),
  /** Capability IDs this skill orchestrates. */
  capabilities_used: z.array(CapabilityId),
  /** Free-form prose: when this skill applies. */
  when_to_use: z.string().min(1),
  /** Free-form prose: when NOT to apply this skill (false-positive guards). */
  when_not_to_use: z.string().min(1),
  /** Step-by-step example of the skill in action. */
  example_flow: z.string().min(1),
  /** Known ways this skill can mislead — used by evals and the compiler's caution layer. */
  known_failure_modes: z.array(z.string()),
});

/** Inferred TypeScript type for a Skill. */
export type Skill = z.infer<typeof SkillSchema>;
