// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave 11 / Vis-9 — `<StatusBar>` capability binding + click-through +
 * severity-icon slot. Focused on the new surface area: the original pill
 * already exercises through the integration suites that mount Chrome (and
 * through `text-render.test.ts` which checks the audit-side adapter).
 */
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StatusBar, StatusBarBinding, statusBarTextRender } from '../src/components/StatusBar.js';
import { IconResolverProvider } from '../src/icons/context.js';
import { LiteralIconResolver } from '../src/icons/resolver.js';

const CHECK_SVG = '<svg data-name="circle-check"><path d="M0 0"/></svg>';
const ALERT_SVG = '<svg data-name="alert-triangle"><path d="M0 0"/></svg>';
const WRENCH_SVG = '<svg data-name="wrench"><path d="M0 0"/></svg>';

function renderWithIcons(node: React.ReactNode): ReturnType<typeof render> {
  const resolver = new LiteralIconResolver({
    lucide: {
      'circle-check': CHECK_SVG,
      'alert-triangle': ALERT_SVG,
      wrench: WRENCH_SVG,
    },
  });
  return render(<IconResolverProvider resolver={resolver}>{node}</IconResolverProvider>);
}

describe('StatusBar — baseline', () => {
  it('renders status + message', () => {
    render(<StatusBar status="operational" message="All systems go" />);
    const root = screen.getByRole('status');
    expect(root.getAttribute('data-status')).toBe('operational');
    expect(root.getAttribute('data-cir-component')).toBe('StatusBar');
    expect(screen.getByText('All systems go')).toBeTruthy();
  });

  it('binding id matches', () => {
    expect(StatusBarBinding.id).toBe('StatusBar');
  });
});

describe('StatusBar — capability binding (data: { source: "system.status" })', () => {
  it('reads status + message from props.data when valid', () => {
    render(
      <StatusBar
        status="operational"
        message="fallback"
        data={{ status: 'incident', message: 'API outage', detail: 'Investigating' }}
      />,
    );
    const root = screen.getByRole('status');
    expect(root.getAttribute('data-status')).toBe('incident');
    expect(root.getAttribute('data-cir-bound')).toBe('system.status');
    expect(screen.getByText('API outage')).toBeTruthy();
    expect(screen.getByText('Investigating')).toBeTruthy();
  });

  it('accepts `level` as an alias for `status`', () => {
    render(
      <StatusBar
        status="operational"
        message="fallback"
        data={{ level: 'degraded', message: 'Slow responses' }}
      />,
    );
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('degraded');
    expect(screen.getByText('Slow responses')).toBeTruthy();
  });

  it('falls through to explicit props when payload is malformed', () => {
    render(
      <StatusBar
        status="operational"
        message="explicit"
        data={{ status: 'unknown-token', message: 'noisy' }}
      />,
    );
    const root = screen.getByRole('status');
    expect(root.getAttribute('data-status')).toBe('operational');
    expect(root.getAttribute('data-cir-bound')).toBeNull();
    expect(screen.getByText('explicit')).toBeTruthy();
  });

  it('falls through to explicit props when payload is missing required fields', () => {
    render(<StatusBar status="operational" message="explicit" data={{ status: 'incident' }} />);
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('operational');
    expect(screen.getByText('explicit')).toBeTruthy();
  });

  it('treats null / non-object data as a no-op', () => {
    render(<StatusBar status="operational" message="explicit" data={null} />);
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('operational');
    expect(screen.getByRole('status').getAttribute('data-cir-bound')).toBeNull();
  });

  it('text-render adapter honours the capability binding', () => {
    expect(
      statusBarTextRender({
        status: 'operational',
        message: 'ignored',
        data: { status: 'incident', message: 'API outage' },
      }),
    ).toBe('Incident: API outage');
  });
});

describe('StatusBar — click-through', () => {
  it('wraps in an <a> when href is set', () => {
    const { container } = render(<StatusBar status="operational" message="ok" href="/status" />);
    const anchor = container.querySelector('a[data-cir-part="link"]');
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute('href')).toBe('/status');
  });

  it('fires onClick on anchor click', () => {
    const onClick = vi.fn();
    const { container } = render(
      <StatusBar status="operational" message="ok" href="/status" onClick={onClick} />,
    );
    const anchor = container.querySelector<HTMLAnchorElement>('a[data-cir-part="link"]');
    expect(anchor).toBeTruthy();
    fireEvent.click(anchor!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('preventDefault from onClick suppresses native navigation', () => {
    const onClick = vi.fn((e: React.MouseEvent) => e.preventDefault());
    const { container } = render(
      <StatusBar status="operational" message="ok" href="/status" onClick={onClick} />,
    );
    const anchor = container.querySelector<HTMLAnchorElement>('a[data-cir-part="link"]');
    const evt = fireEvent.click(anchor!);
    // happy-dom returns false from dispatchEvent when preventDefault was called.
    expect(evt).toBe(false);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a <button> when only onClick is set', () => {
    const onClick = vi.fn();
    const { container } = render(<StatusBar status="operational" message="ok" onClick={onClick} />);
    const button = container.querySelector<HTMLButtonElement>('button[data-cir-part="link"]');
    expect(button).toBeTruthy();
    fireEvent.click(button!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a <span> when neither href nor onClick is set', () => {
    const { container } = render(<StatusBar status="operational" message="ok" />);
    expect(container.querySelector('a[data-cir-part="link"]')).toBeNull();
    expect(container.querySelector('button[data-cir-part="link"]')).toBeNull();
    expect(container.querySelector('span[data-cir-part="link"]')).toBeTruthy();
  });
});

describe('StatusBar — severity-icon slot (Vis-3 IconResolver)', () => {
  it('renders circle-check for operational when resolver is wired', () => {
    const { container } = renderWithIcons(<StatusBar status="operational" message="ok" />);
    const slot = container.querySelector('[data-cir-part="icon"]');
    expect(slot?.getAttribute('data-cir-icon-source')).toBe('resolver');
    const icon = slot?.querySelector('[data-cir-component="Icon"]');
    expect(icon?.getAttribute('data-icon-set')).toBe('lucide');
    expect(icon?.getAttribute('data-icon-name')).toBe('circle-check');
  });

  it('renders alert-triangle for degraded', () => {
    const { container } = renderWithIcons(<StatusBar status="degraded" message="slow" />);
    const icon = container.querySelector('[data-cir-part="icon"] [data-cir-component="Icon"]');
    expect(icon?.getAttribute('data-icon-name')).toBe('alert-triangle');
  });

  it('renders alert-triangle for incident', () => {
    const { container } = renderWithIcons(<StatusBar status="incident" message="down" />);
    const icon = container.querySelector('[data-cir-part="icon"] [data-cir-component="Icon"]');
    expect(icon?.getAttribute('data-icon-name')).toBe('alert-triangle');
  });

  it('renders wrench for maintenance', () => {
    const { container } = renderWithIcons(<StatusBar status="maintenance" message="planned" />);
    const icon = container.querySelector('[data-cir-part="icon"] [data-cir-component="Icon"]');
    expect(icon?.getAttribute('data-icon-name')).toBe('wrench');
  });

  it('falls back to Unicode glyph when no IconResolver is in scope', () => {
    const { container } = render(<StatusBar status="operational" message="ok" />);
    const slot = container.querySelector('[data-cir-part="icon"]');
    expect(slot?.getAttribute('data-cir-icon-source')).toBe('unicode');
    expect(slot?.querySelector('[data-cir-component="Icon"]')).toBeNull();
    expect(slot?.textContent).toBe('✓');
  });

  it('falls back to Unicode glyph when the resolver does not know the icon', () => {
    // Resolver wired but missing every status icon — bar must still render.
    const empty = new LiteralIconResolver({ lucide: {} });
    const { container } = render(
      <IconResolverProvider resolver={empty}>
        <StatusBar status="operational" message="ok" />
      </IconResolverProvider>,
    );
    const slot = container.querySelector('[data-cir-part="icon"]');
    expect(slot?.getAttribute('data-cir-icon-source')).toBe('unicode');
    expect(slot?.textContent).toBe('✓');
  });
});
