// @vitest-environment happy-dom
import './setup.js';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MarketplaceBrowser,
  MarketplaceBrowserBinding,
  MARKETPLACE_BROWSER_DEFAULT_DEBOUNCE_MS,
  MARKETPLACE_BROWSER_REGION_LABEL,
  MockMarketplaceClient,
  marketplaceBrowserTextRender,
  type MarketplaceAddress,
  type MarketplaceBrowserDispatcher,
  type MarketplaceClient,
  type MarketplaceListing,
  type MarketplaceListQuery,
} from '../src/components/MarketplaceBrowser.js';
import type { CompileQualityScorecard } from '../src/components/MarketplaceScorecardPanel.js';

function scorecard(
  raw: string,
  overrides: Partial<CompileQualityScorecard> = {},
): CompileQualityScorecard {
  // Parse `atelier://author/persona@version` into address parts.
  const m = /^atelier:\/\/([^/]+)\/([^@]+)@(.+)$/u.exec(raw);
  const author = m?.[1] ?? 'acme';
  const persona = m?.[2] ?? 'p';
  const version = m?.[3] ?? '1.0.0';
  return {
    address: { scheme: 'atelier', author, persona, version, raw },
    generated_at: '2026-05-04T04:00:00Z',
    reference_versions: {
      capabilities_hash: 'a'.repeat(64),
      components_hash: 'b'.repeat(64),
      compiler_version: 'fallback-generic',
    },
    compile_passed: true,
    schema_passed: true,
    policy_passed: true,
    snapshot_stable: true,
    cost_within_budget: true,
    notes: [],
    ...overrides,
  };
}

function addr(author: string, persona: string, version: string): MarketplaceAddress {
  return {
    scheme: 'atelier',
    author,
    persona,
    version,
    raw: `atelier://${author}/${persona}@${version}`,
  };
}

function listing(
  author: string,
  persona: string,
  version: string,
  overrides: Partial<MarketplaceListing> = {},
): MarketplaceListing {
  return {
    address: addr(author, persona, version),
    description: `${persona} description`,
    publishedAt: '2026-05-01T12:00:00Z',
    authorDisplayName: author,
    ...overrides,
  };
}

const SAMPLE: MarketplaceListing[] = [
  listing('acme', 'founder-inbox', '1.0.0', {
    description: 'Inbox lens for founders.',
    domain: 'productivity',
    brandKitId: 'acme-default',
  }),
  listing('aurora', 'designer-canvas', '0.4.1', {
    description: 'Canvas-shaped design lens.',
    domain: 'design',
    brandKitId: 'aurora-light',
  }),
  listing('marigold', 'reviewer', '2.0.0', {
    description: 'Pull-request review lens with diff focus.',
    domain: 'engineering',
  }),
];

describe('MarketplaceBrowser', () => {
  it('renders region semantics + list-role + listitem-role', async () => {
    const client = new MockMarketplaceClient(SAMPLE);
    const { container, findByRole } = render(<MarketplaceBrowser client={client} />);
    const region = await findByRole('region', { name: MARKETPLACE_BROWSER_REGION_LABEL });
    expect(region).toBeTruthy();
    // Wait for the listings to land.
    await waitFor(() => {
      expect(container.querySelector('[role="list"]')).toBeTruthy();
    });
    const items = container.querySelectorAll('[role="listitem"]');
    expect(items.length).toBe(SAMPLE.length);
  });

  it('shows skeleton on initial fetch + replaces with listings', async () => {
    let resolveList: ((value: MarketplaceListing[]) => void) | null = null;
    const client: MarketplaceClient = {
      list: () =>
        new Promise<MarketplaceListing[]>((resolve) => {
          resolveList = resolve;
        }),
      get: () => Promise.resolve(null),
    };
    const { container } = render(<MarketplaceBrowser client={client} />);
    // Skeleton present while fetch is in flight (Skeleton's role=status with
    // shape=card lives inside `[data-cir-part="marketplace-loading"]`).
    expect(container.querySelector('[data-cir-part="marketplace-loading"]')).toBeTruthy();
    // Resolve and assert the skeleton swaps for the list.
    await act(async () => {
      resolveList?.(SAMPLE);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(container.querySelector('[data-cir-part="marketplace-loading"]')).toBeNull();
      expect(container.querySelector('[role="list"]')).toBeTruthy();
    });
  });

  it('renders listing cards with persona / version / author / chips', async () => {
    const client = new MockMarketplaceClient(SAMPLE);
    const { container, findByText } = render(<MarketplaceBrowser client={client} />);
    expect(await findByText('founder-inbox')).toBeTruthy();
    // Version pill shows the v-prefixed semver.
    expect(await findByText('v1.0.0')).toBeTruthy();
    // Author chip — `authorDisplayName` is the same as `address.author` in
    // SAMPLE, so the assertion is on the rendered text.
    expect(await findByText('by acme')).toBeTruthy();
    // Domain chip rendered when supplied.
    const chips = container.querySelectorAll('[data-chip-kind="domain"]');
    expect(chips.length).toBeGreaterThan(0);
    // Brand-kit chip rendered when supplied.
    const brandChips = container.querySelectorAll('[data-chip-kind="brand-kit"]');
    expect(brandChips.length).toBeGreaterThan(0);
  });

  it('refilters via client.list() when an author filter changes', async () => {
    const list = vi.fn((query?: MarketplaceListQuery) => {
      const all = SAMPLE.slice();
      if (query?.author !== undefined && query.author !== '') {
        return Promise.resolve(all.filter((l) => l.address.author === query.author));
      }
      return Promise.resolve(all);
    });
    const client: MarketplaceClient = {
      list,
      get: () => Promise.resolve(null),
    };
    const { container, findByLabelText } = render(<MarketplaceBrowser client={client} />);
    // Initial call (no filters).
    await waitFor(() => {
      expect(list).toHaveBeenCalled();
    });
    expect(list.mock.calls[0]?.[0]).toEqual({});

    const authorInput = (await findByLabelText('Author')) as HTMLInputElement;
    fireEvent.change(authorInput, { target: { value: 'aurora' } });
    await waitFor(() => {
      expect(list.mock.calls.length).toBeGreaterThan(1);
    });
    const lastCall = list.mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual({ author: 'aurora' });
    // The refilter ran and updated the list.
    await waitFor(() => {
      const items = container.querySelectorAll('[role="listitem"]');
      expect(items.length).toBe(1);
    });
  });

  it('debounces the search input (~200ms) before refetching', async () => {
    // Render under real timers so testing-library's polling helpers work
    // for the initial mount; switch to fake timers only for the debounce
    // window assertions. (testing-library's findBy* uses setTimeout and
    // would hang under fake timers.)
    const list = vi.fn((_query?: MarketplaceListQuery) => Promise.resolve(SAMPLE.slice()));
    const client: MarketplaceClient = {
      list,
      get: () => Promise.resolve(null),
    };
    const { getByLabelText, container } = render(<MarketplaceBrowser client={client} />);
    // Wait for the initial fetch + render.
    await waitFor(() => {
      expect(container.querySelectorAll('[role="listitem"]').length).toBe(SAMPLE.length);
    });
    expect(list).toHaveBeenCalledTimes(1);
    expect(list.mock.calls[0]?.[0]).toEqual({});

    vi.useFakeTimers();
    try {
      const searchInput = getByLabelText('Search') as HTMLInputElement;
      // Fire several quick changes — the debounce should coalesce.
      fireEvent.change(searchInput, { target: { value: 'fo' } });
      fireEvent.change(searchInput, { target: { value: 'fou' } });
      fireEvent.change(searchInput, { target: { value: 'found' } });

      // Pre-debounce: still only the initial call.
      expect(list).toHaveBeenCalledTimes(1);

      // Advance just shy of the debounce window — still no extra call.
      act(() => {
        vi.advanceTimersByTime(MARKETPLACE_BROWSER_DEFAULT_DEBOUNCE_MS - 1);
      });
      expect(list).toHaveBeenCalledTimes(1);

      // Cross the boundary; the queued setTimeout fires synchronously,
      // commits the search, and triggers the refetch effect.
      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(list.mock.calls.length).toBeGreaterThan(1);
      expect(list.mock.calls.at(-1)?.[0]).toEqual({ search: 'found' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the preview drawer on card click', async () => {
    const client = new MockMarketplaceClient(SAMPLE);
    const { container, findAllByRole } = render(<MarketplaceBrowser client={client} />);
    const items = await findAllByRole('listitem');
    const button = items[0]!.querySelector('button')!;
    fireEvent.click(button);
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    });
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe('Preview founder-inbox');
  });

  it('"Use this recipe" fires onSelect AND dispatches selectCapability', async () => {
    const client = new MockMarketplaceClient(SAMPLE);
    const onSelect = vi.fn();
    const dispatcher = vi.fn<MarketplaceBrowserDispatcher>().mockResolvedValue(undefined);
    const { container, findAllByRole, findByText } = render(
      <MarketplaceBrowser
        client={client}
        onSelect={onSelect}
        selectCapability="marketplace.install"
        dispatcher={dispatcher}
      />,
    );
    const items = await findAllByRole('listitem');
    fireEvent.click(items[1]!.querySelector('button')!);
    const useBtn = await findByText('Use this recipe');
    fireEvent.click(useBtn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toMatchObject({
      address: { author: 'aurora', persona: 'designer-canvas' },
    });
    expect(dispatcher).toHaveBeenCalledTimes(1);
    expect(dispatcher.mock.calls[0]![0]).toBe('marketplace.install');
    const params = dispatcher.mock.calls[0]![1] as { address: MarketplaceAddress };
    expect(params.address.raw).toBe('atelier://aurora/designer-canvas@0.4.1');
    // Drawer closes after the CTA fires.
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeNull();
    });
  });

  it('"Use this recipe" fires onSelect even with NO selectCapability / dispatcher', async () => {
    const client = new MockMarketplaceClient(SAMPLE);
    const onSelect = vi.fn();
    const { findAllByRole, findByText } = render(
      <MarketplaceBrowser client={client} onSelect={onSelect} />,
    );
    const items = await findAllByRole('listitem');
    fireEvent.click(items[0]!.querySelector('button')!);
    fireEvent.click(await findByText('Use this recipe'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders <EmptyState> when listings is empty', async () => {
    const client = new MockMarketplaceClient([]);
    const { findByText, container } = render(<MarketplaceBrowser client={client} />);
    expect(await findByText('No recipes found')).toBeTruthy();
    // The list container is suppressed when empty.
    expect(container.querySelector('[role="list"]')).toBeNull();
  });

  describe('keyboard navigation', () => {
    it('ArrowDown advances highlight and Enter opens the preview drawer', async () => {
      const client = new MockMarketplaceClient(SAMPLE);
      const { container, findByRole } = render(<MarketplaceBrowser client={client} />);
      const list = await findByRole('list');
      // Wait for items to render then focus the list.
      await waitFor(() => {
        expect(container.querySelectorAll('[role="listitem"]').length).toBe(SAMPLE.length);
      });
      // First listing starts highlighted.
      const items = container.querySelectorAll('[role="listitem"]');
      expect(items[0]?.getAttribute('data-highlighted')).toBe('true');
      fireEvent.keyDown(list, { key: 'ArrowDown' });
      // Highlight moves to index 1.
      const itemsAfter = container.querySelectorAll('[role="listitem"]');
      expect(itemsAfter[1]?.getAttribute('data-highlighted')).toBe('true');
      fireEvent.keyDown(list, { key: 'Enter' });
      await waitFor(() => {
        expect(container.querySelector('[role="dialog"]')).toBeTruthy();
      });
      // The dialog points at the second listing.
      expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
        'Preview designer-canvas',
      );
    });

    it('ArrowUp wraps to the last listing', async () => {
      const client = new MockMarketplaceClient(SAMPLE);
      const { container, findByRole } = render(<MarketplaceBrowser client={client} />);
      const list = await findByRole('list');
      await waitFor(() => {
        expect(container.querySelectorAll('[role="listitem"]').length).toBe(SAMPLE.length);
      });
      fireEvent.keyDown(list, { key: 'ArrowUp' });
      const items = container.querySelectorAll('[role="listitem"]');
      // Wraps to last (index 2 in our 3-item sample).
      expect(items[SAMPLE.length - 1]?.getAttribute('data-highlighted')).toBe('true');
    });
  });

  describe('initialQuery', () => {
    it('seeds filter inputs from initialQuery', async () => {
      const client = new MockMarketplaceClient(SAMPLE);
      const { findByLabelText } = render(
        <MarketplaceBrowser client={client} initialQuery={{ author: 'acme', search: 'inbox' }} />,
      );
      const author = (await findByLabelText('Author')) as HTMLInputElement;
      expect(author.value).toBe('acme');
      const search = (await findByLabelText('Search')) as HTMLInputElement;
      expect(search.value).toBe('inbox');
    });
  });

  describe('MockMarketplaceClient', () => {
    it('filters by author / domain / brandKitId', async () => {
      const client = new MockMarketplaceClient(SAMPLE);
      expect((await client.list({ author: 'acme' })).length).toBe(1);
      expect((await client.list({ domain: 'design' })).length).toBe(1);
      expect((await client.list({ brandKitId: 'aurora-light' })).length).toBe(1);
    });

    it('search matches persona / description / authorDisplayName (case-insensitive)', async () => {
      const client = new MockMarketplaceClient(SAMPLE);
      expect((await client.list({ search: 'INBOX' })).length).toBe(1);
      expect((await client.list({ search: 'review' })).length).toBe(1);
      expect((await client.list({ search: 'aurora' })).length).toBe(1);
    });

    it('respects limit + offset', async () => {
      const client = new MockMarketplaceClient(SAMPLE);
      const page1 = await client.list({ limit: 2, offset: 0 });
      expect(page1.length).toBe(2);
      const page2 = await client.list({ limit: 2, offset: 2 });
      expect(page2.length).toBe(1);
    });

    it('get() returns the listing matching the canonical URI', async () => {
      const client = new MockMarketplaceClient(SAMPLE);
      const found = await client.get(addr('acme', 'founder-inbox', '1.0.0'));
      expect(found?.address.raw).toBe('atelier://acme/founder-inbox@1.0.0');
      const missing = await client.get(addr('nope', 'nope', '0.0.0'));
      expect(missing).toBeNull();
    });

    it('scorecard() returns the keyed scorecard, or undefined for unknown', async () => {
      const sc = scorecard('atelier://acme/founder-inbox@1.0.0');
      const client = new MockMarketplaceClient(SAMPLE, {
        scorecards: { 'atelier://acme/founder-inbox@1.0.0': sc },
      });
      const found = await client.scorecard(addr('acme', 'founder-inbox', '1.0.0'));
      expect(found).toEqual(sc);
      const missing = await client.scorecard(addr('aurora', 'designer-canvas', '0.4.1'));
      expect(missing).toBeUndefined();
    });
  });

  describe('review-state pill (V-6.d)', () => {
    it('renders a pill on listings whose state is NOT approved', async () => {
      const sample: MarketplaceListing[] = [
        listing('acme', 'a', '1.0.0', { reviewState: 'approved' }),
        listing('aurora', 'b', '1.0.0', { reviewState: 'pending' }),
        listing('marigold', 'c', '1.0.0', { reviewState: 'flagged' }),
        listing('marigold', 'd', '1.0.0', { reviewState: 'rejected' }),
      ];
      const client = new MockMarketplaceClient(sample);
      const { container, findAllByRole } = render(<MarketplaceBrowser client={client} />);
      await findAllByRole('listitem');
      const pills = container.querySelectorAll('[data-cir-part="marketplace-card-review-state"]');
      // approved should NOT render a pill (default state, suppressed).
      expect(pills.length).toBe(3);
      const states = Array.from(pills).map((p) => p.getAttribute('data-review-state'));
      expect(states.sort()).toEqual(['flagged', 'pending', 'rejected']);
    });

    it('does NOT render a pill when reviewState is undefined', async () => {
      const sample: MarketplaceListing[] = [listing('acme', 'a', '1.0.0')];
      const client = new MockMarketplaceClient(sample);
      const { container, findByRole } = render(<MarketplaceBrowser client={client} />);
      await findByRole('list');
      expect(container.querySelector('[data-cir-part="marketplace-card-review-state"]')).toBeNull();
    });
  });

  describe('compile-quality scorecard pill (Sprint 2.4)', () => {
    const sample: MarketplaceListing[] = [
      listing('acme', 'green-recipe', '1.0.0'),
      listing('aurora', 'amber-recipe', '1.0.0'),
      listing('marigold', 'red-recipe', '1.0.0'),
      listing('octant', 'no-scorecard-recipe', '1.0.0'),
    ];

    function clientWithScorecards(): MockMarketplaceClient {
      return new MockMarketplaceClient(sample, {
        scorecards: {
          'atelier://acme/green-recipe@1.0.0': scorecard('atelier://acme/green-recipe@1.0.0'),
          'atelier://aurora/amber-recipe@1.0.0': scorecard('atelier://aurora/amber-recipe@1.0.0', {
            snapshot_stable: false,
            cost_within_budget: false,
            cost_usd: 0.0042,
            cost_p95_usd: 0.0061,
            compile_duration_ms: 1234,
            notes: [
              {
                check: 'snapshot',
                severity: 'warning',
                message: 'manifest_shape_hash drifted vs. baseline.',
              },
              {
                check: 'cost',
                severity: 'warning',
                message: 'p95 $0.0061 exceeds budget $0.005.',
              },
            ],
          }),
          'atelier://marigold/red-recipe@1.0.0': scorecard('atelier://marigold/red-recipe@1.0.0', {
            compile_passed: false,
            schema_passed: false,
            notes: [
              {
                check: 'compile',
                severity: 'error',
                message: 'GeminiCompiler returned empty manifest.',
              },
              {
                check: 'schema',
                severity: 'error',
                message: 'ManifestSchema parse failed: missing routes[0].',
              },
            ],
          }),
          // octant intentionally absent — graceful-degradation path.
        },
      });
    }

    it('renders a pill in the right colour for each summarised status', async () => {
      const client = clientWithScorecards();
      const { container } = render(<MarketplaceBrowser client={client} />);
      await waitFor(() => {
        const pills = container.querySelectorAll(
          '[data-cir-part="marketplace-card-scorecard-pill"]',
        );
        // Three of the four listings have scorecards; the fourth (octant)
        // has none and gets no pill.
        expect(pills.length).toBe(3);
      });
      const cards = container.querySelectorAll('[data-cir-part="marketplace-card"]');
      const statuses = Array.from(cards).map((card) => {
        const pill = card.querySelector('[data-cir-part="marketplace-card-scorecard-pill"]');
        return pill?.getAttribute('data-scorecard-status') ?? null;
      });
      expect(statuses).toEqual(['green', 'amber', 'red', null]);
    });

    it('the tooltip lists the failed checks for an amber pill', async () => {
      const client = clientWithScorecards();
      const { container } = render(<MarketplaceBrowser client={client} />);
      await waitFor(() => {
        expect(
          container.querySelectorAll('[data-cir-part="marketplace-card-scorecard-pill"]').length,
        ).toBe(3);
      });
      const cards = container.querySelectorAll('[data-cir-part="marketplace-card"]');
      const amberPill = cards[1]!.querySelector(
        '[data-cir-part="marketplace-card-scorecard-pill"]',
      ) as HTMLButtonElement;
      const title = amberPill.getAttribute('title') ?? '';
      expect(title).toContain('snapshot');
      expect(title).toContain('cost');
      // Hard-failure word should not surface for an amber.
      expect(title).toContain('warnings');
    });

    it('the tooltip lists the failed checks for a red pill', async () => {
      const client = clientWithScorecards();
      const { container } = render(<MarketplaceBrowser client={client} />);
      await waitFor(() => {
        expect(
          container.querySelectorAll('[data-cir-part="marketplace-card-scorecard-pill"]').length,
        ).toBe(3);
      });
      const cards = container.querySelectorAll('[data-cir-part="marketplace-card"]');
      const redPill = cards[2]!.querySelector(
        '[data-cir-part="marketplace-card-scorecard-pill"]',
      ) as HTMLButtonElement;
      const title = redPill.getAttribute('title') ?? '';
      expect(title).toContain('compile');
      expect(title).toContain('schema');
      expect(title).toContain('failures');
    });

    it('clicking the pill expands the scorecard panel with all 5 check rows', async () => {
      const client = clientWithScorecards();
      const { container } = render(<MarketplaceBrowser client={client} />);
      await waitFor(() => {
        expect(
          container.querySelectorAll('[data-cir-part="marketplace-card-scorecard-pill"]').length,
        ).toBe(3);
      });
      const cards = container.querySelectorAll('[data-cir-part="marketplace-card"]');
      const amberPill = cards[1]!.querySelector(
        '[data-cir-part="marketplace-card-scorecard-pill"]',
      ) as HTMLButtonElement;
      // Pre-click: no expanded panel.
      expect(
        cards[1]!.querySelector('[data-cir-part="marketplace-card-scorecard-panel"]'),
      ).toBeNull();
      fireEvent.click(amberPill);
      await waitFor(() => {
        expect(
          cards[1]!.querySelector('[data-cir-part="marketplace-card-scorecard-panel"]'),
        ).toBeTruthy();
      });
      // The panel exposes one row per check (5 total).
      const rows = cards[1]!.querySelectorAll('[data-cir-part="scorecard-check-row"]');
      expect(rows.length).toBe(5);
      const checkOrder = Array.from(rows).map((r) => r.getAttribute('data-check'));
      expect(checkOrder).toEqual(['compile', 'schema', 'policy', 'snapshot', 'cost']);
      // The two failing rows (snapshot + cost) carry data-check-passed=false.
      const passedFlags = Array.from(rows).map((r) => r.getAttribute('data-check-passed'));
      expect(passedFlags).toEqual(['true', 'true', 'true', 'false', 'false']);
    });

    it('the expanded panel shows the cost line when cost_usd is present', async () => {
      const client = clientWithScorecards();
      const { container } = render(<MarketplaceBrowser client={client} />);
      await waitFor(() => {
        expect(
          container.querySelectorAll('[data-cir-part="marketplace-card-scorecard-pill"]').length,
        ).toBe(3);
      });
      const cards = container.querySelectorAll('[data-cir-part="marketplace-card"]');
      const amberPill = cards[1]!.querySelector(
        '[data-cir-part="marketplace-card-scorecard-pill"]',
      ) as HTMLButtonElement;
      fireEvent.click(amberPill);
      await waitFor(() => {
        const cost = cards[1]!.querySelector('[data-cir-part="scorecard-cost"]');
        expect(cost?.textContent ?? '').toMatch(/Compile cost:.*p95.*ms/u);
      });
    });

    it('the expanded panel hides the cost line when cost_usd is undefined (deterministic source)', async () => {
      const client = clientWithScorecards();
      const { container } = render(<MarketplaceBrowser client={client} />);
      await waitFor(() => {
        expect(
          container.querySelectorAll('[data-cir-part="marketplace-card-scorecard-pill"]').length,
        ).toBe(3);
      });
      const cards = container.querySelectorAll('[data-cir-part="marketplace-card"]');
      // The green card has no cost data — clicking expands the panel but no
      // cost line should render.
      const greenPill = cards[0]!.querySelector(
        '[data-cir-part="marketplace-card-scorecard-pill"]',
      ) as HTMLButtonElement;
      fireEvent.click(greenPill);
      await waitFor(() => {
        expect(
          cards[0]!.querySelector('[data-cir-part="marketplace-card-scorecard-panel"]'),
        ).toBeTruthy();
      });
      expect(cards[0]!.querySelector('[data-cir-part="scorecard-cost"]')).toBeNull();
    });

    it('renders no pill when the host did not wire client.scorecard', async () => {
      // A client WITHOUT a scorecard method (the V-6.c baseline shape).
      const minimal: MarketplaceClient = {
        list: () => Promise.resolve(sample.slice()),
        get: () => Promise.resolve(null),
      };
      const { container, findAllByRole } = render(<MarketplaceBrowser client={minimal} />);
      await findAllByRole('listitem');
      expect(
        container.querySelector('[data-cir-part="marketplace-card-scorecard-pill"]'),
      ).toBeNull();
    });

    it('renders no pill for a listing whose address has no scorecard (graceful degradation)', async () => {
      const client = clientWithScorecards();
      const { container } = render(<MarketplaceBrowser client={client} />);
      await waitFor(() => {
        const cards = container.querySelectorAll('[data-cir-part="marketplace-card"]');
        expect(cards.length).toBe(sample.length);
      });
      const cards = container.querySelectorAll('[data-cir-part="marketplace-card"]');
      // octant is at index 3 — its scorecard slot is empty in the mock.
      const noPill = cards[3]!.querySelector('[data-cir-part="marketplace-card-scorecard-pill"]');
      expect(noPill).toBeNull();
    });

    it('clicking a card body opens the preview drawer; clicking the pill does NOT', async () => {
      const client = clientWithScorecards();
      const { container } = render(<MarketplaceBrowser client={client} />);
      await waitFor(() => {
        expect(
          container.querySelectorAll('[data-cir-part="marketplace-card-scorecard-pill"]').length,
        ).toBe(3);
      });
      const cards = container.querySelectorAll('[data-cir-part="marketplace-card"]');
      const greenPill = cards[0]!.querySelector(
        '[data-cir-part="marketplace-card-scorecard-pill"]',
      ) as HTMLButtonElement;
      fireEvent.click(greenPill);
      // No preview drawer should have opened — only the inline panel did.
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      // And the inline panel IS open.
      expect(
        cards[0]!.querySelector('[data-cir-part="marketplace-card-scorecard-panel"]'),
      ).toBeTruthy();
    });
  });

  it('binding id matches', () => {
    expect(MarketplaceBrowserBinding.id).toBe('MarketplaceBrowser');
  });

  it('text-render returns a single-line summary', () => {
    const client = new MockMarketplaceClient([]);
    expect(marketplaceBrowserTextRender({ client })).toBe('[MarketplaceBrowser]');
    expect(marketplaceBrowserTextRender({ client, initialQuery: { search: 'inbox' } })).toBe(
      '[MarketplaceBrowser: search "inbox"]',
    );
    expect(marketplaceBrowserTextRender({ client, initialQuery: { author: 'acme' } })).toBe(
      '[MarketplaceBrowser: author acme]',
    );
  });
});

describe('MarketplaceBrowser — lifecycle hygiene', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call setState after unmount when a slow list() resolves', async () => {
    let resolveList: ((value: MarketplaceListing[]) => void) | null = null;
    const client: MarketplaceClient = {
      list: () =>
        new Promise<MarketplaceListing[]>((resolve) => {
          resolveList = resolve;
        }),
      get: () => Promise.resolve(null),
    };
    const { unmount } = render(<MarketplaceBrowser client={client} />);
    unmount();
    // Resolve after unmount; the cancellation guard inside the effect
    // means we should not see a "Can't perform a React state update on
    // an unmounted component" warning.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => {
      resolveList?.(SAMPLE);
      await Promise.resolve();
    });
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
