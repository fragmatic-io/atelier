// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Registry of named exported schemas.
 *
 * Used by the CLI: `dump` walks the registry and writes one JSON Schema per
 * entry; `validate-data` looks up the right schema by path prefix.
 *
 * One source of truth for "which schemas does this package publish."
 */

import type { ZodSchema } from 'zod';
import { BrandKitSchema } from '../brand-kit.js';
import { CapabilitySchema } from '../capability.js';
import { ComponentDefinitionSchema, ComponentRegistrySchema } from '../component.js';
import { ConversationOverlaySchema, IntentProfileSchema } from '../intent.js';
import { ManifestSchema, ThreadManifestSchema, TurnDeltaSchema } from '../manifest.js';
import { PolicySchema } from '../policy.js';
import { SkillSchema } from '../skill.js';
import { TriggerSchema } from '../trigger.js';
import { AuditEventSchema } from '../audit.js';

/** One schema entry in the registry. */
export interface RegistryEntry {
  /** kebab-case name used in `<name>.json` and `$id`. */
  name: string;
  schema: ZodSchema;
}

/**
 * The full export registry. Order is alphabetical by `name`; the CLI dumps
 * in this order so golden files diff predictably.
 */
export const SCHEMA_REGISTRY: readonly RegistryEntry[] = [
  { name: 'audit-event', schema: AuditEventSchema },
  { name: 'brand-kit', schema: BrandKitSchema },
  { name: 'capability', schema: CapabilitySchema },
  { name: 'component-definition', schema: ComponentDefinitionSchema },
  { name: 'component-registry', schema: ComponentRegistrySchema },
  { name: 'conversation-overlay', schema: ConversationOverlaySchema },
  { name: 'intent-profile', schema: IntentProfileSchema },
  { name: 'manifest', schema: ManifestSchema },
  { name: 'policy', schema: PolicySchema },
  { name: 'skill', schema: SkillSchema },
  { name: 'thread-manifest', schema: ThreadManifestSchema },
  { name: 'trigger', schema: TriggerSchema },
  { name: 'turn-delta', schema: TurnDeltaSchema },
];

/**
 * Path-based dispatch for `validate-data` (JSON files).
 *
 * Maps a directory (relative to repo root, or anywhere) to the schema that
 * JSON files inside it should validate against. The CLI walks each directory
 * (if it exists) and validates every `*.json` it finds.
 *
 * Skill markdown files (`.md`) are handled by `MARKDOWN_DISPATCH` below via
 * `parseSkillMarkdown`. Rare `.json` files inside `skills/` are skipped.
 */
export const PATH_DISPATCH: ReadonlyArray<{
  /** Directory name (relative). */
  dir: string;
  /** Registry entry name. */
  schemaName: string;
}> = [
  { dir: 'capabilities', schemaName: 'capability' },
  { dir: 'recipes', schemaName: 'manifest' },
  { dir: 'components', schemaName: 'component-registry' },
  { dir: 'policies', schemaName: 'policy' },
];

/**
 * Path-based dispatch for `validate-data` (Markdown files with frontmatter).
 *
 * `kind` selects the parser used to extract structured data from the file:
 *  - `skill`: YAML frontmatter → `SkillSchema` via `parseSkillMarkdown`.
 *
 * `glob` narrows the walk to files that follow the project naming convention
 * (e.g. `*.skill.md`); a directory README or other prose markdown alongside
 * the skills is skipped.
 *
 * Kept parallel to `PATH_DISPATCH` so the CLI can dispatch on file extension.
 */
export const MARKDOWN_DISPATCH: ReadonlyArray<{
  /** Directory name (relative). */
  dir: string;
  /** Glob (relative to `dir`) restricting which markdown files are validated. */
  glob: string;
  /** Discriminator selecting the markdown parser. */
  kind: 'skill';
}> = [{ dir: 'skills', glob: '**/*.skill.md', kind: 'skill' }];
