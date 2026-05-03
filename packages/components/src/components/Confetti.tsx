// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Confetti — CSS-only celebration burst.
 *
 * Wave 11 / Int-5 — onboarding microinteractions. Tiny "you finished it"
 * sparkle, no canvas, no external dep. Spawns N span-particles with
 * randomised X drift + colour and a CSS keyframe-driven fall + fade over
 * `durationMs` (default 1200). When the duration elapses, fires `onDone`
 * exactly once and unmounts the particles.
 *
 * Reduced-motion contract — under `prefers-reduced-motion: reduce` we
 * render ZERO particles and fire `onDone` on the next microtask. The host
 * still gets the "celebration finished" callback (so any ambient toast or
 * navigation hooked off it still runs) but the user sees no motion.
 *
 * Composition role: leaf — particles are owned by this component; no
 * children are rendered. The host mounts `<Confetti active={…} />` near
 * the celebration anchor.
 */
import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { isReducedMotion, type ComponentBinding } from '@atelier/runtime';

export interface ConfettiProps {
  /** When true, the particle burst plays. False unmounts the particles. */
  active: boolean;
  /** Total burst duration in ms. Default 1200. */
  durationMs?: number;
  /** Number of span-particles. Default 24. */
  particleCount?: number;
  /** Fired once the burst ends (or immediately under reduced-motion). */
  onDone?: () => void;
}

/** Default colour wheel — picked to read on both light and dark surfaces. */
const PALETTE: readonly string[] = Object.freeze([
  '#3b82f6', // blue-500
  '#22c55e', // green-500
  '#f59e0b', // amber-500
  '#ec4899', // pink-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
]);

/**
 * Pseudo-random in `[0, 1)`. Seeded per particle so SSR + first client
 * render agree (we hash the seed via a small linear-congruential step).
 * Not crypto — we just need stable jitter.
 */
function seededRandom(seed: number): number {
  // LCG constants from Numerical Recipes; cheap and stable.
  const x = (seed * 1664525 + 1013904223) % 0x100000000;
  return (x >>> 0) / 0x100000000;
}

interface Particle {
  id: number;
  /** Final x drift in px, signed. */
  drift: number;
  /** Final y fall distance in px (always positive). */
  fall: number;
  /** Initial rotation in degrees. */
  rotate: number;
  /** Particle colour. */
  color: string;
  /** Width / height in px. */
  size: number;
  /** Animation delay in ms (staggered burst). */
  delay: number;
}

export function buildParticles(count: number, baseSeed: number): readonly Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i += 1) {
    const seed = baseSeed + i * 97;
    const rx = seededRandom(seed);
    const ry = seededRandom(seed + 1);
    const rr = seededRandom(seed + 2);
    const rc = seededRandom(seed + 3);
    const rs = seededRandom(seed + 4);
    const rd = seededRandom(seed + 5);
    out.push({
      id: i,
      drift: (rx - 0.5) * 160, // -80..+80 px lateral
      fall: 80 + ry * 80, // 80..160 px down
      rotate: (rr - 0.5) * 720, // -360..+360 deg
      color: PALETTE[Math.floor(rc * PALETTE.length) % PALETTE.length] ?? PALETTE[0]!,
      size: 6 + Math.floor(rs * 5), // 6..10 px
      delay: Math.floor(rd * 120), // 0..120 ms stagger
    });
  }
  return out;
}

export function Confetti({
  active,
  durationMs = 1200,
  particleCount = 24,
  onDone,
}: ConfettiProps): ReactNode {
  // Sample reduced-motion at mount. The runtime's `isReducedMotion()` is
  // non-reactive — same pattern as `_transition.ts` here in
  // `@atelier/components`. Hosts that need OS-preference reactivity can
  // remount the celebration via a key change.
  const [reducedMotion] = useState<boolean>(() => isReducedMotion());
  const groupId = useId();
  const [running, setRunning] = useState(false);
  // Stable seed per "active=true" cycle so re-renders don't reshuffle the
  // particles mid-flight. Re-seeded on each rising edge.
  const [seed, setSeed] = useState<number>(() => Date.now() & 0x7fffffff);

  // When `active` flips true, mark a new burst — bump the seed and start
  // running. When it flips false, stop running (particles unmount).
  useEffect(() => {
    if (active) {
      setSeed((Date.now() ^ Math.floor(performance.now())) & 0x7fffffff);
      setRunning(true);
    } else {
      setRunning(false);
    }
  }, [active]);

  // Reduced-motion path — no particles ever; fire onDone on the next
  // microtask so the host's celebration handler still runs.
  useEffect(() => {
    if (!running) return undefined;
    if (!reducedMotion) return undefined;
    // Microtask flush; tests that await a Promise.resolve() will observe.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setRunning(false);
      onDone?.();
    });
    return (): void => {
      cancelled = true;
    };
  }, [running, reducedMotion, onDone]);

  // Motion path — fire onDone after `durationMs` then unmount the particles.
  useEffect(() => {
    if (!running) return undefined;
    if (reducedMotion) return undefined;
    const t = setTimeout(() => {
      setRunning(false);
      onDone?.();
    }, durationMs);
    return (): void => clearTimeout(t);
  }, [running, reducedMotion, durationMs, onDone]);

  const particles = useMemo<readonly Particle[]>(() => {
    if (!running || reducedMotion) return [];
    return buildParticles(Math.max(0, Math.floor(particleCount)), seed);
  }, [running, reducedMotion, particleCount, seed]);

  // The unique animation name pins the keyframe to this instance so two
  // confetti bursts on the page don't share running state.
  const animName = `cir-confetti-${groupId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  if (!running) {
    // Render nothing visible; the data-attribute is still useful for
    // hosts that want to detect "celebration just played" via mutation
    // observers, but no DOM is otherwise emitted.
    return null;
  }

  if (reducedMotion) {
    return (
      <span
        data-cir-component="Confetti"
        data-active="true"
        data-reduced-motion="true"
        aria-hidden="true"
        style={{ display: 'none' }}
      />
    );
  }

  // We inline a tiny <style> tag with the keyframe — the keyframe needs
  // CSS variables (--cir-confetti-drift / --cir-confetti-fall /
  // --cir-confetti-rotate) so each particle interpolates to its own
  // resting position. Inlined so the package still ships zero-CSS.
  const keyframeCss = `
@keyframes ${animName} {
  0% {
    transform: translate(0, 0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translate(var(--cir-confetti-drift), var(--cir-confetti-fall)) rotate(var(--cir-confetti-rotate));
    opacity: 0;
  }
}
`;

  const wrapStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    overflow: 'visible',
  };

  return (
    <span data-cir-component="Confetti" data-active="true" aria-hidden="true" style={wrapStyle}>
      <style>{keyframeCss}</style>
      {particles.map((p) => {
        const style: CSSProperties = {
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: `${String(p.size)}px`,
          height: `${String(p.size)}px`,
          backgroundColor: p.color,
          borderRadius: '2px',
          // Custom props the keyframe interpolates to.
          ['--cir-confetti-drift' as string]: `${String(p.drift)}px`,
          ['--cir-confetti-fall' as string]: `${String(p.fall)}px`,
          ['--cir-confetti-rotate' as string]: `${String(p.rotate)}deg`,
          animationName: animName,
          animationDuration: `${String(durationMs)}ms`,
          animationDelay: `${String(p.delay)}ms`,
          animationTimingFunction: 'cubic-bezier(0.2, 0.6, 0.2, 1)',
          animationFillMode: 'forwards',
          willChange: 'transform, opacity',
        };
        return (
          <span key={p.id} data-cir-part="confetti-particle" data-color={p.color} style={style} />
        );
      })}
    </span>
  );
}
Confetti.displayName = 'Confetti';

export function confettiTextRender(_props?: Partial<ConfettiProps>): string {
  return '[Confetti]';
}

export const ConfettiBinding: ComponentBinding = {
  id: 'Confetti',
  factory: Confetti as ComponentBinding['factory'],
  manifestContract: {
    description:
      'CSS-only celebration burst — N span-particles fall + fade for `durationMs`. ' +
      'Honours `prefers-reduced-motion`: zero particles, fires `onDone` on the next ' +
      'microtask. Composition role: leaf.',
    allowed_props: {
      active: 'boolean',
      durationMs: 'number',
      particleCount: 'number',
    },
  },
};
