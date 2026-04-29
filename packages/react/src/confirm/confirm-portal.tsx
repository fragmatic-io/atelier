// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';
/**
 * `<ConfirmPortal>` — renders the head of the confirmation queue as a native
 * `<dialog>` modal. Resolves the request promise on confirm/cancel/escape.
 *
 * The portal is intentionally unstyled and uses semantic HTML. Hosts can
 * replace the entire confirmation flow by passing a custom
 * `ConfirmationCallback` to `<CirRuntime confirm={...}>`. We do NOT depend on
 * `@cir/components` here — keeping the adapter standalone avoids a circular
 * workspace dep.
 *
 * Behaviors:
 *  - Confirm button → resolves `{ confirmed: true }`
 *  - Cancel button → resolves `{ confirmed: false, reason: 'user_cancelled' }`
 *  - Escape key → same as cancel
 *  - Only one modal at a time (the store guarantees this).
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ConfirmStore } from './confirm-store.js';

export interface ConfirmPortalProps {
  store: ConfirmStore;
}

export function ConfirmPortal({ store }: ConfirmPortalProps): React.ReactElement | null {
  const head = useSyncExternalStore(
    (l) => store.subscribe(l),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // Open / close the native <dialog> in sync with the head.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (head && !dlg.open) {
      // happy-dom's HTMLDialogElement supports showModal() in v15+, but if
      // a host has stubbed it, fall back to setting the `open` attribute.
      try {
        dlg.showModal();
      } catch {
        dlg.setAttribute('open', '');
      }
    }
    if (!head && dlg.open) {
      try {
        dlg.close();
      } catch {
        dlg.removeAttribute('open');
      }
    }
  }, [head]);

  if (!head) return null;

  const { capability } = head.request;
  const title = `Confirm ${capability.id}`;
  const description = capability.side_effects.length
    ? `This action has side effects: ${capability.side_effects.join(', ')}.`
    : 'Please confirm this action.';

  const onConfirm = (): void => {
    store.resolveHead({ confirmed: true });
  };
  const onCancel = (): void => {
    store.resolveHead({ confirmed: false, reason: 'user_cancelled' });
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      data-cir-confirm-portal=""
      onKeyDown={onKeyDown}
      onClose={onCancel}
      aria-labelledby="cir-confirm-title"
      aria-describedby="cir-confirm-desc"
    >
      <h2 id="cir-confirm-title">{title}</h2>
      <p id="cir-confirm-desc">{description}</p>
      <div data-cir-confirm-actions="">
        <button type="button" data-cir-confirm-cancel="" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" data-cir-confirm-ok="" onClick={onConfirm}>
          Confirm
        </button>
      </div>
    </dialog>
  );
}
