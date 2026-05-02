// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `ManifestComponentContract` — the canonical, schema-validated description
 * of what manifest props a single component binding accepts.
 *
 * Per `/Users/vid/cir/docs/ethos.md` principle #7 ("Schema-validated
 * contracts"): manifest props must be validated against component contracts
 * at the schema layer. Renderers don't defend against malformed manifests
 * with `?? []` defaults; the schema layer rejects them upstream.
 *
 * A `ManifestComponentContract` is per-component-id and lives on the
 * runtime's `ComponentBinding` (see `@atelier/runtime`). The
 * `manifest_component_contract_satisfied` policy in `@atelier/policies`
 * walks the manifest tree and validates `node.props` against the contract
 * for each node whose `component` id has one registered.
 *
 * Design notes
 * ------------
 *  - The contract is intentionally lightweight: it lists allowed prop names
 *    and a coarse type tag (`string`, `number`, `boolean`, `array`,
 *    `object`, `function`, `react-node`, `unknown`). The TS type lives in
 *    the component file as the load-bearing contract; the schema layer
 *    enforces shape invariants the LLM compiler can violate (typo, wrong
 *    prop name, unknown key).
 *  - `required_props` is enforced strictly: a missing required prop is an
 *    error.
 *  - `allow_unknown` is `false` by default — extra keys outside
 *    `allowed_props` fail the policy. Hosts can opt in for transitional
 *    bindings whose contract is still being shaken out.
 *  - The contract is OPT-IN per binding. Bindings without
 *    `manifestContract` are unaffected, so the migration is incremental
 *    and additive.
 *
 * See `/Users/vid/cir/docs/ethos.md` principle #7 and Phase 2 #1.
 */

import { z } from 'zod';

/**
 * Coarse type tag for a single manifest prop. The policy uses this to do
 * shape validation only — fine-grained type checking lives in the
 * component's TS interface (the `props_schema` referenced in
 * `ComponentDefinition`). The tags chosen are the minimum set that
 * distinguishes the contract drift cases band-aided in commits 9ae2122
 * (NavBar `links` vs `items`, Button `label` vs `children`) and 0c6cc26
 * (List `data` vs `items`).
 *
 *  - `string` / `number` / `boolean`: JS primitives.
 *  - `array`: any JS array. The element shape is the component's concern.
 *  - `object`: a non-null object that is not an array. Use for structured
 *    bags like `{ set, name }` on `Button.icon`.
 *  - `function`: any callable. Capability dispatch sets these on props
 *    keyed by capability id; bindings that opt out of capability dispatch
 *    can declare `function` here for a specific named callback.
 *  - `react-node`: anything renderable by React. Used for slots like
 *    `Button.children` and `NavBar.brand`. Validation is permissive
 *    (string / number / boolean / object / array all qualify) — the
 *    intent is to accept what React.createElement accepts.
 *  - `unknown`: deliberate escape hatch for transitional contracts.
 *    Equivalent to "this prop is accepted but not type-checked".
 */
export const ManifestComponentPropTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'array',
  'object',
  'function',
  'react-node',
  'unknown',
]);
export type ManifestComponentPropType = z.infer<typeof ManifestComponentPropTypeSchema>;

/**
 * One per-component manifest contract.
 *
 *  - `allowed_props`: map from prop name to coarse type tag. Names not
 *    listed are rejected unless `allow_unknown` is `true`.
 *  - `required_props`: optional list of prop names that MUST be present
 *    on the manifest node. A missing required prop is an error
 *    violation.
 *  - `allow_unknown`: when `true`, props not listed in `allowed_props`
 *    are silently accepted. Default `false`.
 *  - `description`: free-form note for the LLM compiler / human reviewer.
 *
 * Example (NavBar):
 *
 *   {
 *     allowed_props: { items: 'array', brand: 'react-node', className: 'string' },
 *     required_props: ['items'],
 *   }
 *
 * A manifest node `{ component: 'NavBar', props: { links: [...], title: '…' } }`
 * fails this contract on TWO grounds: `links` and `title` are unknown
 * keys, AND `items` is missing.
 */
export const ManifestComponentContractSchema = z.object({
  allowed_props: z.record(z.string().min(1), ManifestComponentPropTypeSchema),
  required_props: z.array(z.string().min(1)).optional(),
  allow_unknown: z.boolean().optional(),
  description: z.string().optional(),
});
export type ManifestComponentContract = z.infer<typeof ManifestComponentContractSchema>;
