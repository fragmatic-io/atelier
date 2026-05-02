// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
//
// Ambient type declarations for lucide-react's per-icon subpath imports.
// lucide-react v1.x ships TypeScript declarations only for its top-level
// entrypoint; the per-icon dist/esm/icons/<name>.mjs files have no .d.ts
// siblings.
//
// LucideIconResolver reaches into those subpaths to read the raw __iconNode
// data (a tuple-array of [tag, attrs]) without instantiating a React
// component. This file declares a wildcard module so TypeScript accepts the
// imports without noImplicitAny errors.
//
// The __iconNode shape mirrors LucideIconNode in lucide-resolver.ts. We keep
// the typing loose here and let the resolver's call-site cast to
// LucideIconNode be the single point of truth for the real shape.
//
// This file is referenced from `lucide-resolver.ts` via a triple-slash
// directive so downstream package typechecks (Next.js apps walking the
// package source entrypoint) auto-include it. Co-located .d.ts files are
// not auto-discovered through transitive imports.

declare module 'lucide-react/dist/esm/icons/*.mjs' {
  // Tuple-array of [tag, attrs] describing the icon's SVG primitives.
  // Cast to LucideIconNode at the call site.
  export const __iconNode: ReadonlyArray<
    readonly [string, Readonly<Record<string, string | number>>]
  >;
}
