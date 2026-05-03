// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Wave 11 / Int-10 — `<DropZone>` baseline primitive.
 *
 * Linear / Slack / Notion all let users drop a file (or several) anywhere
 * in the app — a full-viewport overlay highlights, a small label says
 * "Drop files to upload", and the drop hands the files off to whatever
 * upload pipeline the host has wired. `<DropZone>` is the baseline
 * primitive that ships that affordance:
 *
 *  - Wraps a region (the children prop) and turns it into a drop target.
 *  - With `host=true`, attaches the same listeners to `document.body` so
 *    the entire app accepts drops; the children are still rendered
 *    normally (you typically wrap your top-level chrome).
 *  - Validates each file against `accept` (MIME type or extension) and
 *    `maxSize`; rejected files come back with a `reason` string so the
 *    host can toast or otherwise surface the failure.
 *  - On a drop with at least one accepted file, dispatches a capability
 *    (default `'file.upload'`) with `{ files: accepted }` params via the
 *    host-supplied `dispatcher` (typically `useDispatcher()` from
 *    `@atelier/react`). The runtime treats `File` as an opaque
 *    pass-through — no serialisation happens between the dispatcher and
 *    the action handler.
 *  - Always also fires the `onDrop` callback (when supplied) so hosts that
 *    want a non-capability path (e.g. a local-only upload form) can
 *    consume the validated arrays directly.
 *
 * The implementation uses the canonical drag-counter pattern (increment
 * on `dragenter`, decrement on `dragleave`) so a child element entering /
 * leaving the wrapper does not flicker the overlay. `data-cir-dragging`
 * lands on the root while a drag is over the zone for hosts that prefer
 * CSS-driven overlay styling.
 *
 * Composition rule: `DropZone: { can_contain: '*' }` (it wraps an
 * arbitrary region — the same shape as `Container` / `Stack`).
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn } from './_variants.js';

/**
 * Dispatcher signature accepted by `<DropZone>`. Mirrors the `DispatchFn`
 * type from `@atelier/react`'s `useDispatcher()` hook so the two are
 * structurally interchangeable; we re-declare the shape here so the
 * components package keeps zero runtime dependency on `@atelier/react`.
 */
export type DropZoneDispatcher = (capabilityId: string, input: unknown) => Promise<unknown>;

export interface DropZoneRejection {
  file: File;
  reason: string;
}

export interface DropZoneProps {
  /**
   * When true, attaches drag listeners to `document.body` so the whole
   * app accepts drops. The children prop is still rendered normally;
   * `host=true` simply widens the listener target. Default `false`.
   */
  host?: boolean;
  /** Capability id to dispatch on drop. Defaults to `'file.upload'`. */
  capability?: string;
  /**
   * Accepted MIME types or extensions. Empty array = accept everything.
   * Each entry is matched as either:
   *   - a MIME type (`'image/png'`, `'image/*'`)
   *   - an extension (`'.png'`, `'png'`)
   */
  accept?: readonly string[];
  /** Max bytes per file. */
  maxSize?: number;
  /** Allow multiple files. Default `true`. */
  multiple?: boolean;
  /** Custom overlay text. Default `"Drop files to upload"`. */
  overlayLabel?: string;
  /** Disable the dropzone — drag events are ignored. */
  disabled?: boolean;
  /**
   * Host-supplied dispatcher. Typically `useDispatcher()` from
   * `@atelier/react`. When supplied AND there is at least one accepted
   * file, fires `dispatcher(capability, { files: accepted })`. The
   * components package itself stays decoupled from `@atelier/react`.
   */
  dispatcher?: DropZoneDispatcher;
  /**
   * Called after files have been validated. Receives the accepted +
   * rejected arrays so hosts can toast / surface rejection reasons.
   * Always fires (independent of `dispatcher`).
   */
  onDrop?: (accepted: File[], rejected: DropZoneRejection[]) => void;
  /** Wrapped content. With `host=false` this region is the drop target. */
  children?: ReactNode;
  className?: string;
}

/**
 * Match a File against a single accept token. The Web `<input>` accept
 * grammar is the model:
 *
 *   - `'image/*'` → MIME type prefix match.
 *   - `'image/png'` → exact MIME match.
 *   - `'.png'` / `'png'` → extension match (case-insensitive).
 */
function matchAcceptToken(file: File, token: string): boolean {
  const trimmed = token.trim();
  if (trimmed.length === 0) return false;
  // Extension match — `.png` or bare `png`. The leading dot is optional.
  if (trimmed.startsWith('.') || !trimmed.includes('/')) {
    const ext = trimmed.startsWith('.') ? trimmed.slice(1) : trimmed;
    if (ext.length === 0) return false;
    const fileExt = file.name.split('.').pop();
    if (fileExt === undefined) return false;
    return fileExt.toLowerCase() === ext.toLowerCase();
  }
  // MIME match. Wildcards: `image/*` matches any `image/...`.
  if (trimmed.endsWith('/*')) {
    const prefix = trimmed.slice(0, -1); // `image/`
    return file.type.toLowerCase().startsWith(prefix.toLowerCase());
  }
  return file.type.toLowerCase() === trimmed.toLowerCase();
}

/**
 * Validate `files` against `accept` + `maxSize`. Empty (or absent)
 * `accept` accepts everything; absent `maxSize` skips the size check.
 * Each file is independently sorted into `accepted` or `rejected`.
 */
export function validateDroppedFiles(
  files: readonly File[],
  options: { accept?: readonly string[]; maxSize?: number } = {},
): { accepted: File[]; rejected: DropZoneRejection[] } {
  const accepted: File[] = [];
  const rejected: DropZoneRejection[] = [];
  const accept = options.accept ?? [];
  const maxSize = options.maxSize;
  for (const file of files) {
    if (accept.length > 0) {
      const ok = accept.some((token) => matchAcceptToken(file, token));
      if (!ok) {
        rejected.push({ file, reason: 'mime' });
        continue;
      }
    }
    if (typeof maxSize === 'number' && file.size > maxSize) {
      rejected.push({ file, reason: 'size' });
      continue;
    }
    accepted.push(file);
  }
  return { accepted, rejected };
}

/** Default overlay label, exported for tests + i18n shims. */
export const DROPZONE_DEFAULT_OVERLAY_LABEL = 'Drop files to upload';

/** Default capability id dispatched on drop. */
export const DROPZONE_DEFAULT_CAPABILITY = 'file.upload';

export function DropZone({
  host = false,
  capability = DROPZONE_DEFAULT_CAPABILITY,
  accept,
  maxSize,
  multiple = true,
  overlayLabel = DROPZONE_DEFAULT_OVERLAY_LABEL,
  disabled = false,
  dispatcher,
  onDrop,
  children,
  className,
}: DropZoneProps): ReactNode {
  // Drag-counter pattern: increment on `dragenter`, decrement on
  // `dragleave`. The overlay shows when the counter > 0 — nested
  // children entering / leaving cancel out so the overlay does not
  // flicker.
  const dragCounter = useRef(0);
  const [dragging, setDragging] = useState(false);

  // Reset the counter whenever `disabled` flips to true so a stuck
  // overlay from before-disabled doesn't linger.
  useEffect(() => {
    if (disabled) {
      dragCounter.current = 0;
      setDragging(false);
    }
  }, [disabled]);

  const handleDragEnter = useCallback(
    (e: DragEvent | ReactDragEvent): void => {
      if (disabled) return;
      e.preventDefault();
      dragCounter.current += 1;
      if (dragCounter.current === 1) setDragging(true);
    },
    [disabled],
  );

  const handleDragOver = useCallback(
    (e: DragEvent | ReactDragEvent): void => {
      if (disabled) return;
      // Required so the browser respects the drop target. Without
      // preventDefault on dragover, `drop` never fires.
      e.preventDefault();
    },
    [disabled],
  );

  const handleDragLeave = useCallback(
    (e: DragEvent | ReactDragEvent): void => {
      if (disabled) return;
      e.preventDefault();
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) setDragging(false);
    },
    [disabled],
  );

  const handleDrop = useCallback(
    (e: DragEvent | ReactDragEvent): void => {
      if (disabled) return;
      e.preventDefault();
      dragCounter.current = 0;
      setDragging(false);
      const dt = (e as DragEvent).dataTransfer ?? (e as ReactDragEvent).dataTransfer;
      const list = dt?.files;
      const incoming: File[] = list ? Array.from(list) : [];
      if (incoming.length === 0) return;
      // `exactOptionalPropertyTypes` forbids `undefined` on optional props,
      // so we splat conditionally — the validator already treats absent
      // `accept` / `maxSize` as "skip the check".
      const validatorOptions: { accept?: readonly string[]; maxSize?: number } = {
        ...(accept !== undefined ? { accept } : {}),
        ...(maxSize !== undefined ? { maxSize } : {}),
      };
      const { accepted, rejected } = validateDroppedFiles(incoming, validatorOptions);
      const finalAccepted = multiple ? accepted : accepted.slice(0, 1);
      if (finalAccepted.length > 0 && dispatcher) {
        // Fire-and-forget — the runtime handles its own error / undo
        // wiring. We don't await; the drag event handler is sync.
        void dispatcher(capability, { files: finalAccepted });
      }
      onDrop?.(finalAccepted, rejected);
    },
    [disabled, accept, maxSize, multiple, dispatcher, capability, onDrop],
  );

  // -- host=true: attach to document.body --------------------------------
  // Listeners are attached only when `host=true && !disabled`. They fire
  // alongside any per-region listeners — a wrapped <DropZone host=false>
  // nested inside a host-mode <DropZone> still works, because the host
  // listeners use the document target (always at the root of the bubble
  // path).
  useEffect(() => {
    if (!host || disabled) return;
    if (typeof document === 'undefined') return;
    const target = document.body;
    const onEnter = (e: DragEvent): void => handleDragEnter(e);
    const onOver = (e: DragEvent): void => handleDragOver(e);
    const onLeave = (e: DragEvent): void => handleDragLeave(e);
    const onDropEvt = (e: DragEvent): void => handleDrop(e);
    target.addEventListener('dragenter', onEnter);
    target.addEventListener('dragover', onOver);
    target.addEventListener('dragleave', onLeave);
    target.addEventListener('drop', onDropEvt);
    return (): void => {
      target.removeEventListener('dragenter', onEnter);
      target.removeEventListener('dragover', onOver);
      target.removeEventListener('dragleave', onLeave);
      target.removeEventListener('drop', onDropEvt);
    };
  }, [host, disabled, handleDragEnter, handleDragOver, handleDragLeave, handleDrop]);

  // For `host=false` we wire the React-side drag handlers on the wrapping
  // div. For `host=true` we still render a wrapper around `children` but
  // omit the per-div listeners — the document listeners own the drop.
  const reactDragHandlers = host
    ? {}
    : {
        onDragEnter: handleDragEnter,
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
        onDrop: handleDrop,
      };

  return (
    <div
      data-cir-component="DropZone"
      data-host={host ? 'true' : 'false'}
      data-cir-dragging={dragging ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      className={cn('relative', className)}
      {...reactDragHandlers}
    >
      {children}
      {dragging ? (
        <div
          data-cir-part="dropzone-overlay"
          role="status"
          aria-live="polite"
          className={cn(
            // Pinned overlay; pointer-events-none so the underlying drop
            // target keeps receiving events. The overlay itself is purely
            // visual chrome.
            host ? 'fixed inset-0' : 'absolute inset-0',
            'pointer-events-none flex items-center justify-center',
            'bg-blue-500/10 ring-2 ring-blue-500 ring-inset z-50',
          )}
        >
          <div
            data-cir-part="dropzone-label"
            className={cn(
              'flex items-center gap-2 rounded-md bg-white/95 px-4 py-2',
              'text-sm font-medium text-blue-900 shadow-md',
              'dark:bg-gray-900/95 dark:text-blue-100',
            )}
          >
            <svg
              data-cir-part="dropzone-icon"
              aria-hidden="true"
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>{overlayLabel}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
DropZone.displayName = 'DropZone';

export function dropZoneTextRender(props: DropZoneProps): string {
  return `[DropZone${props.host === true ? ' host' : ''}]`;
}

export const DropZoneBinding: ComponentBinding = {
  id: 'DropZone',
  factory: DropZone as ComponentBinding['factory'],
};
