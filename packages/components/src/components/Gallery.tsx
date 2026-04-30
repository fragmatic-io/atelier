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
  items: readonly GalleryItem[];
  columns?: number;
  className?: string;
  variant?: GalleryVariant;
}

export function Gallery({
  items,
  columns = 3,
  className,
  variant = 'grid',
}: GalleryProps): ReactNode {
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
  return `[Gallery: ${String(props.items.length)} images]`;
}

export const GalleryBinding: ComponentBinding = {
  id: 'Gallery',
  factory: Gallery,
};
