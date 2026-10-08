# Resolved host design context

Atelier resolves approved host design evidence once and passes the resulting `DesignContext` to generation, source compilation, browser certification and screenshot review. The context is versioned and hashed. Source code, task-quality contracts and design context remain separate inputs; generated source cannot approve or replace either contract.

## Canonical style vocabulary

`packages/design-genome/src/design-registry.mjs` owns the supported role selectors and property names. Discovery approval, design-synthesis schemas, hosted installation CSS and Source Forge CSS use that registry. A conformance test keeps the standalone browser observer's capture vocabulary aligned with it.

The roles are `root`, `button`, `input`, `card` and `nav`. Navigation matches native `nav`, `[role="navigation"]` and `[data-atelier-design-role="nav"]` within the installation root. Cards match `[data-surface-card]` or `[data-atelier-design-role="card"]`.

Supported properties are `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `color`, `backgroundColor`, `borderColor`, `borderRadius`, `paddingBlock`, `paddingInline`, `height`, `gap` and `boxShadow`. Every approved property reaches the scoped stylesheet, including logical padding and navigation spacing. Unknown properties and unsafe values fail validation instead of being silently omitted. Contracts never supply selectors, raw stylesheets, imports or network resources.

## Resolve and bind

```js
import {
  resolveDesignContext,
  compileSourceKit,
} from '@atelier/platform/source-forge';

const designContext = resolveDesignContext({
  model,
  approvedContract,
  approvedSynthesis, // optional, but must be bound to this contract
  componentContracts: reviewedComponentContracts,
});

// Supply the same object to the model's generation context first.
const compiled = await compileSourceKit(kit, {
  projectVersion: model.projectVersion,
  approvedActions,
  designContext,
  qualityContract,
});
```

The caller loads the currently approved records under its tenant/project scope. The pure resolver validates their structure and fingerprints; it does not grant approval or authorize access. Production publication still requires the current design review, capability authority and browser/visual certification gates.

The context contains:

| Field | Meaning |
| --- | --- |
| `version` | Design context schema version, currently `1`. |
| `projectVersion` | Exact Project Model version used to resolve the context. |
| `contractFingerprint` | Hash of the normalized approved computed-style contract, or `null` for standalone compilation without host evidence. |
| `tokens` | Validated CSS custom-property values and evidence-derived aliases. |
| `roles` / `viewport` | Approved role styles and observed viewport/color scheme. |
| `guidance` | Approved, fingerprint-verified, evidence-bound design synthesis. It cannot change CSS values. |
| `componentContracts` | Explicit reviewed declarations about component states, actions and design use. |
| `hash` | SHA-256 of the complete canonical context body. |

Raw project token names remain available. Approved role properties additionally produce names such as `atelier-nav-gap`, `atelier-button-padding-inline` and `atelier-root-font-family`. Existing source-kit conventions such as `primary`, `surface`, `text`, `border` and `font-family` resolve from approved roles or explicitly named project tokens. Approved role evidence takes precedence for those semantic aliases. The resolver does not invent a palette, new dimensions or an unobserved dark theme.

CSS values must already be safe strings. Unresolved composite token objects, external-resource values, conflicting normalized names and invalid values are explicit errors. The `atelier-<role>-<property>` names are reserved for their matching approved evidence. Contexts are bounded to 180 KB; the compiler subprocess also applies its overall request limit.

Approval metadata about which model/provider produced synthesis does not change its design hash. A changed synthesis body, role value, token, component contract or Project Model version does. Stale synthesis fingerprints or unsupported context versions are rejected.

## Trusted component declarations

`COMPONENT_DESIGN_CONTRACT_SCHEMA` describes an optional reviewed component contract:

```js
{
  id: 'ticket-panel',
  version: '1',
  dataBound: true,
  roles: ['root', 'button'],
  states: ['ready', 'loading', 'empty', 'error'],
  interaction: {
    keyboard: true,
    focusVisible: true,
    accessibleName: true,
    actions: ['ticket.update'],
  },
  taste: {
    tokenNames: ['primary'],
    patternNames: ['Compact controls'],
  },
}
```

Data-bound contracts must declare loading, empty and error states in addition to ready. Roles, tokens and named patterns must exist in approved evidence. Actions must remain within the reviewed model and compiler action scope. These declarations make requirements machine-readable; they are not proof that the component implements them. Independent task scenarios, accessibility checks and browser evidence supply that proof.

## Source sandbox and exports

The sandbox gives generated React a recursively frozen `context` containing `designContext`, `tokens`, `qualityContract`, `theme` and `direction`. It continues to give the component `data`, `state` and the existing approved `emit` bridge. No additional browser, network, navigation or credential capability is exposed.

Resolved token CSS and approved role CSS are installed inside the sandbox. Role declarations apply after component CSS with `!important` so ordinary component styling cannot accidentally replace approved control spacing or typography. Scoped role styles only apply to the matching root/controls/role markers. The fallback example palette is omitted when host tokens or an approved contract exist; the old generic dark palette cannot override host values. Unspecified base colors use browser system colors and unspecified typography uses the existing system-font fallback.

Font-family names are preserved, but this does not package or fetch a host's web-font files. The sandbox's `font-src 'none'` policy remains intact. A font unavailable in the sandbox uses its declared fallback. Likewise a captured viewport is one approved design observation, not independently captured evidence for every theme or breakpoint.

The compiled digest binds the context and independent quality contract. `verifyCompilation` checks their integrity and exact token/project correspondence as well as source/runtime integrity. This change advances the execution contract: earlier compiled artifacts must be rebuilt and recertified before publication under this runtime.

Source exports include `design-context.json`, optional `quality-contract.json`, and their hashes in `contract.json`. The export manifest covers these files. A host-source integration must provide the same context and scoped styles; modifying the source or contracts requires a new compile, evaluation and review.

Generated host TSX kits also include a `<ComponentName>.design-context.json` file, named by their component contract, and bind its hash in provenance. Their root carries `data-atelier-install`; generated regions carry the card role marker. Resolved semantic aliases take priority over the older raw-token guesses, and approved role declarations outrank the generated base selectors. Mapped host primitives must forward `className`, data attributes and accessibility props to the corresponding DOM elements for these rules to apply. A context from a different Project Model version is rejected before host source is emitted.

## Current design and release transitions

`ControlService.currentDesignContext(scope)` reads the live Project Model and approved contract/synthesis under an authorized project scope in one database transaction. The additive pipeline uses that resolver for its generation snapshot and again in its draft-commit transaction. A contract or approved synthesis changed during an awaited provider call causes `DESIGN_CONTEXT_CHANGED`; the stale candidate is not saved as a release.

Release approval, publication, promotion and rollback compare the release's `bundle.provenance.designContextHash` with that current context. The check runs within the mutation transaction, alongside the existing model, capability and review gates. Approving a different computed-style contract can invalidate a release even when `model_id` has not changed. Replacing approved synthesis likewise invalidates the binding. Rejected reviews may still reject stale drafts.

Production targets, including promotion into production, require an approved host contract and a current design binding. A server running with `NODE_ENV=production` enforces these requirements for staging targets as well. Older additive releases with no design-context provenance are compatible only outside production while the project has no approved host contract. This legacy path does not accept explicit null or malformed new hashes. Once approved design evidence exists, regenerate and review those releases. Rebuild and review under the current design before approving, publishing or rolling back to any release whose binding has become stale.

## Verification

Focused unit and real-compiler coverage:

```sh
node --test tests/design-context.test.mjs tests/design-synthesis.test.mjs tests/forge/source-compiler.test.mjs tests/surface-install.test.mjs tests/v21/host-design-kit.test.mjs
```

After installing the supported Playwright browser, the targeted Chromium probe checks computed role styles, context integrity/read-only delivery, local interaction and absence of network access:

```sh
ATELIER_PYTHON="$PWD/.venv/bin/python" node scripts/verify-source-design.mjs
```

The probe fails if Chromium cannot run; it does not replace an unavailable browser with a passing result. Full release validation still uses the repository's unit, package and committed-tree acceptance commands.
