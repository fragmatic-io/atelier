// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Gallery — responsive grid of image figures. Each item renders as a
 * `<figure>` with an `<img loading="lazy">` and an optional `<figcaption>`.
 * Lazy loading is on by default so off-screen images defer fetching; the
 * host layer (a Phase 4c CSS pass) decides aspect-ratio and object-fit.
 *
 * Pure (no hooks). The grid template is inline-styled so the component is
 * functional before any stylesheet lands.
 *
 * Marketplace pivot — `<Gallery>` is now data-aware (mirrors `<List>` and
 * `<Grid>`). When `data` (resolver-supplied) is an object with `images:
 * string[]` (the dummyjson product shape), the Gallery derives one
 * `GalleryItem` per image string with the object's `title` as the alt
 * text. When `data` is an array of strings, each string becomes an
 * image source. Explicit `items` always wins. This lets manifests bind
 * `<Gallery data={{ source: 'dummyjson.product.list', filter: 'id = …' }} />`
 * without authoring a per-host wrapper that unwraps `product.images[]`.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, galleryVariantClass, type GalleryVariant } from './_variants.js';

export interface GalleryItem {
  id: string;
  src: string;
  alt: string;
  caption?: string;
}

export interface GalleryProps {
  items?: readonly GalleryItem[];
  /**
   * Manifest contract slot for resolver-supplied data. Accepts either:
   *   - an array of strings (each is treated as `src` with empty alt);
   *   - an array of `GalleryItem`-shaped objects (used verbatim);
   *   - an object with `images: string[]` (dummyjson product shape) — the
   *     Gallery derives one item per image, defaulting `alt` to `title` /
   *     `name` when present on the parent object.
   * Explicit `items` wins.
   */
  data?: unknown;
  columns?: number;
  className?: string;
  variant?: GalleryVariant;
}

/**
 * Best-effort resolver that turns a `data` prop into `GalleryItem[]`.
 * Returns an empty array when the shape is unrecognised so the component
 * never crashes. Mirrors the shape-resolution discipline `<Card>` uses
 * for tile defaults.
 */
function resolveItemsFromData(data: unknown): readonly GalleryItem[] {
  if (data === null || data === undefined) return [];

  // Array path: array-of-strings → src list; array-of-GalleryItems → verbatim.
  if (Array.isArray(data)) {
    return data
      .map((entry, i): GalleryItem | null => {
        if (typeof entry === 'string') {
          return { id: String(i), src: entry, alt: '' };
        }
        if (typeof entry === 'object' && entry !== null) {
          const o = entry as Record<string, unknown>;
          const src = typeof o['src'] === 'string' ? o['src'] : undefined;
          if (src === undefined) return null;
          return {
            id: typeof o['id'] === 'string' ? o['id'] : String(i),
            src,
            alt: typeof o['alt'] === 'string' ? o['alt'] : '',
            ...(typeof o['caption'] === 'string' ? { caption: o['caption'] } : {}),
          };
        }
        return null;
      })
      .filter((x): x is GalleryItem => x !== null);
  }

  // Object path: dummyjson product shape — `images: string[]` (with
  // `title`/`name` as the parent label). Falls back to `thumbnail` when
  // `images` is empty.
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    const alt =
      (typeof o['title'] === 'string' ? o['title'] : undefined) ??
      (typeof o['name'] === 'string' ? o['name'] : undefined) ??
      '';
    const images = Array.isArray(o['images'])
      ? (o['images'] as unknown[]).filter((s): s is string => typeof s === 'string' && s.length > 0)
      : [];
    if (images.length > 0) {
      return images.map((src, i) => ({ id: String(i), src, alt }));
    }
    if (typeof o['thumbnail'] === 'string' && o['thumbnail'].length > 0) {
      return [{ id: '0', src: o['thumbnail'], alt }];
    }
  }

  return [];
}

export function Gallery({
  items: itemsProp,
  data,
  columns = 3,
  className,
  variant = 'grid',
}: GalleryProps): ReactNode {
  const items: readonly GalleryItem[] = itemsProp ?? resolveItemsFromData(data);
  const cols = Math.max(1, columns);
  // Inline styles vary per variant so the component is functional without
  // any host stylesheet — utility classes layer on top for Tailwind hosts.
  const baseStyle: CSSProperties = {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    gap: '12px',
  };
  const layoutStyle: CSSProperties =
    variant === 'masonry'
      ? { ...baseStyle, columnCount: cols }
      : variant === 'carousel'
        ? { ...baseStyle, display: 'flex', overflowX: 'auto' }
        : {
            ...baseStyle,
            display: 'grid',
            gridTemplateColumns: `repeat(${String(cols)}, 1fr)`,
          };
  return (
    <ul
      data-cir-component="Gallery"
      data-columns={String(cols)}
      data-variant={variant}
      className={cn(galleryVariantClass[variant], className)}
      style={layoutStyle}
    >
      {items.map((item) => (
        <li key={item.id} data-cir-part="gallery-item">
          <figure data-cir-part="gallery-figure">
            <img src={item.src} alt={item.alt} loading="lazy" data-cir-part="gallery-image" />
            {item.caption !== undefined ? (
              <figcaption data-cir-part="gallery-caption">{item.caption}</figcaption>
            ) : null}
          </figure>
        </li>
      ))}
    </ul>
  );
}

Gallery.displayName = 'Gallery';

export function galleryTextRender(props: GalleryProps): string {
  const len =
    props.items?.length ??
    (Array.isArray(props.data)
      ? (props.data as unknown[]).length
      : props.data &&
          typeof props.data === 'object' &&
          Array.isArray((props.data as { images?: unknown }).images)
        ? (props.data as { images: unknown[] }).images.length
        : 0);
  return `[Gallery: ${String(len)} images]`;
}

export const GalleryBinding: ComponentBinding = {
  id: 'Gallery',
  factory: Gallery,
  manifestContract: {
    description:
      'Image gallery / carousel. Either `items: GalleryItem[]` (typed) or `data` (resolver-supplied) ' +
      'supplies images. The `data` slot accepts: an array of string URLs, an array of GalleryItem-shaped ' +
      'objects, or a single object carrying `images: string[]` (the dummyjson product shape) — in the ' +
      "object path, `alt` defaults to the object's `title` / `name` and `thumbnail` is the fallback when " +
      '`images` is absent. Manifests bind `<Gallery data={{ source: ... }} />` directly without a host-side ' +
      'unwrapper. Variants: `grid` (default), `masonry`, `carousel`.',
    allowed_props: {
      items: 'array',
      data: 'unknown',
      columns: 'number',
      className: 'string',
      variant: 'string',
    },
  },
};
