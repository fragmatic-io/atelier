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
 * Wave 11 / Vis-9 — capability binding + click-through + severity icons:
 *
 *  - **Capability binding.** When the manifest declares
 *    `data: { source: 'system.status' }`, the runtime threads the resolved
 *    payload through `props.data`. The component reads `status` / `message`
 *    / `detail` from that payload, falling back to the explicit props when
 *    the binding has not yet hydrated. Accepted shape:
 *      `{ status: 'operational' | 'degraded' | 'incident' | 'maintenance',
 *         message: string,
 *         detail?: string }`.
 *    Malformed payloads fall through to the explicit-prop path so the bar
 *    never renders blank.
 *
 *  - **Click-through.** `href` (existing) wraps the bar in a same-origin
 *    `<a>`. `onClick` (new) is the alternative for client-side routers
 *    (Next.js / TanStack / React Router) that prefer to intercept rather
 *    than ship to a real URL. Both can coexist — `onClick` runs first; the
 *    handler can `event.preventDefault()` to suppress browser navigation.
 *
 *  - **Severity icon slot.** When an `IconResolver` is in scope, the
 *    leading glyph is rendered as a lucide icon picked per status
 *    (`circle-check` for operational, `alert-triangle` for degraded /
 *    incident, `wrench` for maintenance). Hosts that haven't wired a
 *    resolver still get the Unicode-glyph fallback path — the component
 *    never hard-depends on an icon pack.
 *
 * Wiring example:
 *
 * ```tsx
 * // Manifest-driven (preferred): runtime resolves system.status and
 * // threads it as props.data — no host plumbing.
 * { component: 'StatusBar',
 *   data: { source: 'system.status' },
 *   props: { href: '/status' } }
 *
 * // Imperative (legacy):
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
import {
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import {
  cn,
  iconSizePx,
  statusBarColorClass,
  statusBarVariantClass,
  type StatusBarStatus,
  type StatusBarVariant,
} from './_variants.js';
import { Icon } from './Icon.js';
import { useIconResolver } from '../icons/context.js';

export type { StatusBarStatus, StatusBarVariant } from './_variants.js';

/**
 * Resolved shape carried on `props.data` when the manifest declares
 * `data: { source: 'system.status' }`. Field names mirror the manifest
 * capability registry — `status` is the level token; `message` is the
 * one-line summary; `detail` is the optional second line.
 *
 * The component is liberal in what it accepts: a malformed payload falls
 * through to the explicit-prop path, so a not-yet-hydrated binding never
 * renders a blank pill.
 */
export interface SystemStatusValue {
  status: StatusBarStatus;
  message: string;
  detail?: string;
}

export interface StatusBarProps {
  /** Current system status. */
  status: StatusBarStatus;
  /** Short, user-facing message (always rendered). */
  message: string;
  /** Optional longer detail; suppressed in `compact` variant. */
  detail?: string;
  /** Optional click-through to a dedicated status page. */
  href?: string;
  /**
   * Optional click handler — alternative to `href` for client-side routers
   * (Next.js / TanStack / React Router) that intercept the click and call
   * `router.push(...)` rather than ship to a real URL. When both `href` and
   * `onClick` are set, `onClick` fires first; callers can
   * `event.preventDefault()` to suppress the browser's default navigation.
   */
  onClick?: (event: ReactMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  /** Allow the user to dismiss the bar. State persists in `sessionStorage`. */
  dismissible?: boolean;
  /** Layout variant. `default` is the full pill; `compact` is a dot + message. */
  variant?: StatusBarVariant;
  /** Extra class names appended to the variant utility class string. */
  className?: string;
  /**
   * Capability-bound payload. Set automatically by the runtime when the
   * manifest declares `data: { source: 'system.status' }`. When the payload
   * carries valid `status` / `message` fields, those win over the explicit
   * props; malformed payloads fall through so the bar never blanks. See
   * `SystemStatusValue` for the accepted shape.
   */
  data?: unknown;
}

/**
 * Per-status Unicode glyph. Plain text so the package does not pull in an
 * icon set; hosts can re-skin via
 * `[data-cir-component="StatusBar"] [data-cir-part="icon"]`. Used as the
 * fallback when no `IconResolver` is wired.
 */
const STATUS_ICON: Readonly<Record<StatusBarStatus, string>> = Object.freeze({
  operational: '✓', //   check mark
  degraded: '⚠', //     warning sign
  incident: '●', //     filled circle
  maintenance: '🛠', // hammer + wrench (U+1F6E0)
});

/**
 * Per-status default lucide icon name. Lined up with names the
 * `LucideIconResolver` default roster recognises out of the box. Hosts that
 * wire a different resolver can re-skin via that contract — the component
 * still falls back to the Unicode glyph above if the resolver returns null.
 */
const STATUS_DEFAULT_ICON_NAME: Readonly<Record<StatusBarStatus, string>> = Object.freeze({
  operational: 'circle-check',
  degraded: 'alert-triangle',
  incident: 'alert-triangle',
  maintenance: 'wrench',
});

const STATUS_LABEL: Readonly<Record<StatusBarStatus, string>> = Object.freeze({
  operational: 'Operational',
  degraded: 'Degraded',
  incident: 'Incident',
  maintenance: 'Maintenance',
});

/** Allowed status tokens used by the capability-binding parser. */
const STATUS_TOKENS: ReadonlySet<string> = new Set<StatusBarStatus>([
  'operational',
  'degraded',
  'incident',
  'maintenance',
]);

/**
 * Best-effort parser for the `system.status` capability payload. Returns
 * `undefined` for any non-conforming shape so the caller falls through to
 * the explicit-prop path. Tolerant of `level` as an alias for `status`
 * (mirrors the JSDoc-pinned imperative-wiring example).
 */
function parseSystemStatus(value: unknown): SystemStatusValue | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const bag = value as Record<string, unknown>;
  const rawStatus = bag['status'] ?? bag['level'];
  const rawMessage = bag['message'];
  if (typeof rawStatus !== 'string' || typeof rawMessage !== 'string') return undefined;
  if (!STATUS_TOKENS.has(rawStatus)) return undefined;
  const out: SystemStatusValue = { status: rawStatus as StatusBarStatus, message: rawMessage };
  if (typeof bag['detail'] === 'string') out.detail = bag['detail'];
  return out;
}

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
  status: statusProp,
  message: messageProp,
  detail: detailProp,
  href,
  onClick,
  dismissible = false,
  variant = 'default',
  className,
  data,
}: StatusBarProps): ReactNode {
  const reducedMotion = usePrefersReducedMotion();
  const resolver = useIconResolver();
  const [dismissed, setDismissed] = useState(false);

  // Capability-binding payload wins when valid. Malformed payloads fall
  // through to the explicit-prop path so the bar never renders blank.
  const bound = parseSystemStatus(data);
  const status: StatusBarStatus = bound?.status ?? statusProp;
  const message: string = bound?.message ?? messageProp;
  const detail: string | undefined = bound?.detail ?? detailProp;
  const boundFromCapability = bound !== undefined;

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

  // Severity-icon slot. Resolver returning a real SVG renders an `<Icon>`;
  // otherwise we fall back to the Unicode glyph so the package keeps its
  // zero-icon-pack-default posture.
  const iconName = STATUS_DEFAULT_ICON_NAME[status];
  const hasResolvedIcon = resolver.resolve('lucide', iconName) !== null;
  const iconSize = isCompact ? iconSizePx.sm : iconSizePx.md;
  const iconStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    ...(showPulse ? PULSE_ANIMATION : {}),
  };

  const icon = (
    <span
      data-cir-part="icon"
      data-cir-icon-source={hasResolvedIcon ? 'resolver' : 'unicode'}
      aria-hidden="true"
      style={iconStyle}
    >
      {hasResolvedIcon ? (
        <Icon set="lucide" name={iconName} size={iconSize} />
      ) : isCompact ? (
        '●' /* solid dot for compact */
      ) : (
        STATUS_ICON[status]
      )}
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
    'data-cir-bound': boundFromCapability ? 'system.status' : undefined,
    className: cn(colorClass, layoutClass, className),
  };

  // Click-through wraps the body in either an `<a>` (when `href` is set —
  // including the `onClick`-without-href + `<a role="button">` combo so
  // hosts can keep a focusable, keyboard-activatable link without a real
  // URL) or a `<button>` (when only `onClick` is set; matches expected
  // tab order + Enter/Space activation for non-link clickables).
  const linkBaseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: 'inherit',
    textDecoration: 'inherit',
  };

  let linkEl: ReactNode;
  if (href !== undefined) {
    linkEl = (
      <a href={href} data-cir-part="link" onClick={onClick} style={linkBaseStyle}>
        {body}
      </a>
    );
  } else if (onClick !== undefined) {
    linkEl = (
      <button
        type="button"
        data-cir-part="link"
        onClick={onClick}
        style={{
          ...linkBaseStyle,
          background: 'transparent',
          border: 0,
          padding: 0,
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        {body}
      </button>
    );
  } else {
    linkEl = (
      <span data-cir-part="link" style={linkBaseStyle}>
        {body}
      </span>
    );
  }

  const inner = (
    <>
      {showPulse ? <style data-cir-part="keyframes">{PULSE_STYLE}</style> : null}
      {linkEl}
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
  // Honour the capability binding in the text adapter too, so audit /
  // accessibility / non-DOM consumers see the same final string the visual
  // renderer would.
  const bound = parseSystemStatus(props?.data);
  const status = bound?.status ?? props?.status ?? 'operational';
  const message = bound?.message ?? props?.message ?? '';
  return message.length > 0 ? `${capitalize(status)}: ${message}` : capitalize(status);
}

export const StatusBarBinding: ComponentBinding = { id: 'StatusBar', factory: StatusBar };
