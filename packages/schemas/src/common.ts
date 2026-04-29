// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Common primitives shared across CIR schemas.
 *
 * These are the leaf-level Zod types — semver strings, identifier formats,
 * datetime stamps, enumerations — that the higher-level schemas (capability,
 * skill, manifest, etc.) compose. Keep these constraints tight: every other
 * file in this package depends on them being correct.
 */

import { z } from 'zod';

/**
 * Semantic Version 2.0.0 string.
 *
 * Matches `MAJOR.MINOR.PATCH` with optional pre-release (`-rc.1`) and build
 * metadata (`+sha.abcdef`) suffixes. Used for capability, skill, and component
 * catalog versions throughout the framework.
 */
export const SemverString = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/u,
    'Must be a valid semver string (e.g. 1.0.0, 2.1.0-rc.1)',
  );

/** Inferred type for a semver string. */
export type SemverString = z.infer<typeof SemverString>;

/**
 * ISO 8601 date-time string with timezone (e.g. `2026-04-29T12:00:00Z`).
 * Used for every timestamp in the framework. Always UTC by convention.
 */
export const IsoDateTimeString = z.string().datetime({ offset: true });
export type IsoDateTimeString = z.infer<typeof IsoDateTimeString>;

/**
 * Manifest identifier. Format: `m_` + 8+ lowercase alphanumerics.
 * The compiler service mints these; clients only ever read them.
 */
export const ManifestId = z
  .string()
  .regex(/^m_[a-z0-9]{8,}$/u, 'Manifest IDs must match /^m_[a-z0-9]{8,}$/');
export type ManifestId = z.infer<typeof ManifestId>;

/**
 * Audit event identifier. Format: `evt_` + lowercase alphanumerics.
 * Issued by the audit log on every state transition.
 */
export const EventId = z
  .string()
  .regex(/^evt_[a-z0-9]+$/u, 'Event IDs must match /^evt_[a-z0-9]+$/');
export type EventId = z.infer<typeof EventId>;

/**
 * Generic identifier shape for users, apps, capabilities, skills, components.
 *
 * Lowercase letters, digits, dots, dashes, underscores. Length 1–128.
 * The slight permissiveness here is intentional — capability IDs use dots
 * (`thread.archive`), skill IDs use dashes (`email-triage`), and app IDs
 * are often hostnames (`mail.example.com`). One regex covers all.
 */
const IdentifierRegex = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

export const UserId = z.string().regex(IdentifierRegex, 'Invalid user ID');
export type UserId = z.infer<typeof UserId>;

export const AppId = z.string().regex(IdentifierRegex, 'Invalid app ID');
export type AppId = z.infer<typeof AppId>;

export const CapabilityId = z.string().regex(IdentifierRegex, 'Invalid capability ID');
export type CapabilityId = z.infer<typeof CapabilityId>;

export const SkillId = z.string().regex(IdentifierRegex, 'Invalid skill ID');
export type SkillId = z.infer<typeof SkillId>;

export const ComponentId = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/u, 'Component IDs are PascalCase identifiers');
export type ComponentId = z.infer<typeof ComponentId>;

/**
 * Confirmation policy for a capability.
 *
 * - `none`: silent execution (only valid for non-destructive, reversible reads/writes)
 * - `inline`: surface a confirm button in the rendered component
 * - `modal`: blocking confirmation dialog
 * - `verbal_required`: voice/chat — user must speak/type explicit consent
 *
 * See `/Users/vid/cir/docs/chat/runtime-instructions.md` "Confirmation rules".
 */
export const ConfirmationLevel = z.enum(['none', 'inline', 'modal', 'verbal_required']);
export type ConfirmationLevel = z.infer<typeof ConfirmationLevel>;

/**
 * Rate limit specification.
 *
 * Format: `<count>/<unit>/<scope>` — e.g. `100/min/user`, `10/sec/global`.
 * - unit: sec | min | hour | day
 * - scope: user | org | global
 */
export const RateLimitString = z
  .string()
  .regex(
    /^\d+\/(sec|min|hour|day)\/(user|org|global)$/u,
    'Rate limit must match `<n>/<unit>/<scope>` (e.g. `100/min/user`)',
  );
export type RateLimitString = z.infer<typeof RateLimitString>;
