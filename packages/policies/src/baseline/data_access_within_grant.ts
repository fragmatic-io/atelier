// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Policy: `data_access_within_grant`
 *
 * For every layout node with a `data` binding, assert that every output field
 * the bound capability could project is covered by the user's granted scope.
 *
 * Source spec: `/Users/vid/cir/docs/architecture.md` §"Policy engine":
 *
 *     for each data source in manifest:
 *       assert source.fields ⊆ user.granted_fields(app_id)
 *
 * The compiler is expected to populate `ctx.intent.granted_fields` with the
 * resolved per-app grants from the vault. Field paths are dotted strings
 * (e.g. `thread.subject`, `thread.list.recipients`). A grant of
 * `thread.list.*` permits any field beneath that prefix.
 *
 * Behavior:
 *  - If the capability is not found in `ctx.capabilities`, we cannot judge
 *    field coverage and emit a violation pointing at the unresolved binding
 *    (the compiler is required to resolve all bound capabilities up-front).
 *  - If the capability declares NO output fields, the binding is vacuously
 *    within scope (no fields projected).
 */

import type { Capability } from '@cir/schemas';
import type { NamedPolicy, PolicyResult, PolicyViolation } from '../result.js';
import { walkManifest } from '../internal/walk-layout.js';

const POLICY_ID = 'data_access_within_grant';

function fieldsFromCapabilityOutput(capability: Capability): string[] {
  return Object.keys(capability.output);
}

/**
 * Returns true iff `field` is covered by any entry in `grants`.
 * A grant is either an exact field name (`thread.subject`) or a prefix
 * wildcard (`thread.list.*`).
 */
function fieldIsGranted(field: string, grants: readonly string[]): boolean {
  for (const grant of grants) {
    if (grant === field) return true;
    if (grant.endsWith('.*')) {
      const prefix = grant.slice(0, -2);
      if (field === prefix || field.startsWith(`${prefix}.`)) return true;
    }
    if (grant === '*') return true;
  }
  return false;
}

export const dataAccessWithinGrant: NamedPolicy = {
  id: POLICY_ID,
  description:
    'Every component data binding only projects fields the user has granted to this app.',
  applies_to: 'data',
  severity: 'error',
  evaluate(ctx): PolicyResult {
    const violations: PolicyViolation[] = [];
    const grants = ctx.intent.granted_fields;

    walkManifest(ctx.manifest, (node, path) => {
      if (!node.data) return;
      const sourceId = node.data.source;
      const capability = ctx.capabilities[sourceId];

      if (!capability) {
        violations.push({
          policy_id: POLICY_ID,
          severity: 'error',
          message: `Layout node binds data from unresolved capability "${sourceId}".`,
          path: `${path}/data/source`,
          hint: 'The compiler must resolve every bound capability before policy evaluation.',
        });
        return;
      }

      const fields = fieldsFromCapabilityOutput(capability);
      // The output map keys are projected as `<sourceId>.<field>` for grant
      // matching. This mirrors how the vault scopes grants by capability.
      for (const field of fields) {
        const dotted = `${sourceId}.${field}`;
        if (!fieldIsGranted(dotted, grants) && !fieldIsGranted(field, grants)) {
          violations.push({
            policy_id: POLICY_ID,
            severity: 'error',
            message: `Field "${dotted}" is projected by binding "${sourceId}" but not in the user's granted scope.`,
            path: `${path}/data/source`,
            hint: `Grant "${dotted}" (or "${sourceId}.*") in the user's intent vault, or stop projecting it.`,
          });
        }
      }
    });

    return {
      ok: violations.length === 0,
      violations,
    };
  },
};
