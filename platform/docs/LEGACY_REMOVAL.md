# Legacy implementation removal

The September 2026 cleanup made `platform/` the repository's only supported implementation.

Removed from the repository root:

- the pnpm workspace and its 15 `@atelier/*` prototype packages;
- Next.js/Astro demos and documentation for the automatic compiler and local-vault fallback architecture;
- prototype capabilities, skills, recipes, policies, generated schemas, evals, build plans, and placeholder reports;
- root release, lint, TypeScript, test, commit-hook, and CI configuration tied to that implementation;
- feature-branch reconstruction/recovery automation that no longer applied to `main`.

Removed from V2.3:

- an unreferenced checkpoint inventory;
- an unexported React adapter implementation;
- duplicate legacy browser harnesses superseded by `scripts/browser-integration.py`;
- compatibility verifier wrappers superseded by `scripts/reconstruction-verify.mjs`;
- an unreferenced native probe and unused internal exports.

The removed source remains recoverable from Git history at commit `34f428a`. It must not be copied into a current deployment or treated as a supported fallback. Current integration and release instructions live in `README.md`, `docs/CUSTOMER_ONBOARDING.md`, `docs/AGENT_SETUP.md`, and `docs/RELEASE_CHECKLIST.md` inside `platform/`.
