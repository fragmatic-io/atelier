# recipes/

**Default interface manifests per persona.** A recipe is a pre-compiled or pre-described manifest skeleton tuned for a known user shape — founder, student, sales rep, support engineer — so a new user gets a coherent first interface before they've expressed any intent of their own.

## Files

- **Format**: JSON manifest skeletons, optionally with a YAML descriptor for metadata.
- **Naming**: `{persona}.json` — e.g. `founder.json`, `student.json`, `sales.json`, `support.json`.
- Each recipe references capabilities, skills, and components by name + version range; the compiler still resolves and validates.
- Optional: `{persona}.intent.json` — a starter intent slice that ships with the recipe.

## Background

Recipes are how CIR avoids the cold-start problem: a new user doesn't compile from zero, they fork a persona.

For the conceptual role of recipes inside the broader artifact model, see [`../docs/artifacts.md`](../docs/artifacts.md).

## Adding a recipe

1. Pick a persona that's underserved by existing recipes. One recipe per file.
2. Reference only capabilities and components that exist in the registry. Do not invent new ones inside a recipe.
3. Document the persona in the descriptor: who they are, what they do daily, what surfaces matter.
4. Add an end-to-end eval at `/evals/recipes/{persona}.eval.ts` that compiles the recipe against a representative intent and asserts the result passes all policies.
5. Recipes are versioned alongside the registry. A breaking capability change cascades into recipe revisions.

## Graduation path

Recipes are also where **graduated user customizations land**: when many users describe a similar interface tweak, the team promotes that pattern into a new recipe (or an option on an existing one). See [`../docs/graduation.md`](../docs/graduation.md) for the rules and the threshold logic.

## What ships in this repo

- `dummyjson-shopper.json` — a shopping-persona recipe over the DummyJSON capabilities.
- `github-reviewer.json` — a code-review-persona recipe over the GitHub capabilities.

A marketplace for community recipes is on the roadmap (see the root [`README.md`](../README.md) §"What's shipped"). Today, recipes ship in-tree and are reviewed alongside the capabilities they reference.
