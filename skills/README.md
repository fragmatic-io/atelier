# skills/

Markdown documents that teach the compiler **how to use capabilities well**. A skill names the capabilities it composes, when to use them, when not to, the example flow, and known failure modes. Skills are the cheapest place to push reasoning out of the compiler prompt — strong skills mean small compiler bills.

## Files

- **Format**: Markdown with YAML frontmatter (or pure YAML body — see the example in the docs)
- **Naming**: `{name}.skill.md` — e.g. `email-triage.skill.md`, `weekly-review.skill.md`
- **One skill per file.** Skills are flat (no nesting); the directory is browsed alphabetically.

Required frontmatter fields: `name`, `version`, `description`, `capabilities_used`, `when_to_use`, `when_not_to_use`, `example_flow`, `known_failure_modes`.

## Background

See [`../docs/artifacts.md`](../docs/artifacts.md) — section "Skill" for the full template and the `email-triage` worked example.

## Adding a skill

When you add a capability, you also add its skill (see [`../AGENTS.md`](../AGENTS.md) "When asked to add a capability", step 2). When you add a skill alone — for a workflow that composes several existing capabilities — you must:

1. List every capability in `capabilities_used` (the compiler resolves and version-pins these).
2. Write `when_to_use` and `when_not_to_use` as crisp, testable conditions.
3. Add eval cases at `/evals/skills/{name}.eval.json` covering at least the happy path, one negative case, and one known failure mode.
4. Bump the skill version on any behavioral change. Emit `skill.version_changed` so the trigger bus invalidates affected manifests.

## Validation pipeline

Skill markdown is parsed by `parseSkillMarkdown` (from `@cir/policies`) which validates the YAML frontmatter against `SkillSchema` (from `@cir/schemas`). `pnpm validate:fast` calls `cir-schemas validate-data` which walks every `*.skill.md` in this directory.

## Cross-cutting micro-skills

A handful of skills don't pair with a single capability — they encode
patterns the compiler reaches for across many surfaces:

- `empty-state-prose` — domain-aware empty states with a CTA when one
  exists.
- `information-hierarchy` — cap N=7 above the fold, top 1–3 emphasised
  per layout family. Pairs with `Capability.salience_default` and
  `IntentProfile.priority_rules` (Wave 7b / P-9).
- `loading-state-grace` — when to show a Spinner vs. Skeleton vs. nothing.
- `motion-respect-reduced` — honour `motion_preference: 'reduced'` everywhere.

## What ships in this repo

- `cart-add.skill.md` — paired with the DummyJSON cart capability.
- `github-issue-triage.skill.md` — paired with the GitHub issue-domain capabilities.
- `product-search.skill.md` — paired with DummyJSON product list/search.

These are reference imports, not a complete catalog. New skills land alongside the capabilities they teach.

## Token-budget reminder

Per [`../AGENTS.md`](../AGENTS.md) "Token budget": move logic out of the compiler prompt and into structured skill descriptions. A well-written skill is the difference between compiler calls measured in tens per user per week and compiler calls measured in tens per user per action.
