// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Integration tests for the Wave 11 / Vis-3 `icon` prop on Button, Alert,
 * EmptyState, MetaBadge — verifies the components correctly resolve a
 * bare-string `icon="archive"` against a host-provided `LucideIconResolver`,
 * fall back gracefully when the resolver doesn't know the name, and
 * preserve the pre-Vis-3 behaviour when `icon` is omitted.
 */
import '../setup.js';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Button } from '../../src/components/Button.js';
import { Alert } from '../../src/components/Alert.js';
import { EmptyState } from '../../src/components/EmptyState.js';
import { MetaBadge } from '../../src/components/MetaBadge.js';
import { IconResolverProvider } from '../../src/icons/context.js';
import { LucideIconResolver } from '../../src/icons/lucide-resolver.js';

function withResolver(node: ReactNode, warn?: (m: string) => void): ReturnType<typeof render> {
  const resolver = warn !== undefined ? new LucideIconResolver({ warn }) : new LucideIconResolver();
  return render(<IconResolverProvider resolver={resolver}>{node}</IconResolverProvider>);
}

describe('Button icon prop', () => {
  it('renders a resolved lucide SVG for a bare-string icon name', () => {
    const { container } = withResolver(<Button icon="archive">Archive</Button>);
    const iconSpan = container.querySelector('[data-cir-component="Icon"]');
    expect(iconSpan).toBeTruthy();
    expect(iconSpan?.getAttribute('data-icon-set')).toBe('lucide');
    expect(iconSpan?.getAttribute('data-icon-name')).toBe('archive');
    expect(iconSpan?.querySelector('svg')).toBeTruthy();
    expect(iconSpan?.getAttribute('data-icon-missing')).toBeNull();
  });

  it('still accepts the legacy `{ set, name }` object form', () => {
    const { container } = withResolver(
      <Button icon={{ set: 'lucide', name: 'inbox' }}>Inbox</Button>,
    );
    const iconSpan = container.querySelector('[data-cir-component="Icon"]');
    expect(iconSpan?.getAttribute('data-icon-name')).toBe('inbox');
    expect(iconSpan?.querySelector('svg')).toBeTruthy();
  });

  it('renders a layout-stable placeholder for an unknown icon name (no crash)', () => {
    const warn = vi.fn();
    const { container } = withResolver(<Button icon="this-icon-does-not-exist">x</Button>, warn);
    const iconSpan = container.querySelector('[data-cir-component="Icon"]');
    expect(iconSpan?.getAttribute('data-icon-missing')).toBe('true');
    expect(iconSpan?.querySelector('svg')).toBeNull();
    // Resolver warned (once) about the unknown name.
    expect(warn).toHaveBeenCalled();
  });

  it('omitting the `icon` prop renders the button without any Icon (back-compat)', () => {
    const { container } = withResolver(<Button>Plain</Button>);
    expect(container.querySelector('[data-cir-component="Icon"]')).toBeNull();
    expect(container.querySelector('button')?.textContent).toBe('Plain');
  });

  it('sizes the icon according to the button size (lg → 16px)', () => {
    const { container } = withResolver(
      <Button icon="archive" size="lg">
        x
      </Button>,
    );
    const iconSpan = container.querySelector<HTMLElement>('[data-cir-component="Icon"]');
    // BUTTON_ICON_SIZE['lg'] = iconSizePx.md = 16
    expect(iconSpan?.style.width).toBe('16px');
  });
});

describe('Alert icon prop', () => {
  it('auto-derives `info` icon from severity=info when icon is omitted', () => {
    const { container } = withResolver(<Alert severity="info">heads up</Alert>);
    const iconSpan = container.querySelector('[data-cir-component="Icon"]');
    expect(iconSpan).toBeTruthy();
    expect(iconSpan?.getAttribute('data-icon-name')).toBe('info');
  });

  it('auto-derives `circle-check` icon from severity=success', () => {
    const { container } = withResolver(<Alert severity="success">done</Alert>);
    const iconSpan = container.querySelector('[data-cir-component="Icon"]');
    expect(iconSpan?.getAttribute('data-icon-name')).toBe('circle-check');
  });

  it('auto-derives `alert-triangle` icon from severity=warning AND severity=error', () => {
    const { container, rerender } = withResolver(<Alert severity="warning">x</Alert>);
    expect(
      container.querySelector('[data-cir-component="Icon"]')?.getAttribute('data-icon-name'),
    ).toBe('alert-triangle');
    rerender(
      <IconResolverProvider resolver={new LucideIconResolver()}>
        <Alert severity="error">x</Alert>
      </IconResolverProvider>,
    );
    expect(
      container.querySelector('[data-cir-component="Icon"]')?.getAttribute('data-icon-name'),
    ).toBe('alert-triangle');
  });

  it('explicit `icon` overrides the severity default', () => {
    const { container } = withResolver(
      <Alert severity="warning" icon="bell">
        x
      </Alert>,
    );
    const iconSpan = container.querySelector('[data-cir-component="Icon"]');
    expect(iconSpan?.getAttribute('data-icon-name')).toBe('bell');
  });

  it('icon={null} opts out of the severity default', () => {
    const { container } = withResolver(
      <Alert severity="warning" icon={null}>
        x
      </Alert>,
    );
    expect(container.querySelector('[data-cir-component="Icon"]')).toBeNull();
  });
});

describe('EmptyState icon prop', () => {
  it('renders the resolved SVG when `icon` is a bare string', () => {
    const { container } = withResolver(<EmptyState title="Inbox is clear" icon="inbox" />);
    const iconSpan = container.querySelector('[data-cir-component="Icon"]');
    expect(iconSpan).toBeTruthy();
    expect(iconSpan?.getAttribute('data-icon-name')).toBe('inbox');
    expect(iconSpan?.querySelector('svg')).toBeTruthy();
    // Mounted inside the empty-icon wrapper above the title.
    const wrapper = container.querySelector('[data-cir-part="empty-icon"]');
    expect(wrapper?.contains(iconSpan)).toBe(true);
  });

  it('omitting the `icon` prop renders the empty state without any Icon (back-compat)', () => {
    const { container } = withResolver(<EmptyState title="t" />);
    expect(container.querySelector('[data-cir-component="Icon"]')).toBeNull();
    expect(container.querySelector('[data-cir-part="empty-icon"]')).toBeNull();
  });

  it('uses the xl icon size (24px) — empty-state icons are the hero element', () => {
    const { container } = withResolver(<EmptyState title="t" icon="inbox" />);
    const iconSpan = container.querySelector<HTMLElement>('[data-cir-component="Icon"]');
    expect(iconSpan?.style.width).toBe('24px');
  });
});

describe('MetaBadge icon prop', () => {
  it('renders a resolved lucide SVG before the dot/content', () => {
    const { container } = withResolver(
      <MetaBadge icon="circle-dot" label="online" variant="live" />,
    );
    const iconSpan = container.querySelector('[data-cir-component="Icon"]');
    expect(iconSpan).toBeTruthy();
    expect(iconSpan?.getAttribute('data-icon-name')).toBe('circle-dot');
    // Sized at xs (12px) for badge density.
    expect((iconSpan as HTMLElement | null)?.style.width).toBe('12px');
    // Slim stroke (1.5).
    expect((iconSpan as HTMLElement | null)?.style.strokeWidth).toBe('1.5');
  });

  it('renders the badge when only `icon` is supplied (icon-only chip)', () => {
    const { container } = withResolver(<MetaBadge icon="bell" />);
    expect(container.querySelector('[data-cir-component="MetaBadge"]')).toBeTruthy();
    expect(container.querySelector('[data-cir-component="Icon"]')).toBeTruthy();
  });

  it('omitting the `icon` prop renders the MetaBadge without any Icon (back-compat)', () => {
    const { container } = withResolver(<MetaBadge label="API" />);
    expect(container.querySelector('[data-cir-component="MetaBadge"]')).toBeTruthy();
    expect(container.querySelector('[data-cir-component="Icon"]')).toBeNull();
  });

  it('returns null when neither label/count, dot, NOR icon is set (preserved)', () => {
    const { container } = withResolver(<MetaBadge />);
    expect(container.querySelector('[data-cir-component="MetaBadge"]')).toBeNull();
  });
});

describe('cross-component graceful fallback (no resolver in scope)', () => {
  it('Button + Alert + EmptyState + MetaBadge all render placeholder spans (no crash)', () => {
    // No IconResolverProvider — falls back to NoopIconResolver.
    const { container } = render(
      <>
        <Button icon="archive">x</Button>
        <Alert severity="info" />
        <EmptyState title="t" icon="inbox" />
        <MetaBadge icon="bell" />
      </>,
    );
    const placeholders = container.querySelectorAll('[data-icon-missing="true"]');
    // Button + Alert (severity default) + EmptyState + MetaBadge = 4
    expect(placeholders.length).toBe(4);
    // None of the parents crashed.
    expect(container.querySelector('button')).toBeTruthy();
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    expect(container.querySelector('[data-cir-component="MetaBadge"]')).toBeTruthy();
  });
});
