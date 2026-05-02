// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * JSON Schema codegen.
 *
 * Wraps `zod-to-json-schema` so we always emit:
 *  - a stable `$id` (e.g. `https://cir.dev/schemas/manifest.json`)
 *  - a `$schema` field at the highest draft the library supports
 *
 * `zod-to-json-schema` v3 supports `jsonSchema7` and `jsonSchema2019-09`. We
 * default to 2019-09 (the closest available to Draft 2020-12) and fall back
 * to 7 if a caller asks for it. Atelier validators (Ajv 8) understand both.
 */

import type { ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Configuration for `toJsonSchema`.
 */
export interface ToJsonSchemaOptions {
  /**
   * Short name (kebab or snake — used in `$id`). The `$id` becomes
   * `${idBase}/${name}.json` (default base: `https://cir.dev/schemas`).
   */
  name: string;
  /** Override the `$id` base. Default: `https://cir.dev/schemas`. */
  idBase?: string;
  /**
   * JSON Schema target. Defaults to `jsonSchema2019-09`. Use `jsonSchema7`
   * for tools that don't speak 2019-09.
   */
  target?: 'jsonSchema7' | 'jsonSchema2019-09';
}

const DEFAULT_ID_BASE = 'https://cir.dev/schemas';

/** Convert a Zod schema into a JSON Schema document with a stable `$id`. */
export function toJsonSchema(
  schema: ZodSchema,
  opts: ToJsonSchemaOptions,
): Record<string, unknown> {
  const target = opts.target ?? 'jsonSchema2019-09';
  const idBase = opts.idBase ?? DEFAULT_ID_BASE;

  // `zodToJsonSchema` returns the schema directly (no $ref wrapper) when
  // `name` is omitted; with `name` set, it wraps in `definitions`. We want
  // the bare schema with a synthesized $id at top level.
  const raw = zodToJsonSchema(schema, { target }) as Record<string, unknown>;

  // Strip any auto-generated `$schema` (we set our own below) and prepend
  // ours so the field order stays predictable in serialized output.
  const { $schema: _existingSchema, ...rest } = raw;

  const $schema =
    target === 'jsonSchema2019-09'
      ? 'https://json-schema.org/draft/2019-09/schema'
      : 'http://json-schema.org/draft-07/schema#';

  return {
    $schema,
    $id: `${idBase}/${opts.name}.json`,
    ...rest,
  };
}
