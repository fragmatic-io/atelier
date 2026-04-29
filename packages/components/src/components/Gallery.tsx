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
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

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
}

export function Gallery({ items, columns = 3, className }: GalleryProps): ReactNode {
  const cols = Math.max(1, columns);
  return (
    <ul
      data-cir-component="Gallery"
      data-columns={String(cols)}
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${String(cols)}, 1fr)`,
        gap: '12px',
        listStyle: 'none',
        padding: 0,
        margin: 0,
      }}
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
