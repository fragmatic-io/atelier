// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `renderManifestToHtml()` — Sprint 2.3 helper.
 *
 * Takes a `Manifest` produced by `compileWorkflowViaLlm()` (or any other
 * source) and returns a complete static HTML document string suitable for
 * loading into a Playwright page via a data URL. The output is wrapped in a
 * minimal HTML shell that:
 *   - includes the brand-kit CSS variables on the wrapper element so the
 *     LLM's manifest renders against the same look as the storybook story,
 *   - inlines a small reset + sensible body styles so the screenshot is
 *     deterministic (no UA-specific defaults leaking in),
 *   - sets `data-cir-compiled-workflow` on the root for selector-based
 *     screenshotting in `compiled-workflows.playwright.ts`.
 *
 * Why a custom synchronous walker (and not `<CirRoute>`):
 *
 * `<CirRoute>` resolves manifests asynchronously via `useManifest()` — its
 * first synchronous render only emits the loading fallback. `react-dom/server`'s
 * `renderToString` is single-pass synchronous, so a fully resolved tree
 * never reaches the wire. Rather than fight the async resolver in SSR, we
 * call `buildRenderPlan` directly (the same path `<CirRoute>` uses once
 * the manifest lands) and walk the resulting tree with a small bespoke
 * renderer. The walker mirrors `@atelier/react`'s `<RenderNode>` for the
 * subset of features that matter for static visual rendering:
 *   - looks up each `componentId` in the registry,
 *   - threads `node.props` through to the factory verbatim,
 *   - recurses into `children` and renders them as JSX `children` of the
 *     parent factory,
 *   - synthesises an `EmptyDataResolver`-equivalent (`data: undefined`,
 *     `loading: false`, `error: null`) for data-bound nodes — the persona
 *     fixtures are seeded so this is the intended visual baseline.
 *
 * Action dispatch, density resolution, and the resolver-state-slot fallback
 * are intentionally NOT wired here: this gate measures the manifest's
 * static visual shape, not its interactive behaviour (which the
 * `visual.playwright.ts` story-level tests already cover).
 *
 * Usage:
 *
 *   const html = renderManifestToHtml(manifest, {
 *     route: '/approvals',
 *     brandKitId: 'atelier.design.neutral',
 *   });
 *   await page.setContent(html);
 *   await expect(page).toHaveScreenshot('approval-command-center.baseline.png');
 */

import { createElement, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import type { ComponentBinding, ComponentRegistry } from '@atelier/runtime';
import { buildRenderPlan } from '@atelier/runtime';
import type { RenderNode, RenderPlan } from '@atelier/runtime';
import type { Manifest } from '@atelier/schemas';
import { brandKitToCssVars } from '../../src/brand/css-vars.js';
import { resolveAtelierBrandKit } from '../../src/brand/presets.js';
import { ALL_COMPONENTS } from '../../src/registry.js';

export interface RenderManifestToHtmlOptions {
  /** The route the manifest renders. Must match a `manifest.routes[].path`. */
  route: string;
  /** Atelier brand kit id (`'atelier.design.neutral'` etc). Defaults to neutral. */
  brandKitId?: string;
  /** Override the document `<title>`. Defaults to `Compiled Workflow Preview`. */
  title?: string;
  /**
   * Optional registry override (used in unit tests to inject a stub).
   * Defaults to the full `@atelier/components` `ALL_COMPONENTS` registry.
   */
  registry?: ComponentRegistry;
}

/**
 * Render a `Manifest` to a complete static HTML string. The returned
 * document is a standalone artefact — it does not depend on any external
 * stylesheet, font, or script.
 */
export function renderManifestToHtml(
  manifest: Manifest,
  opts: RenderManifestToHtmlOptions,
): string {
  const registry = opts.registry ?? ALL_COMPONENTS;
  const plan = buildRenderPlan(manifest, opts.route, registry);

  const body = renderToString(<RenderedPlan plan={plan} />);

  // Accept either the short id (`'neutral'`) or the full brand id
  // (`'atelier.design.neutral'`) — persona fixtures pin the long form to
  // match the BrandKit.id on the wire, but the resolver wants the short
  // key. Strip the `atelier.design.` prefix when present.
  const rawBrandKitId = opts.brandKitId ?? 'atelier.design.neutral';
  const shortBrandKitId = rawBrandKitId.startsWith('atelier.design.')
    ? rawBrandKitId.slice('atelier.design.'.length)
    : rawBrandKitId;
  const brandKit = resolveAtelierBrandKit(shortBrandKitId);
  const cssVars = brandKitToCssVars(brandKit);
  const inlineStyle = Object.entries(cssVars)
    .map(([k, v]) => `${k}: ${String(v)};`)
    .join(' ');

  const title = opts.title ?? 'Compiled Workflow Preview';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=1280, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; font-family: var(--atelier-font-family, system-ui, -apple-system, "Segoe UI", sans-serif); color: var(--atelier-text-primary, #111827); background: var(--atelier-surface-base, #ffffff); }
      body { min-height: 100vh; }
      [data-cir-compiled-workflow] { padding: 24px; min-height: 100vh; }
      img { max-width: 100%; }
      button { font: inherit; cursor: pointer; }
    </style>
  </head>
  <body>
    <div data-cir-compiled-workflow data-atelier-brand="${escapeHtml(brandKit.id)}" data-atelier-brand-version="${escapeHtml(brandKit.version)}" data-cir-route="${escapeHtml(plan.routePath)}" style="${escapeHtml(inlineStyle)}">
      ${body}
    </div>
  </body>
</html>`;
}

function RenderedPlan({ plan }: { plan: RenderPlan }): ReactElement {
  return <SyncRenderNode node={plan.root} />;
}

function SyncRenderNode({ node }: { node: RenderNode }): ReactElement {
  if (!node.binding) {
    // Unknown component id — emit a deterministic, screenshotable
    // placeholder so the visual diff highlights the missing binding.
    return (
      <div data-cir-fallback={node.componentId}>
        ?
        {node.children.map((child, i) => (
          <SyncRenderNode key={i} node={child} />
        ))}
      </div>
    );
  }

  const binding: ComponentBinding = node.binding;
  const Component = binding.factory as ComponentType<Record<string, unknown>>;
  const props: Record<string, unknown> = { ...(node.props ?? {}) };

  // EmptyDataResolver-equivalent: components designed to consume a
  // resolver receive the canonical "no data" shape so they render their
  // own empty state instead of crashing on undefined props.
  if (node.data) {
    props['data'] = undefined;
    props['loading'] = false;
    props['error'] = null;
  }

  const childNodes: ReactNode =
    node.children.length === 0
      ? null
      : node.children.map((child, i) => <SyncRenderNode key={i} node={child} />);

  // Components in @atelier/components accept `children` as a prop where
  // applicable; passing `null` for leaves is harmless.
  return createElement(Component, props, childNodes);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
