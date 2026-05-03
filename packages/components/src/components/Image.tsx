// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Image — single-image leaf primitive.
 *
 * Wave 11 / Int-14 introduces this component as a pair to the existing
 * `<Gallery>` (multi-image grid). `<Image>` is the canonical place for a
 * lone media reference inside a manifest — a doc thumbnail, a profile
 * banner, a chat-message attachment — where `<Gallery>` would be
 * overkill.
 *
 * The component is intentionally minimal: a `<figure>` with an
 * `<img loading="lazy">` and an optional `<figcaption>`. Every meaningful
 * styling decision (aspect ratio, object-fit, frame chrome) is left to
 * the host stylesheet via `data-cir-component="Image"` selectors.
 *
 * `lightbox` prop ("click to zoom" reflex)
 * ----------------------------------------
 * When `lightbox` is true, clicking the image opens a single-item
 * `<Lightbox>` automatically. This is the per-image opt-in for the
 * "lightbox everywhere" hook — hosts that want every image to be
 * zoomable just thread `lightbox` through their manifest props rather
 * than wiring a separate `<Lightbox>` instance per image.
 */
import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { Lightbox, type LightboxItem } from './Lightbox.js';

export interface ImageProps {
  src: string;
  alt?: string;
  /** Optional caption rendered under the image as a `<figcaption>`. */
  caption?: string;
  width?: number;
  height?: number;
  className?: string;
  /**
   * When `true`, clicking the image opens a single-item `<Lightbox>`.
   * Default `false` (the image stays a static figure). Hosts that flip
   * this on globally get the "click any image to zoom" reflex without
   * authoring a separate `<Lightbox>` per image.
   */
  lightbox?: boolean;
}

export function Image({
  src,
  alt,
  caption,
  width,
  height,
  className,
  lightbox = false,
}: ImageProps): ReactNode {
  const [open, setOpen] = useState(false);

  const onImgClick = useCallback((): void => {
    if (lightbox) setOpen(true);
  }, [lightbox]);

  const onImgKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLImageElement>): void => {
      if (!lightbox) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
    },
    [lightbox],
  );

  const close = useCallback((): void => {
    setOpen(false);
  }, []);

  // The image is interactive only when `lightbox` is on. Otherwise it
  // remains a plain non-focusable figure.
  const imgStyle: CSSProperties | undefined = lightbox
    ? { cursor: 'zoom-in', display: 'block', maxWidth: '100%' }
    : { display: 'block', maxWidth: '100%' };

  const lightboxItem: LightboxItem = {
    src,
    ...(alt !== undefined ? { alt } : {}),
    ...(caption !== undefined ? { caption } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };

  return (
    <figure
      data-cir-component="Image"
      data-cir-lightbox={lightbox ? 'true' : 'false'}
      className={className}
    >
      <img
        data-cir-part="image"
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        {...(width !== undefined ? { width } : {})}
        {...(height !== undefined ? { height } : {})}
        {...(lightbox ? { tabIndex: 0, role: 'button', 'aria-haspopup': 'dialog' as const } : {})}
        onClick={lightbox ? onImgClick : undefined}
        onKeyDown={lightbox ? onImgKeyDown : undefined}
        style={imgStyle}
      />
      {caption !== undefined ? (
        <figcaption data-cir-part="image-caption">{caption}</figcaption>
      ) : null}
      {lightbox ? <Lightbox items={[lightboxItem]} open={open} onClose={close} /> : null}
    </figure>
  );
}

Image.displayName = 'Image';

export function imageTextRender(props: ImageProps): string {
  const label = props.alt ?? props.caption ?? props.src;
  return `[Image: ${label}]`;
}

export const ImageBinding: ComponentBinding = {
  id: 'Image',
  factory: Image,
  manifestContract: {
    description:
      'Single-image leaf primitive. Renders a `<figure>` with an `<img loading="lazy">` and an optional caption. ' +
      'Set `lightbox` to true to make the image open in a fullscreen `<Lightbox>` on click — the canonical "click to zoom" hook.',
    allowed_props: {
      src: 'string',
      alt: 'string',
      caption: 'string',
      width: 'number',
      height: 'number',
      className: 'string',
      lightbox: 'boolean',
    },
  },
};
