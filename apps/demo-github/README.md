# @atelier/demo-github

Real-mutations issue triage showcase. Atelier-against-GitHub: optimistic archive,
verbal-required bulk close, hover-card mention previews, and a hand-written
fallback compiler that powers the demo without an LLM key.

The app boots against fixture data with no token; pasting a personal
access token at `/settings/github` swaps the data resolver to the
authenticated REST proxy under `/api/data/*`.

## Routes

- `/today` — decision queue, hierarchy treatment, optimistic archive,
  bulk-action bar with verbal-required close.
- `/repos` — repository browser, hover-card previews per row.
- `/issue/[id]` — issue detail with mention-aware body and reversibility-paired
  action buttons.
- `/issue/new` — compact form, modal-confirmed `github.issue.create`.
- `/inbox` — mentions, inbox-zero skill.

## Design system — Octant

Octant is the visual identity of the issue-triage showcase. It's tuned to feel
like an IDE-adjacent tool: GitHub-meets-VS Code, dense, both light and dark
first-class.

| Token          | Light                    | Dark      |
| -------------- | ------------------------ | --------- |
| Brand primary  | `#1f883d` (GitHub green) | `#2ea043` |
| Accent         | `#0969da` (link blue)    | `#58a6ff` |
| Surface (app)  | `#ffffff`                | `#0d1117` |
| Surface (card) | `#f6f8fa`                | `#161b22` |
| Foreground     | `#1f2328`                | `#e6edf3` |
| Danger         | `#cf222e`                | `#f85149` |
| Warning        | `#9a6700`                | `#d29922` |

Other shape tokens:

- **Sans**: Inter (system fallback) — body, headings, UI chrome.
- **Mono**: IBM Plex Mono / GitHub Mono (system fallback) — code refs, shas,
  issue ids. The `code, .cir-mono` rule in `app/globals.css` keys mono on every
  inline reference (`#Atelier-123`, `a1b2c3d`, etc.).
- **Radius**: tight `3 / 4 / 6 / 8` ladder. No big rounds anywhere.
- **Elevation**: 5-step (`resting / hover / popover / modal / commandbar`),
  paired light + dark recipes per level.
- **Motion**: restrained — `fast: 80 ms`, `normal: 120 ms`, `slow: 200 ms`,
  `cubic-bezier(0.4, 0, 0.2, 1)`.
- **Iconography**: octicons allow-list, 14 px floor.
- **Voice**: technical + terse; surfaces declared per role
  (`button`, `error`, `empty_state`, `heading`, `toast`).

The kit lives in `lib/brand-kit.ts` (typed against `@atelier/schemas`'s
`BrandKitSchema`) and is folded into the compiler service prompt via
`lib/atelier-server.ts`. The `respects_brand_kit` policy enforces the same
contract on every compiled manifest.

The wordmark — an octagon mark + lowercase mono "octant" lockup — lives in
`components/Wordmark.tsx`. Both fills resolve to `currentColor` so the chrome
recolours the lockup with a single `color` rule.

Color mode follows the OS preference on first paint via a tiny inline
script in `app/layout.tsx`; intent overrides take over after hydration.

## Scripts

```sh
pnpm --filter @atelier/demo-github dev         # next dev
pnpm --filter @atelier/demo-github typecheck   # tsc --noEmit
pnpm --filter @atelier/demo-github lint        # no-op (root eslint covers apps)
pnpm --filter @atelier/demo-github test        # vitest run
```
