// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Skill markdown parser.
 *
 * A `.skill.md` file is a YAML frontmatter block followed by a free-form
 * markdown body. The YAML is the structured contract validated by
 * `SkillSchema`; the body is the prose the compiler actually reads to
 * understand "how to use the capability well" (ETHOS principle 4).
 *
 * `parseSkillMarkdown` parses the raw file source via `gray-matter`,
 * validates the frontmatter against `SkillSchema`, and returns both the
 * typed skill and the trimmed body. Throws a `ZodError` when the
 * frontmatter is missing or malformed.
 */

import matter from 'gray-matter';
import { SkillSchema, type Skill } from './skill.js';

export interface ParsedSkill {
  /** Validated frontmatter as a Skill. */
  skill: Skill;
  /** Markdown body after the frontmatter. May be empty. */
  body: string;
}

/**
 * Parse a `.skill.md` source string and validate the frontmatter.
 *
 * @throws ZodError when the frontmatter is missing or fails `SkillSchema`.
 */
export function parseSkillMarkdown(source: string): ParsedSkill {
  const { data, content } = matter(source);
  const skill = SkillSchema.parse(data);
  return { skill, body: content.trim() };
}
