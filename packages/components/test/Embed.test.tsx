// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Embed } from '../src/components/Embed.js';
import { InMemoryEmbedRegistry } from '../src/embeds/registry.js';
import type { EmbedDisplay, EmbedResolver } from '../src/embeds/resolver.js';

const syncRegistry = (provider: string, display: EmbedDisplay | null): InMemoryEmbedRegistry => {
  const registry = new InMemoryEmbedRegistry();
  const resolver: EmbedResolver = {
    matches: () => true,
    resolve: () => display,
  };
  registry.add(provider, resolver);
  return registry;
};

const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('Embed', () => {
  it('renders Loading… while resolution is pending', () => {
    let resolveFn: (d: EmbedDisplay | null) => void = () => {
      throw new Error('not bound');
    };
    const promise = new Promise<EmbedDisplay | null>((res) => {
      resolveFn = res;
    });
    const registry = new InMemoryEmbedRegistry();
    registry.add('async', {
      matches: () => true,
      resolve: () => promise,
    });
    render(<Embed url="https://x/" registry={registry} />);
    const node = document.querySelector('[data-cir-component="Embed"]');
    expect(node?.getAttribute('data-cir-state')).toBe('pending');
    expect(node?.getAttribute('aria-busy')).toBe('true');
    expect(node?.textContent).toBe('Loading…');
    // Cleanup: resolve so React doesn't warn about an open subscription.
    resolveFn(null);
  });

  it('honours a custom loading node', () => {
    const registry = new InMemoryEmbedRegistry();
    registry.add('async', {
      matches: () => true,
      resolve: () => new Promise(() => undefined),
    });
    render(<Embed url="https://x/" registry={registry} loading={<span>spinning</span>} />);
    const node = document.querySelector('[data-cir-component="Embed"]');
    expect(node?.textContent).toBe('spinning');
  });

  it('renders an iframe for a video display', async () => {
    const registry = syncRegistry('youtube', {
      kind: 'video',
      iframeSrc: 'https://www.youtube.com/embed/VID',
      title: 'Demo',
    });
    render(<Embed url="https://youtu.be/VID" registry={registry} />);
    await flush();
    const wrapper = document.querySelector('[data-cir-component="Embed"]');
    expect(wrapper?.getAttribute('data-cir-state')).toBe('resolved');
    expect(wrapper?.getAttribute('data-provider')).toBe('youtube');
    expect(wrapper?.getAttribute('data-kind')).toBe('video');
    const iframe = wrapper?.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe('https://www.youtube.com/embed/VID');
    expect(iframe?.getAttribute('title')).toBe('Demo');
    expect(iframe?.getAttribute('allowfullscreen')).not.toBeNull();
    // Default 16:9 dimensions are surfaced as width/height attributes.
    expect(iframe?.getAttribute('width')).toBe('560');
    expect(iframe?.getAttribute('height')).toBe('315');
  });

  it('renders a generic iframe for an iframe-kind display (no aspect-ratio defaults)', async () => {
    const registry = syncRegistry('figma', {
      kind: 'iframe',
      iframeSrc: 'https://www.figma.com/embed?url=…',
      title: 'Figma',
    });
    render(<Embed url="https://www.figma.com/file/abc12345/X" registry={registry} />);
    await flush();
    const wrapper = document.querySelector('[data-cir-component="Embed"]');
    expect(wrapper?.getAttribute('data-kind')).toBe('iframe');
    const iframe = wrapper?.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe('https://www.figma.com/embed?url=…');
    // No baked-in width/height for generic iframes.
    expect(iframe?.getAttribute('width')).toBeNull();
    expect(iframe?.getAttribute('height')).toBeNull();
  });

  it('renders a card with thumbnail + title + description', async () => {
    const registry = syncRegistry('og', {
      kind: 'card',
      title: 'GitHub - vid/atelier',
      description: 'Composition-first component runtime',
      thumbnail: 'https://opengraph.githubassets.com/preview',
    });
    render(<Embed url="https://github.com/vid/atelier" registry={registry} />);
    await flush();
    const card = document.querySelector('[data-cir-component="Embed"]');
    expect(card?.tagName).toBe('A');
    expect(card?.getAttribute('href')).toBe('https://github.com/vid/atelier');
    expect(card?.getAttribute('aria-label')).toBe('GitHub - vid/atelier');
    expect(card?.querySelector('img')?.getAttribute('src')).toBe(
      'https://opengraph.githubassets.com/preview',
    );
    expect(card?.querySelector('[data-cir-part="embed-title"]')?.textContent).toBe(
      'GitHub - vid/atelier',
    );
    expect(card?.querySelector('[data-cir-part="embed-description"]')?.textContent).toBe(
      'Composition-first component runtime',
    );
  });

  it('renders raw HTML for an oembed display', async () => {
    const registry = syncRegistry('twitter', {
      kind: 'oembed',
      html: '<blockquote class="twitter-tweet">tweeted!</blockquote>',
    });
    render(<Embed url="https://twitter.com/x/status/1" registry={registry} />);
    await flush();
    const wrapper = document.querySelector('[data-cir-component="Embed"]');
    expect(wrapper?.getAttribute('data-kind')).toBe('oembed');
    expect(wrapper?.innerHTML).toContain('twitter-tweet');
    expect(wrapper?.textContent).toContain('tweeted!');
  });

  it('falls back to a plain link when the registry returns null', async () => {
    const registry = syncRegistry('stub', null);
    render(<Embed url="https://example.com/missing" registry={registry} />);
    await flush();
    const wrapper = document.querySelector('[data-cir-component="Embed"]');
    expect(wrapper?.getAttribute('data-cir-state')).toBe('unresolved');
    const link = wrapper?.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/missing');
    expect(link?.textContent).toBe('https://example.com/missing');
  });

  it('honours a custom fallback node when the registry returns null', async () => {
    const registry = syncRegistry('stub', null);
    render(
      <Embed
        url="https://example.com/missing"
        registry={registry}
        fallback={<em data-testid="fb">no preview</em>}
      />,
    );
    await flush();
    const wrapper = document.querySelector('[data-cir-component="Embed"]');
    expect(wrapper?.getAttribute('data-cir-state')).toBe('unresolved');
    expect(wrapper?.textContent).toBe('no preview');
  });

  it('treats a custom-registry rejection as unresolved', async () => {
    // Build a registry whose resolve() rejects (the in-memory one swallows;
    // we want to verify the component-level defensive catch).
    const registry: InMemoryEmbedRegistry = new InMemoryEmbedRegistry();
    // Override resolve to reject. (`InMemoryEmbedRegistry.resolve` already
    // catches resolver rejections, but a custom registry implementation
    // might leak — the component must defend.)
    Object.defineProperty(registry, 'resolve', {
      value: () => Promise.reject(new Error('custom registry kaboom')),
      writable: true,
    });
    render(<Embed url="https://x/" registry={registry} />);
    await flush();
    const wrapper = document.querySelector('[data-cir-component="Embed"]');
    expect(wrapper?.getAttribute('data-cir-state')).toBe('unresolved');
  });

  it('forwards className to the wrapper element', async () => {
    const registry = syncRegistry('og', { kind: 'card', title: 'X' });
    render(<Embed url="https://x/" registry={registry} className="my-embed" />);
    await flush();
    const wrapper = document.querySelector('[data-cir-component="Embed"]');
    expect(wrapper?.classList.contains('my-embed')).toBe(true);
  });

  it('re-resolves when the URL changes', async () => {
    const registry = new InMemoryEmbedRegistry();
    registry.add('echo', {
      matches: () => true,
      resolve: ({ url }) => ({ kind: 'card', title: url }),
    });
    const { rerender } = render(<Embed url="https://first/" registry={registry} />);
    await flush();
    expect(document.querySelector('[data-cir-part="embed-title"]')?.textContent).toBe(
      'https://first/',
    );
    rerender(<Embed url="https://second/" registry={registry} />);
    await flush();
    expect(document.querySelector('[data-cir-part="embed-title"]')?.textContent).toBe(
      'https://second/',
    );
  });

  it('does NOT register a ComponentBinding (Embed is host-level composition)', async () => {
    const mod: Record<string, unknown> = await import('../src/components/Embed.js');
    expect(mod.EmbedBinding).toBeUndefined();
  });
});
