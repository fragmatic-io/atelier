// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Policy: `manifest_component_contract_satisfied`
 *
 * Walks every layout node in the manifest and validates `node.props`
 * against the per-component `ManifestComponentContract` registered for
 * that component id.
 *
 * Per `/Users/vid/cir/docs/ethos.md` principle #7 (schema-validated
 * contracts): manifest props are validated against component contracts
 * at the schema layer, NOT inside React components with `?? []`
 * defaults. This policy is the enforcement teeth that make the
 * principle real — bad manifests fail at compile time, not at render
 * time.
 *
 * Three classes of violation:
 *   1. UNKNOWN_KEY  — a prop name not listed in `allowed_props` and
 *      `allow_unknown` is not set. Catches the NavBar `links`/`title`
 *      drift band-aided in commit 9ae2122.
 *   2. WRONG_TYPE   — a prop value's runtime shape doesn't match the
 *      declared coarse type tag (e.g. `items: 'not-an-array'`).
 *   3. MISSING_REQUIRED — a name in `required_props` not present on
 *      `node.props`. Catches the Button "label or children" drift
 *      band-aided in commit 9ae2122 (when neither slot is supplied).
 *
 * This is a factory in the same shape as `composesAccordingTo`: hosts
 * pass in the contract map (typically via
 * `manifestContractsFromBindings(...)` over their merged binding
 * record), getting back a `NamedPolicy` they can drop into a policy
 * list.
 *
 * Bindings without a contract entry are skipped — the policy is strictly
 * additive, mirroring the `composes_according_to_rules` pattern. This
 * keeps the migration incremental: declare the contract on the bindings
 * you're ready to lock down, the rest stay in their pre-policy shape.
 *
 * The policy intentionally treats two value shapes leniently:
 *   - Capability-dispatch props (keys containing a `.`, e.g.
 *     `app.cart.add`) are NOT enforced — those are wired by the runtime
 *     post-manifest and the LLM never authors them. Including them in
 *     `allowed_props` would be a layering violation.
 *   - The function-prop hint matches any value of `typeof === 'function'`,
 *     so a host that wires a callback in via `RenderNode` and the
 *     manifest-author-supplied prop both validate.
 */

import type { ManifestComponentContract, ManifestComponentPropType } from '@atelier/schemas';
import type { NamedPolicy, PolicyViolation } from '../result.js';
import { walkManifest } from '../internal/walk-layout.js';

const POLICY_ID = 'manifest_component_contract_satisfied';

/** Map of component id → its manifest contract. */
export type ManifestComponentContracts = Readonly<Record<string, ManifestComponentContract>>;

/**
 * Coarse runtime check that maps a value to a `ManifestComponentPropType`.
 * Returns `null` when no tag fits (deliberate — we want a hard error then).
 */
function classify(value: unknown): ManifestComponentPropType | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'function') return 'function';
  if (typeof value === 'object') return 'object';
  return null;
}

/**
 * Returns true if `value` satisfies the declared `expected` type. The
 * `react-node` and `unknown` tags accept anything renderable / anything
 * at all, respectively. The other tags require an exact match against
 * `classify(value)`.
 */
function valueSatisfies(expected: ManifestComponentPropType, value: unknown): boolean {
  if (expected === 'unknown') return true;
  if (expected === 'react-node') {
    // React.createElement accepts string, number, boolean, null, undefined,
    // arrays, and objects (elements). We treat everything except `function`
    // as renderable for this coarse policy. Functions get rejected because
    // the LLM should not be supplying render-prop functions in a manifest.
    return typeof value !== 'function';
  }
  const actual = classify(value);
  return actual === expected;
}

/**
 * Capability-dispatch keys (e.g. `app.cart.add`) are wired post-manifest
 * by the renderer, never authored in `node.props` directly by the LLM.
 * We skip them so the contract doesn't have to enumerate every capability
 * id and the policy doesn't get false positives during render-time
 * snapshots.
 */
function isCapabilityDispatchKey(key: string): boolean {
  return key.includes('.');
}

/**
 * Factory — apps configure the contract map their renderer registry exposes.
 * Returns a `NamedPolicy` that walks every layout node and asserts
 * `node.props` against the contract for `node.component`.
 */
export function manifestComponentContractSatisfied(
  contracts: ManifestComponentContracts,
): NamedPolicy {
  return {
    id: POLICY_ID,
    description:
      "Manifest node props must conform to the registered ManifestComponentContract for the component's binding (allowed prop names, required props, coarse type shape).",
    applies_to: 'manifest',
    severity: 'error',
    evaluate(ctx) {
      const violations: PolicyViolation[] = [];
      walkManifest(ctx.manifest, (node, path) => {
        const contract = contracts[node.component];
        if (!contract) return; // no contract registered — skip silently

        const allowed = contract.allowed_props;
        const required = contract.required_props ?? [];
        const allowUnknown = contract.allow_unknown === true;
        const props = node.props ?? {};

        // Required-prop check.
        for (const name of required) {
          if (!(name in props) || props[name] === undefined) {
            violations.push({
              policy_id: POLICY_ID,
              severity: 'error',
              message: `Component "${node.component}" is missing required prop "${name}".`,
              path: `${path}/props`,
              hint: `Add "${name}" to the manifest node's props bag (declared in the binding's manifestContract).`,
            });
          }
        }

        // Per-prop validation: unknown keys + type-shape mismatches.
        for (const [name, value] of Object.entries(props)) {
          if (isCapabilityDispatchKey(name)) continue; // wired by renderer
          const expected = allowed[name];
          if (expected === undefined) {
            if (!allowUnknown) {
              const allowedNames = Object.keys(allowed).sort();
              violations.push({
                policy_id: POLICY_ID,
                severity: 'error',
                message: `Component "${node.component}" received unknown prop "${name}". Allowed: [${allowedNames.join(', ')}].`,
                path: `${path}/props/${name}`,
                hint: `Either remove "${name}" from the manifest, or add it to the binding's manifestContract.allowed_props.`,
              });
            }
            continue;
          }
          if (!valueSatisfies(expected, value)) {
            const actual = classify(value) ?? 'null/undefined';
            violations.push({
              policy_id: POLICY_ID,
              severity: 'error',
              message: `Component "${node.component}" prop "${name}" expects ${expected}, got ${actual}.`,
              path: `${path}/props/${name}`,
            });
          }
        }
      });
      return { ok: violations.length === 0, violations };
    },
  };
}
