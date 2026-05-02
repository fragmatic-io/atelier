# `@atelier/keyboard`

The Atelier keyboard registry — the marketplace primitive for "things the user
can do via the keyboard".

This package is **pure logic**: no React, no DOM, no I/O. The React adapter
(`<KeyboardProvider>`, `useKeyboardAction`) lives in `@atelier/react`.

## What's in here

```
src/
├── index.ts         — public entrypoint
├── hotkey.ts        — parser + matcher (`cmd+k`, `g i`, `shift+escape`)
├── registry.ts      — `KeyboardRegistry` + `InMemoryKeyboardRegistry`
└── recency.ts       — `ActionRecencyTracker` + `InMemoryRecencyTracker`
```

## Why a separate package

Wave 11 / Int-3 asked for a Cmd+K command palette plus a keyboard registry
that future tracks (Int-6 quick-switcher, Int-7 chord shortcuts, Int-12
settings search) build on. Keeping the registry framework-agnostic means:

- non-React adapters (Electron menus, native shells, voice) plug in directly
- the React surface (`@atelier/react`'s `KeyboardProvider`) stays a thin
  lifecycle wrapper
- the chord state machine (Int-7) is a future addition that consumes
  `parseChord()` without touching the public API

## Hotkey syntax

Compact strings, parser-friendly:

| Form             | Meaning                                       |
| ---------------- | --------------------------------------------- |
| `'k'`            | Press `K` (no modifiers)                      |
| `'cmd+k'`        | ⌘K on macOS, Ctrl+K elsewhere — portable      |
| `'mod+k'`        | Alias for `'cmd+k'`                           |
| `'meta+k'`       | Strict Meta (always ⌘ on macOS, ⊞ on Windows) |
| `'ctrl+shift+p'` | Strict Ctrl + Shift + P                       |
| `'shift+escape'` | Shift + Escape                                |
| `'g i'`          | Two-step chord: press G, then I (Int-7 scope) |

The matcher is deliberately strict: `'cmd+k'` does NOT fire when `cmd+shift+k`
is pressed. Authors who want a strict-Meta binding write `'meta+k'`.

## Recency

`ActionRecencyTracker` is the contract:

```ts
interface ActionRecencyTracker {
  bump(actionId: string): void;
  weight(actionId: string): number; // [0, 1]
}
```

`InMemoryRecencyTracker` decays exponentially with a 5-minute half-life by
default. Hosts that want vault-backed persistence implement the interface
directly.

## Wiring

```ts
import {
  InMemoryKeyboardRegistry,
  InMemoryRecencyTracker,
  type KeyboardServices,
} from '@atelier/keyboard';

const services: KeyboardServices = {
  registry: new InMemoryKeyboardRegistry(),
  recency: new InMemoryRecencyTracker(),
};
```

Then pass `services` to `<KeyboardProvider services={…}>` (from `@atelier/react`).
