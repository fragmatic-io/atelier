// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it, vi } from 'vitest';
import {
  extractFigmaKey,
  extractLoomId,
  extractYouTubeId,
  figmaResolver,
  loomResolver,
  mapOEmbedToDisplay,
  oembedResolver,
  type OEmbedFetch,
  youtubeResolver,
} from '../../src/embeds/builtin.js';

describe('extractYouTubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=42', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?list=PLAB&v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=42', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/v/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('extracts the video id from %s', (url, expected) => {
    expect(extractYouTubeId(url)).toBe(expected);
  });

  it.each([
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/results?search_query=cats',
    'https://www.youtube.com/watch?v=tooshort',
    'https://youtu.be/short',
    'not a url at all',
  ])('returns null for non-watchable URL %s', (url) => {
    expect(extractYouTubeId(url)).toBeNull();
  });
});

describe('youtubeResolver', () => {
  it('matches() returns true for a watchable URL', () => {
    expect(youtubeResolver.matches('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
  });
  it('matches() returns false for a non-watchable URL', () => {
    expect(youtubeResolver.matches('https://example.com/')).toBe(false);
  });
  it('resolve() yields a video display with the official embed URL', () => {
    const display = youtubeResolver.resolve({
      url: 'https://youtu.be/dQw4w9WgXcQ',
      provider: 'youtube',
    });
    expect(display).toEqual({
      kind: 'video',
      iframeSrc: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      title: 'YouTube video',
    });
  });
});

describe('extractLoomId / loomResolver', () => {
  it('extracts the share id', () => {
    expect(extractLoomId('https://www.loom.com/share/abcdef0123456789')).toBe('abcdef0123456789');
    expect(extractLoomId('https://loom.com/share/abcdef0123456789xyz')).toBe('abcdef0123456789xyz');
    expect(extractLoomId('https://www.loom.com/embed/abcdef0123456789')).toBe('abcdef0123456789');
  });
  it('returns null for non-Loom or short URLs', () => {
    expect(extractLoomId('https://www.loom.com/foo/abcdef0123456789')).toBeNull();
    expect(extractLoomId('https://www.loom.com/share/short')).toBeNull();
    expect(extractLoomId('https://example.com/share/abcdef0123456789')).toBeNull();
  });
  it('matches() and resolve() agree', () => {
    const url = 'https://www.loom.com/share/abcdef0123456789';
    expect(loomResolver.matches(url)).toBe(true);
    const display = loomResolver.resolve({ url, provider: 'loom' });
    expect(display).toEqual({
      kind: 'video',
      iframeSrc: 'https://www.loom.com/embed/abcdef0123456789',
      title: 'Loom recording',
    });
  });
  it('does not match unrelated URLs', () => {
    expect(loomResolver.matches('https://youtu.be/dQw4w9WgXcQ')).toBe(false);
  });
});

describe('extractFigmaKey / figmaResolver', () => {
  it('extracts file / proto / design keys', () => {
    expect(extractFigmaKey('https://www.figma.com/file/abc12345/My-Doc')).toEqual({
      key: 'abc12345',
      kind: 'file',
    });
    expect(extractFigmaKey('https://figma.com/proto/abcdef0123456789/Proto?page-id=0:1')).toEqual({
      key: 'abcdef0123456789',
      kind: 'proto',
    });
    expect(extractFigmaKey('https://www.figma.com/design/zzz99999/Design')).toEqual({
      key: 'zzz99999',
      kind: 'design',
    });
  });
  it('returns null for non-Figma URLs', () => {
    expect(extractFigmaKey('https://www.figma.com/community/file/abc12345/X')).toBeNull();
    expect(extractFigmaKey('https://example.com/file/abc12345/Y')).toBeNull();
    expect(extractFigmaKey('https://www.figma.com/file/short/Y')).toBeNull();
  });
  it('resolve() returns an iframe display pointing at the embed endpoint', () => {
    const url = 'https://www.figma.com/file/abc12345/My-Doc';
    const display = figmaResolver.resolve({ url, provider: 'figma' });
    expect(display?.kind).toBe('iframe');
    expect(display?.iframeSrc).toBe(
      `https://www.figma.com/embed?embed_host=atelier&url=${encodeURIComponent(url)}`,
    );
    expect(display?.title).toBe('Figma');
  });
  it('matches() agrees with extractFigmaKey', () => {
    expect(figmaResolver.matches('https://www.figma.com/file/abc12345/X')).toBe(true);
    expect(figmaResolver.matches('https://example.com/file/abc12345/Y')).toBe(false);
  });
});

describe('mapOEmbedToDisplay', () => {
  it('maps a video payload to a video display preserving html', () => {
    expect(
      mapOEmbedToDisplay({
        type: 'video',
        title: 'Demo',
        url: 'https://provider.test/embed/123',
        html: '<iframe src="https://provider.test/embed/123"></iframe>',
        thumbnail_url: 'https://thumb',
        width: 480,
        height: 270,
      }),
    ).toEqual({
      kind: 'video',
      title: 'Demo',
      iframeSrc: 'https://provider.test/embed/123',
      html: '<iframe src="https://provider.test/embed/123"></iframe>',
      thumbnail: 'https://thumb',
      width: 480,
      height: 270,
    });
  });
  it('maps a rich payload to an oembed display preserving html', () => {
    expect(
      mapOEmbedToDisplay({
        type: 'rich',
        title: 'Tweet',
        html: '<blockquote class="twitter-tweet">…</blockquote>',
      }),
    ).toEqual({
      kind: 'oembed',
      title: 'Tweet',
      html: '<blockquote class="twitter-tweet">…</blockquote>',
    });
  });
  it('maps a link payload to a card display', () => {
    expect(
      mapOEmbedToDisplay({
        type: 'link',
        title: 'Example',
        description: 'A page',
        thumbnail_url: 'https://thumb',
      }),
    ).toEqual({
      kind: 'card',
      title: 'Example',
      description: 'A page',
      thumbnail: 'https://thumb',
    });
  });
  it('defaults to a card when type is missing', () => {
    expect(mapOEmbedToDisplay({ title: 'X' })).toEqual({ kind: 'card', title: 'X' });
  });
});

describe('oembedResolver', () => {
  const okResponse = (payload: unknown): Awaited<ReturnType<OEmbedFetch>> => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  });

  it('matches any http(s) URL by default', () => {
    const r = oembedResolver({
      endpoint: '/api/oembed',
      fetch: vi.fn<OEmbedFetch>(),
    });
    expect(r.matches('https://example.com/x')).toBe(true);
    expect(r.matches('http://example.com/x')).toBe(true);
    expect(r.matches('mailto:a@b.test')).toBe(false);
  });

  it('honours a custom matches predicate', () => {
    const r = oembedResolver({
      endpoint: '/api/oembed',
      fetch: vi.fn<OEmbedFetch>(),
      matches: (u) => u.startsWith('https://twitter.com/'),
    });
    expect(r.matches('https://twitter.com/jack/status/1')).toBe(true);
    expect(r.matches('https://example.com/x')).toBe(false);
  });

  it('appends url= query param to the endpoint', async () => {
    const fetchFn = vi.fn<OEmbedFetch>(() =>
      Promise.resolve(okResponse({ type: 'link', title: 'X' })),
    );
    const r = oembedResolver({ endpoint: '/api/oembed', fetch: fetchFn });
    await r.resolve({ url: 'https://example.com/x?y=1', provider: 'oembed' });
    expect(fetchFn).toHaveBeenCalledWith(
      `/api/oembed?url=${encodeURIComponent('https://example.com/x?y=1')}`,
    );
  });

  it('uses & when the endpoint already has a ?', async () => {
    const fetchFn = vi.fn<OEmbedFetch>(() =>
      Promise.resolve(okResponse({ type: 'link', title: 'X' })),
    );
    const r = oembedResolver({ endpoint: '/api/oembed?token=abc', fetch: fetchFn });
    await r.resolve({ url: 'https://example.com/', provider: 'oembed' });
    expect(fetchFn).toHaveBeenCalledWith(
      `/api/oembed?token=abc&url=${encodeURIComponent('https://example.com/')}`,
    );
  });

  it('returns null on non-ok response', async () => {
    const r = oembedResolver({
      endpoint: '/api/oembed',
      fetch: () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }),
    });
    expect(await r.resolve({ url: 'https://x/', provider: 'oembed' })).toBeNull();
  });

  it('returns null on fetch rejection', async () => {
    const r = oembedResolver({
      endpoint: '/api/oembed',
      fetch: () => Promise.reject(new Error('network down')),
    });
    expect(await r.resolve({ url: 'https://x/', provider: 'oembed' })).toBeNull();
  });

  it('returns null on JSON parse failure', async () => {
    const r = oembedResolver({
      endpoint: '/api/oembed',
      fetch: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new Error('invalid')),
        }),
    });
    expect(await r.resolve({ url: 'https://x/', provider: 'oembed' })).toBeNull();
  });

  it('returns the mapped display on a successful video oEmbed fetch', async () => {
    const r = oembedResolver({
      endpoint: '/api/oembed',
      fetch: () =>
        Promise.resolve(
          okResponse({
            type: 'video',
            title: 'Vid',
            url: 'https://provider/embed/v',
          }),
        ),
    });
    const display = await r.resolve({ url: 'https://provider/v', provider: 'oembed' });
    expect(display).toEqual({
      kind: 'video',
      title: 'Vid',
      iframeSrc: 'https://provider/embed/v',
    });
  });
});
