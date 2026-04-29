// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Registry of named exported schemas.
 *
 * Used by the CLI: `dump` walks the registry and writes one JSON Schema per
 * entry; `validate-data` looks up the right schema by path prefix.
 *
 * One source of truth for "which schemas does this package publish."
 */

import type { ZodSchema } from 'zod';
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
 * Path-based dispatch for `validate-data`.
 *
 * Maps a directory (relative to repo root, or anywhere) to the schema that
 * JSON files inside it should validate against. The CLI walks each directory
 * (if it exists) and validates every `*.json` it finds.
 *
 * Skill markdown files are NOT in this map — they need a frontmatter parser
 * (Phase 3 in `@cir/policies`).
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
