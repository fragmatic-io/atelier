// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `/admin/patterns` — graduation-candidate dashboard.
 *
 * Renders the snapshot of a server-side `SequenceDetector` seeded with a
 * synthetic stream (no real audit pipeline outside the monorepo yet).
 * Each row carries a "Promote to recipe" button that posts to
 * `/api/admin/patterns/promote`, which scaffolds a stub at
 * `recipes/_proposed/<pattern_id>.json` for human review.
 *
 * Server component on purpose — the detector is in-process and renders
 * once on each request. The button is the only client-side bit and lives
 * in `PromoteButton` below.
 *
 * NOT a real promotion workflow. The full review flow is V-6 territory.
 */

import { renderPatternRows, seedDemoSequenceDetector } from '@/lib/admin-patterns';
import { PromoteButton } from './promote-button';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function AdminPatternsPage(): React.JSX.Element {
  const detector = seedDemoSequenceDetector();
  const rows = renderPatternRows(detector);

  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Behavioral patterns</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>
        Graduation candidates surfaced by the runtime <code>SequenceDetector</code>. A pattern
        appears here once at least two distinct users converge on the same action sequence and the
        cross-user occurrence count clears the threshold.
      </p>

      {rows.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No graduation candidates yet — keep the runtime running.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rows.map((row) => (
            <li
              key={row.pattern_id}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 16,
                marginBottom: 12,
              }}
              data-testid="pattern-row"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    <code>{row.pattern_id}</code>
                  </div>
                  <div style={{ color: '#374151', marginTop: 4 }}>{row.description}</div>
                  <div style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>
                    Capabilities:{' '}
                    {row.capability_ids.map((id, i) => (
                      <span key={id}>
                        <code>{id}</code>
                        {i < row.capability_ids.length - 1 ? ' → ' : null}
                      </span>
                    ))}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>
                    Occurrences: <strong>{row.occurrences}</strong> across {row.per_user.length}{' '}
                    users — {row.per_user.map((u) => `${u.user_id}: ${u.count}`).join(', ')}
                  </div>
                </div>
                <PromoteButton pattern_id={row.pattern_id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
