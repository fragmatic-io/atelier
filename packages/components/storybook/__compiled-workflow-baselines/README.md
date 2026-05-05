# Compiled-workflow visual baselines

Sprint 2.3. PNG snapshots produced by `pnpm components:storybook:visual:compiled` against a real Gemini compile of each workflow persona.

## Files

After the first successful run with `GEMINI_API_KEY`:

- `approval-command-center-1280x720.baseline.png`
- `customer-context-panel-1280x720.baseline.png`
- `exception-review-workbench-1280x720.baseline.png`

## Bootstrap state

The baselines committed alongside Sprint 2.3 are **placeholder solid-color PNGs**. They exist so the file paths are in git (the gate's diff target needs to be a tracked file). The first run with a real `GEMINI_API_KEY` will produce a 5% pixel diff against these placeholders and **must** be regenerated via the update-baselines script below before the gate can pass.

A repo-owner with key access should run:

```sh
GEMINI_API_KEY=<key> pnpm components:storybook:visual:update-baselines
```

… and commit the produced PNGs. Once the real baselines land, the gate becomes a meaningful regression signal.

## Updating baselines

When the persona fixtures (`packages/components/storybook/workflows/persona-fixtures/*.persona.json`) or `compile-via-llm.ts` change in a way that intentionally moves the rendered output, regenerate the baselines:

```sh
GEMINI_API_KEY=<key> pnpm components:storybook:visual:update-baselines
```

Commit the regenerated PNGs alongside the change that motivated them.

## Dimensions

All baselines are captured at `1280×720` (set by `playwright.compiled-workflows.config.ts`'s `chromium-1280x720` project). Diff threshold: 5% pixel ratio (`maxDiffPixelRatio: 0.05` in the same config).

See [`apps/docs/src/content/docs/operations/visual-regression.mdx`](../../../../apps/docs/src/content/docs/operations/visual-regression.mdx) for the full operator documentation.
