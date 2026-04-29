# recipes/

**Default interface manifests per persona.** A recipe is a pre-compiled or pre-described manifest skeleton tuned for a known user shape — founder, student, sales rep, support engineer — so a new user gets a coherent first interface before they've expressed any intent of their own.

## Files

- **Format**: JSON manifest skeletons, optionally with a YAML descriptor for metadata.
- **Naming**: `{persona}.json` — e.g. `founder.json`, `student.json`, `sales.json`, `support.json`.
- Each recipe references capabilities, skills, and components by name + version range; the compiler still resolves and validates.
- Optional: `{persona}.intent.json` — a starter intent slice that ships with the recipe.

## Background

See [`../docs/build-plan.md`](../docs/build-plan.md) — Phase 1 ships two recipes (e.g. "inbox view" and "task queue view") plus a "switch lens" UI. Recipes are how CIR avoids the cold-start problem: a new user doesn't compile from zero, they fork a persona.

For the conceptual role of recipes inside the broader artifact model, see [`../docs/artifacts.md`](../docs/artifacts.md).

## Adding a recipe

1. Pick a persona that's underserved by existing recipes. One recipe per file.
2. Reference only capabilities and components that exist in the registry. Do not invent new ones inside a recipe.
3. Document the persona in the descriptor: who they are, what they do daily, what surfaces matter.
4. Add an end-to-end eval at `/evals/recipes/{persona}.eval.ts` that compiles the recipe against a representative intent and asserts the result passes all policies.
5. Recipes are versioned alongside the registry. A breaking capability change cascades into recipe revisions.

## Graduation path

Recipes are also where **graduated user customizations land**: when many users describe a similar interface tweak, the team promotes that pattern into a new recipe (or an option on an existing one). See [`../docs/graduation.md`](../docs/graduation.md) for the rules and the threshold logic.

## Status

Empty in Phase 1; populated starting in **Phase 5 (hello-CIR loop)**. The Phase 1 build plan calls for the first two recipes ("inbox view", "task queue view") in the email domain. A marketplace for community recipes is planned for Phase 5 of the build plan.
