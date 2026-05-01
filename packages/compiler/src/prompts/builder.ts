// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Per-call prompt context builder. Takes a `CompileInput` and returns the
 * variable portion of the prompt the LLM sees alongside the cached system
 * prompt.
 *
 * Goal: fit the variable portion in 5–15k tokens (per
 * `docs/token-economics.md`). We achieve this by:
 *   - Including only capabilities relevant to the route
 *   - Including only the skill abstracts (when_to_use, when_not_to_use)
 *   - Compressing component definitions to their props_schema names
 *   - Scoping the intent slice to the route's domain
 *   - Folding the brand kit into a compact JSON block
 *   - Echoing the previous manifest verbatim if we're in diff mode
 */

import type { Capability, IntentProfile, PriorityRule } from '@cir/schemas';
import type { CompileInput } from '../types.js';

export interface BuiltPromptContext {
  /** The variable portion of the prompt — appended after the cached system prompt. */
  user: string;
  /** Whether the input contained a previous manifest (diff mode). */
  diff_mode: boolean;
}

export function buildPromptContext(input: CompileInput): BuiltPromptContext {
  const lines: string[] = [];

  lines.push(`# Compile request`);
  lines.push(`route: ${input.route}`);
  lines.push(`user_id: ${input.user_id}`);
  lines.push(`app_id: ${input.app_id}`);
  if (input.trigger) {
    lines.push(`trigger: ${input.trigger.type}`);
    lines.push(`trigger_payload: ${JSON.stringify(input.trigger)}`);
  } else {
    lines.push(`trigger: cold (no previous manifest or fresh request)`);
  }
  lines.push('');

  // Capabilities — full schemas, since the compiler needs to know input/output
  // shapes, side effects, confirmation requirements, reversibility.
  lines.push(`## Capabilities you may reference`);
  lines.push('```json');
  lines.push(JSON.stringify(input.capabilities, null, 2));
  lines.push('```');
  lines.push('');

  // Skills — only the high-signal fields. The full markdown body is too
  // verbose for the compiler context.
  if (input.skills && Object.keys(input.skills).length > 0) {
    lines.push(`## Skills (when to use the capabilities)`);
    const compactSkills = Object.fromEntries(
      Object.entries(input.skills).map(([name, s]) => [
        name,
        {
          description: s.description,
          capabilities_used: s.capabilities_used,
          when_to_use: s.when_to_use,
          when_not_to_use: s.when_not_to_use,
          known_failure_modes: s.known_failure_modes,
        },
      ]),
    );
    lines.push('```json');
    lines.push(JSON.stringify(compactSkills, null, 2));
    lines.push('```');
    lines.push('');
  }

  // Components — id + description + props_schema + allowed actions.
  // Description is the load-bearing field for picking decisions: it tells
  // the LLM when to pick `<IssueQueue>` over `<List>`, etc. See
  // `docs/ethos.md` principle #2 (composition, not invention).
  lines.push(`## Components you may reference (by id)`);
  lines.push(
    `Pick the most specific component that fits the route's intent. ` +
      `Custom bindings carry their purpose in the description; prefer them ` +
      `over generic baseline components when the description matches.`,
  );
  const componentSummary = input.components.map((c) => {
    const desc = (c as { description?: string }).description;
    const id = (c as { id?: string }).id ?? '<no-id>';
    return {
      id,
      ...(typeof desc === 'string' && desc.length > 0 ? { description: desc } : {}),
      props_schema: c.props_schema,
      data_sources: c.data_sources,
      actions_supported: c.actions_supported,
    };
  });
  lines.push('```json');
  lines.push(JSON.stringify(componentSummary, null, 2));
  lines.push('```');
  lines.push('');

  // Brand kit — central to staying on-brand.
  if (input.brandKit) {
    lines.push(`## Brand kit (mandatory; the policy engine will reject off-brand manifests)`);
    lines.push('```json');
    lines.push(JSON.stringify(input.brandKit, null, 2));
    lines.push('```');
    lines.push('');
  }

  // Intent — scoped slice; the resolver should already have filtered.
  if (input.intent) {
    lines.push(`## Intent (this user's preferences)`);
    lines.push('```json');
    lines.push(JSON.stringify(input.intent, null, 2));
    lines.push('```');
    lines.push('');

    // Personalisation directives — translate the well-known global_preferences
    // keys into concrete manifest-shaping rules. The renderer ALSO honours
    // these (it defaults props from the intent profile when manifests omit
    // them) so this section is mostly belt-and-braces, but it makes the
    // expected mapping legible to the LLM and keeps both pipelines consistent.
    const directives = buildPersonalisationDirectives(input.intent.global_preferences);
    if (directives.length > 0) {
      lines.push(`## Personalisation directives (apply to the manifest you emit)`);
      for (const line of directives) lines.push(line);
      lines.push('');
    }
  }

  // Hierarchy directives — surface salience defaults declared on capabilities
  // alongside the user's `priority_rules` overrides, plus the cap-N=7 rule the
  // compiler should apply to long lists / tables / grids. Emit only when there
  // is something actionable: at least one capability with `salience_default`
  // OR an intent with non-empty `priority_rules`. The directive is the same
  // regardless — the compiler still needs to know the threshold even if no
  // signals are declared.
  const hierarchy = buildHierarchyDirectives(input.capabilities, input.intent);
  if (hierarchy.length > 0) {
    lines.push(`## Hierarchy directives (information hierarchy in long lists)`);
    for (const line of hierarchy) lines.push(line);
    lines.push('');
  }

  // Diff mode — include previous manifest verbatim.
  const diffMode = input.previousManifest !== undefined;
  if (diffMode) {
    lines.push(
      `## Previous manifest (diff mode — produce only the changes needed for the trigger)`,
    );
    lines.push('```json');
    lines.push(JSON.stringify(input.previousManifest, null, 2));
    lines.push('```');
    lines.push('');
  } else {
    // Cold compiles: prepend a complete few-shot example so the LLM has
    // a concrete shape to mirror. The system prompt's example is shorter
    // and gets cached aggressively; this version is per-call and grounds
    // the response in a full route. See `docs/ethos.md` principles 1 & 5.
    lines.push('## Few-shot — what a complete cold-compile output looks like');
    lines.push(
      'For a route in a github-style decision-queue app whose catalog includes ' +
        'IssueQueue (compositionRole: list) and OctantHeader, a correct cold output looks like this. ' +
        '**Match the depth and richness — never produce empty containers.**',
    );
    lines.push('```json');
    lines.push(
      JSON.stringify(
        {
          manifest_id: 'm_example001',
          user_id: '<user_id from compile request>',
          app_id: '<app_id from compile request>',
          compiled_from: {
            capability_version: '0.1.0',
            skill_versions: { 'decision-queue': '0.1.0' },
            component_catalog_version: '1.0.0',
            intent_profile_version: 1,
            compiler_model: 'gemini-2.5-pro',
            compiled_at: '<current ISO 8601 timestamp>',
          },
          ttl: null,
          invalidates_on: [
            'capability_schema_change:github.issue.list:>=0.2.0',
            'skill.version_changed:decision-queue',
          ],
          policies_satisfied: [
            'reversibility_surfaced',
            'rate_limited_actions_show_state',
            'empty_loading_error_handled',
          ],
          routes: [
            {
              path: '<route from compile request>',
              title: 'Today',
              layout: {
                component: 'Stack',
                props: { direction: 'vertical', gap: 'lg' },
                children: [
                  {
                    component: 'OctantHeader',
                    props: { activePath: '<route>' },
                    children: [],
                  },
                  {
                    component: 'Container',
                    props: { maxWidth: 'lg' },
                    children: [
                      {
                        component: 'Stack',
                        props: { direction: 'vertical', gap: 'md' },
                        children: [
                          {
                            component: 'Markdown',
                            props: { content: '# Today' },
                            children: [],
                          },
                          {
                            component: 'Markdown',
                            props: {
                              content:
                                '8 issues need a decision. Top three are highlighted by salience. Archive any issue with a 5-second undo.',
                            },
                            children: [],
                          },
                          {
                            component: 'IssueQueue',
                            props: { emphasizeTopN: 3 },
                            data: {
                              source: 'github.issue.list',
                              sort: 'salience desc',
                              filter: 'state = "open" AND requires_decision = true',
                              // The `empty_loading_error_handled` policy
                              // requires every data-bound component to
                              // declare these three slot nodes inline.
                              empty_state: {
                                component: 'EmptyState',
                                props: {
                                  title: 'Inbox zero',
                                  body: 'No issues need a decision right now.',
                                },
                                children: [],
                              },
                              loading_state: {
                                component: 'Skeleton',
                                props: { rows: 4, variant: 'list' },
                                children: [],
                              },
                              error_state: {
                                component: 'Alert',
                                props: {
                                  severity: 'error',
                                  title: 'Failed to load issues',
                                  body: 'Could not reach the GitHub API. Check your token in /settings/github.',
                                },
                                children: [],
                              },
                            },
                            actions: ['github.issue.archive', 'github.issue.close'],
                            children: [],
                          },
                          {
                            component: 'UndoToast',
                            props: { duration_ms: 5000, variant: 'inline' },
                            children: [],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              refresh: {
                data: 'on_focus + 60s_interval',
                structure: 'never_unless_invalidated',
              },
            },
          ],
        },
        null,
        2,
      ),
    );
    lines.push('```');
    lines.push('');
    lines.push(
      'Apply the same shape to the route requested below: chrome header → ' +
        'Container → Stack with [heading Markdown, subtitle Markdown, data-bound rich binding, ambient affordances]. ' +
        'Use the catalog descriptions to pick the right rich binding.',
    );
    lines.push('');
  }

  lines.push(`## Your task`);
  lines.push(
    diffMode
      ? `The trigger above invalidated the previous manifest. Produce a NEW manifest for route "${input.route}" that addresses the trigger's effect. Preserve unrelated structure verbatim. Output the full new manifest JSON, not a diff.`
      : `Produce a manifest for route "${input.route}" matching the user's intent and brand kit. Output ONLY the manifest JSON.`,
  );

  return { user: lines.join('\n'), diff_mode: diffMode };
}

/**
 * Translate `intent.global_preferences` into a terse list of manifest-shaping
 * rules. Each rule is a single line so the section stays in the low hundreds
 * of tokens even when every signal is set. The mapping mirrors the renderer's
 * defaulting behaviour in `@cir/react`'s `<RenderNode>` walker so the two
 * agree on what "personalised" means.
 */
function buildPersonalisationDirectives(
  prefs: Readonly<Record<string, unknown>>,
): readonly string[] {
  const out: string[] = [];
  const known = new Set([
    'density',
    'color_mode',
    'motion_preference',
    'automation_trust',
    'modal_tolerance',
  ]);

  const activePairs = Object.entries(prefs).filter(([, v]) => v !== undefined && v !== null);
  if (activePairs.length === 0) return out;

  out.push(
    `- Active preferences: ${activePairs.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}.`,
  );

  const density = prefs['density'];
  if (density === 'compact') {
    out.push(
      "- `density === 'compact'`: set `props.density: 'compact'` on every Stack/Container/Card/Grid/List/Table/StatCard/KPIRow you emit. Reduce vertical padding; merge related rows where it doesn't lose information.",
    );
  } else if (density === 'spacious') {
    out.push(
      "- `density === 'spacious'`: set `props.density: 'spacious'` on layout components (Stack, Container, Card, Grid, List, Table, StatCard, KPIRow). Prefer airy spacing.",
    );
  } else if (density === 'comfortable') {
    out.push(
      "- `density === 'comfortable'`: leave `props.density` unset (the renderer will default to comfortable).",
    );
  }

  const colorMode = prefs['color_mode'];
  if (colorMode === 'dark' || colorMode === 'light') {
    out.push(
      `- \`color_mode === '${String(colorMode)}'\`: do NOT set per-component theme props; the runtime applies the mode at the route level via \`<html data-color-mode>\`.`,
    );
  }

  const motion = prefs['motion_preference'];
  if (motion === 'reduced') {
    out.push(
      "- `motion_preference === 'reduced'`: omit any `animate` / `transition` props; do not introduce auto-rotating carousels or marquee components.",
    );
  } else if (motion === 'rich') {
    out.push(
      "- `motion_preference === 'rich'`: subtle motion is permitted on attention-bearing components (Toast, ConfirmDialog) when it improves comprehension.",
    );
  }

  const trust = prefs['automation_trust'];
  if (trust === 'strict') {
    out.push(
      "- `automation_trust === 'strict'`: every action with `confirmation: 'inline'` MUST be promoted to `'modal'`. Never auto-submit forms; never bind irreversible actions without an explicit confirm step.",
    );
  } else if (trust === 'cautious') {
    out.push(
      "- `automation_trust === 'cautious'`: keep inline confirmations for reversible actions; use modal confirmation for anything irreversible.",
    );
  } else if (trust === 'permissive') {
    out.push(
      "- `automation_trust === 'permissive'`: inline confirmation is acceptable for reversible actions; you may surface one-tap primary actions.",
    );
  }

  const modal = prefs['modal_tolerance'];
  if (modal === 'low') {
    out.push(
      "- `modal_tolerance === 'low'`: prefer Drawer or inline disclosure over Modal where the schema permits both. Never stack two modals.",
    );
  } else if (modal === 'high') {
    out.push(
      "- `modal_tolerance === 'high'`: Modal is acceptable for confirmations and detail views.",
    );
  }

  const extras = activePairs.filter(([k]) => !known.has(k));
  if (extras.length > 0) {
    out.push(
      `- Additional user-declared preferences (treat as soft hints): ${extras
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(', ')}.`,
    );
  }

  return out;
}

/**
 * Build the "Hierarchy directives" section from capabilities that carry a
 * `salience_default` plus the user's `priority_rules`.
 *
 * The output is intentionally compact (a handful of lines) so the section
 * stays cheap in the per-call payload. The cap-N=7 rule is repeated whenever
 * any salience or priority signal is present; that's the load-bearing
 * directive — it tells the LLM to apply emphasis treatment to the top 1–3
 * items of any long list/table/grid binding.
 *
 * Returns `[]` when there is nothing to communicate (no salience defaults
 * AND no priority rules) — the section is omitted entirely in that case.
 */
function buildHierarchyDirectives(
  capabilities: Readonly<Record<string, Capability>>,
  intent: IntentProfile | undefined,
): readonly string[] {
  const out: string[] = [];
  const salience: Array<{ id: string; expr: string }> = [];
  for (const [id, cap] of Object.entries(capabilities)) {
    const expr = cap.salience_default;
    if (typeof expr === 'string' && expr.length > 0) {
      salience.push({ id, expr });
    }
  }

  const rules: readonly PriorityRule[] = intent?.priority_rules ?? [];
  if (salience.length === 0 && rules.length === 0) return out;

  if (salience.length > 0) {
    out.push(`- Capabilities declaring a default salience expression:`);
    for (const { id, expr } of salience) {
      out.push(`  - \`${id}\` → \`${expr}\``);
    }
  } else {
    out.push(
      `- No capability declares a \`salience_default\` — fall back to source order, but still apply the emphasis rule below.`,
    );
  }

  if (rules.length > 0) {
    out.push(`- User-declared \`priority_rules\` (multiply the matching signal by \`weight\`):`);
    for (const rule of rules) {
      const w = rule.weight ?? 1.0;
      out.push(`  - domain=\`${rule.domain}\` signal=\`${rule.signal}\` weight=${String(w)}`);
    }
  }

  out.push(
    "- Emphasis rule: when a `<List>` / `<Table>` / `<Grid>` binding has more than 7 items, the top 1–3 must be visually emphasised (larger text, bolder weight, or a left-border accent). The rest fade to default treatment. Use intent's `priority_rules` to weight the capability's `salience_default` expression and pick the top items.",
  );

  return out;
}
