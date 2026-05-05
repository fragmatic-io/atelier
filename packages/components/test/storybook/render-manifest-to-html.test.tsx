// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Unit tests for `renderManifestToHtml()`.
 *
 * Asserts that a fixture manifest renders to a complete HTML document with
 * the expected component output and brand-kit hooks. The full visual
 * regression diff lives in the Playwright spec — these unit tests just
 * pin the contract that the helper emits well-formed, deterministic HTML.
 */

import { describe, expect, it } from 'vitest';
import type { Manifest } from '@atelier/schemas';
import { renderManifestToHtml } from '../../storybook/workflows/render-manifest-to-html.js';

function fixtureManifest(): Manifest {
  return {
    manifest_id: 'm_renderfixture',
    user_id: 'render-test-user',
    app_id: 'atelier.workflow.compiled-visual-gate',
    compiled_from: {
      capability_version: '1.0.0',
      skill_versions: {},
      component_catalog_version: '1.0.0',
      intent_profile_version: 1,
      compiler_model: 'fake',
      compiled_at: '2026-05-03T00:00:00.000Z',
    },
    ttl: null,
    invalidates_on: [],
    policies_satisfied: [],
    routes: [
      {
        path: '/render-test',
        title: 'Render fixture',
        layout: {
          component: 'Container',
          props: {},
          children: [
            {
              component: 'Stack',
              props: { id: 'fixture-stack' },
              children: [
                {
                  component: 'Markdown',
                  props: { content: '# Hello compiled workflow' },
                  children: [],
                },
                {
                  component: 'Alert',
                  props: { title: 'Heads up', variant: 'info' },
                  children: [],
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

describe('renderManifestToHtml', () => {
  it('emits a complete HTML document with brand-kit hooks', () => {
    const html = renderManifestToHtml(fixtureManifest(), { route: '/render-test' });

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
    expect(html).toContain('data-cir-compiled-workflow');
    expect(html).toContain('data-atelier-brand="atelier.design.neutral"');
    expect(html).toContain('data-cir-route="/render-test"');
    expect(html).toContain('<title>Compiled Workflow Preview</title>');
  });

  it('renders the route layout (h1 from Markdown, Alert title) into the body', () => {
    const html = renderManifestToHtml(fixtureManifest(), { route: '/render-test' });

    // The Markdown binding produces an <h1> for `# Heading` source.
    expect(html).toMatch(/<h1[^>]*>Hello compiled workflow<\/h1>/);
    // The Alert binding renders its `title` prop somewhere in the output.
    expect(html).toContain('Heads up');
  });

  it('honours an explicit brandKitId override', () => {
    const html = renderManifestToHtml(fixtureManifest(), {
      route: '/render-test',
      brandKitId: 'atelier.design.commerce',
    });
    expect(html).toContain('data-atelier-brand="atelier.design.commerce"');
  });

  it('escapes the title to prevent broken HTML', () => {
    const html = renderManifestToHtml(fixtureManifest(), {
      route: '/render-test',
      title: 'A & B <script>',
    });
    expect(html).toContain('<title>A &amp; B &lt;script&gt;</title>');
  });

  it('emits a fallback marker for unknown component ids', () => {
    const manifest = fixtureManifest();
    manifest.routes[0]!.layout = {
      component: 'NotARealComponent',
      props: {},
      children: [],
    };
    const html = renderManifestToHtml(manifest, { route: '/render-test' });
    expect(html).toContain('data-cir-fallback="NotARealComponent"');
  });
});
