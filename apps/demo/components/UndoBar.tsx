// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * UndoBar — surfaces the dispatcher's undo affordance.
 *
 * Required by the `reversibility_surfaced` policy in `@cir/policies`: any
 * route that references reversible actions must include an Undo affordance
 * (a component named Undo/UndoBar/UndoToast, OR a Button bound to a rollback
 * capability). Without this, `validateManifest` rejects the manifest at
 * resolve time and the runtime falls back to the prior cached manifest.
 *
 * Behavior: a fixed footer with one "Undo last action" button. Clicking
 * pops the dispatcher's undo stack and dispatches the rollback capability.
 * `dispatcher.canUndo()` is polled lazily on focus / on each click; in a
 * real app you'd wire this to the audit-sink event stream so the button
 * disables instantly. For the demo we keep it simple.
 */

import { useCallback, useState } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { useCir } from '@cir/react';

export function UndoBar(): React.JSX.Element {
  const { dispatcher } = useCir();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await dispatcher.undo();
      setToast(result ? 'Undone.' : 'Nothing to undo.');
    } catch (err) {
      setToast(`Undo failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 2000);
    }
  }, [busy, dispatcher]);

  return (
    <div data-cir-component="UndoBar" className="fixed bottom-0 inset-x-0 pointer-events-none z-50">
      <div className="max-w-screen-md mx-auto p-4 flex justify-end gap-3">
        {toast && (
          <span className="pointer-events-auto bg-gray-900 text-white text-sm px-3 py-2 rounded shadow-lg">
            {toast}
          </span>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={handleClick}
          className="pointer-events-auto bg-white border border-gray-300 hover:border-gray-400 text-sm px-3 py-2 rounded shadow-sm disabled:opacity-50"
        >
          ↶ Undo last action
        </button>
      </div>
    </div>
  );
}

export const UNDO_BAR_BINDING: ComponentBinding = {
  id: 'UndoBar',
  factory: UndoBar,
};
