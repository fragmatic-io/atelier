// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * StatusBar — persistent system-status pill, intended to subscribe to a
 * `system.status` capability. Renders a coloured pill with an icon, a short
 * message, optional detail, an optional click-through href, and an optional
 * dismiss button (state persists in `sessionStorage`).
 *
 * Status -> colour family:
 *   - operational  green  (everything fine)
 *   - degraded     yellow (partial/partial-outage)
 *   - incident     red    (active incident; default variant gets a subtle pulse)
 *   - maintenance  blue   (scheduled work)
 *
 * Variants:
 *   - default — full pill with optional `detail` and (when `incident`) a
 *     CSS pulse animation (suppressed under `prefers-reduced-motion: reduce`).
 *   - compact — a dot + message; no detail, no pulse.
 *
 * Wiring example for a host:
 *
 * ```tsx
 * // In a layout / chrome component:
 * function Chrome() {
 *   const status = useCapability('system.status');
 *   if (!status) return null;
 *   return (
 *     <StatusBar
 *       status={status.level}
 *       message={status.message}
 *       detail={status.detail}
 *       href="/status"
 *       dismissible
 *     />
 *   );
 * }
 * ```
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import {
  cn,
  statusBarColorClass,
  statusBarVariantClass,
  type StatusBarStatus,
  type StatusBarVariant,
} from './_variants.js';

export type { StatusBarStatus, StatusBarVariant } from './_variants.js';

export interface StatusBarProps {
  /** Current system status. */
  status: StatusBarStatus;
  /** Short, user-facing message (always rendered). */
  message: string;
  /** Optional longer detail; suppressed in `compact` variant. */
  detail?: string;
  /** Optional click-through to a dedicated status page. */
  href?: string;
  /** Allow the user to dismiss the bar. State persists in `sessionStorage`. */
  dismissible?: boolean;
  /** Layout variant. `default` is the full pill; `compact` is a dot + message. */
  variant?: StatusBarVariant;
  /** Extra class names appended to the variant utility class string. */
  className?: string;
}

/**
 * Per-status icon. Plain Unicode so the package does not pull in an icon set;
 * hosts can re-skin via `[data-cir-component="StatusBar"] [data-cir-part="icon"]`.
 */
const STATUS_ICON: Readonly<Record<StatusBarStatus, string>> = Object.freeze({
  operational: '✓', //   check mark
  degraded: '⚠', //     warning sign
  incident: '●', //     filled circle
  maintenance: '🛠', // hammer + wrench (U+1F6E0)
});

const STATUS_LABEL: Readonly<Record<StatusBarStatus, string>> = Object.freeze({
  operational: 'Operational',
  degraded: 'Degraded',
  incident: 'Incident',
  maintenance: 'Maintenance',
});

/** sessionStorage key for the dismiss flag. */
function dismissKey(href: string | undefined, message: string): string {
  return `cir.demo.status-dismissed-${href ?? message}`;
}

/**
 * Detect `prefers-reduced-motion: reduce`. Returns false during SSR and on
 * environments without `matchMedia`.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent): void => {
      setReduced(e.matches);
    };
    // Older Safari: addListener is the only API.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return (): void => {
        mq.removeEventListener('change', onChange);
      };
    }
    mq.addListener(onChange);
    return (): void => {
      mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

/**
 * The single CSS rule we ship: the incident-pulse keyframes. Inlined as a
 * `<style>` so the package keeps its zero-CSS posture. Hosts that already
 * define `@keyframes cir-status-pulse` can override safely; the rule is
 * idempotent.
 */
const PULSE_STYLE = `@keyframes cir-status-pulse{0%,100%{opacity:1}50%{opacity:.6}}`;

const PULSE_ANIMATION: CSSProperties = {
  animation: 'cir-status-pulse 1.6s ease-in-out infinite',
};

export function StatusBar({
  status,
  message,
  detail,
  href,
  dismissible = false,
  variant = 'default',
  className,
}: StatusBarProps): ReactNode {
  const reducedMotion = usePrefersReducedMotion();
  const [dismissed, setDismissed] = useState(false);

  // Re-hydrate the dismissed flag from sessionStorage on mount and whenever
  // the dismiss key changes (e.g. the host swaps href / message).
  useEffect(() => {
    if (!dismissible) {
      setDismissed(false);
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      const flag = window.sessionStorage.getItem(dismissKey(href, message));
      setDismissed(flag === '1');
    } catch {
      // sessionStorage may throw in privacy mode / sandboxed iframes.
      setDismissed(false);
    }
  }, [dismissible, href, message]);

  if (dismissed) {
    // Render an empty placeholder with display:none so that callers' DOM
    // queries do not hit a stale element. Returning `null` is also fine, but
    // some adapters key on `data-cir-component` for diagnostics.
    return (
      <div
        data-cir-component="StatusBar"
        data-cir-part="dismissed"
        data-status={status}
        data-variant={variant}
        style={{ display: 'none' }}
      />
    );
  }

  const onDismiss = (): void => {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(dismissKey(href, message), '1');
      } catch {
        // Swallow — dismiss still hides the bar in-memory.
      }
    }
    setDismissed(true);
  };

  const showPulse = variant === 'default' && status === 'incident' && !reducedMotion;
  const colorClass = statusBarColorClass[status];
  const layoutClass = statusBarVariantClass[variant];
  const isCompact = variant === 'compact';

  const icon = (
    <span data-cir-part="icon" aria-hidden="true" style={showPulse ? PULSE_ANIMATION : undefined}>
      {isCompact ? '●' /* solid dot for compact */ : STATUS_ICON[status]}
    </span>
  );

  const body: ReactNode = (
    <>
      {icon}
      <span data-cir-part="message">{message}</span>
      {!isCompact && detail !== undefined ? (
        <span data-cir-part="detail" style={{ opacity: 0.85 }}>
          {detail}
        </span>
      ) : null}
    </>
  );

  // Common attrs for both anchor and div renders.
  const commonProps = {
    role: 'status' as const,
    'aria-live': 'polite' as const,
    'aria-atomic': 'true' as const,
    'aria-label': `${STATUS_LABEL[status]}: ${message}`,
    'data-cir-component': 'StatusBar',
    'data-status': status,
    'data-variant': variant,
    'data-pulse': showPulse ? 'true' : undefined,
    className: cn(colorClass, layoutClass, className),
  };

  const inner = (
    <>
      {showPulse ? <style data-cir-part="keyframes">{PULSE_STYLE}</style> : null}
      {href !== undefined ? (
        <a
          href={href}
          data-cir-part="link"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {body}
        </a>
      ) : (
        <span
          data-cir-part="link"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {body}
        </span>
      )}
      {dismissible ? (
        <button
          type="button"
          aria-label="Dismiss status"
          data-cir-part="dismiss"
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            padding: '0 0.25rem',
            font: 'inherit',
            color: 'inherit',
            lineHeight: 1,
          }}
        >
          {'×' /* multiplication sign — visually the close x */}
        </button>
      ) : null}
    </>
  );

  return <div {...commonProps}>{inner}</div>;
}
StatusBar.displayName = 'StatusBar';

/** Capitalise a status token for the text fallback. */
function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

export function statusBarTextRender(props: Partial<StatusBarProps>): string {
  const status = props?.status ?? 'operational';
  const message = props?.message ?? '';
  return message.length > 0 ? `${capitalize(status)}: ${message}` : capitalize(status);
}

export const StatusBarBinding: ComponentBinding = { id: 'StatusBar', factory: StatusBar };
