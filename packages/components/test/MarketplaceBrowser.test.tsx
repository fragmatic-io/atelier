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
