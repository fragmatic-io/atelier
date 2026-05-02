// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import {
  InMemoryKeyboardRegistry,
  InMemoryRecencyTracker,
  type KeyboardServices,
} from '@cir/keyboard';
import { KeyboardProvider, useKeyboardAction, useKeyboardActions } from '../src/keyboard/index.js';

function makeServices(): KeyboardServices {
  return {
    registry: new InMemoryKeyboardRegistry(),
    recency: new InMemoryRecencyTracker(),
  };
}

function ConsumerThatRegisters({
  hotkey,
  onInvoke,
}: {
  hotkey: string;
  onInvoke: () => void;
}): ReactNode {
  useKeyboardAction({
    id: 'demo.action',
    label: 'Demo',
    hotkey,
    invoke: onInvoke,
  });
  return <div data-testid="consumer" />;
}

describe('<KeyboardProvider>', () => {
  it('exposes services on context — useKeyboardAction can register', () => {
    const services = makeServices();
    const onInvoke = vi.fn();
    render(
      <KeyboardProvider services={services} disableEventListener>
        <ConsumerThatRegisters hotkey="cmd+k" onInvoke={onInvoke} />
      </KeyboardProvider>,
    );
    expect(services.registry.list().length).toBe(1);
    expect(services.registry.list()[0]?.id).toBe('demo.action');
  });

  it('unregisters on unmount', () => {
    const services = makeServices();
    const { unmount } = render(
      <KeyboardProvider services={services} disableEventListener>
        <ConsumerThatRegisters hotkey="cmd+k" onInvoke={() => undefined} />
      </KeyboardProvider>,
    );
    expect(services.registry.list().length).toBe(1);
    unmount();
    expect(services.registry.list().length).toBe(0);
  });

  it('fires the action on a matching keydown', () => {
    const services = makeServices();
    const onInvoke = vi.fn();
    render(
      <KeyboardProvider services={services} platform="mac">
        <ConsumerThatRegisters hotkey="cmd+k" onInvoke={onInvoke} />
      </KeyboardProvider>,
    );
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(onInvoke).toHaveBeenCalled();
  });

  it('does NOT fire bare-key actions when typing in <input type="text">', () => {
    const services = makeServices();
    const onInvoke = vi.fn();
    render(
      <KeyboardProvider services={services} platform="mac">
        <ConsumerThatRegisters hotkey="k" onInvoke={onInvoke} />
        <input data-testid="text" type="text" />
      </KeyboardProvider>,
    );
    const input = screen.getByTestId('text');
    fireEvent.keyDown(input, { key: 'k' });
    expect(onInvoke).not.toHaveBeenCalled();
  });

  it('DOES fire modifier-bearing hotkeys even from inside <input>', () => {
    const services = makeServices();
    const onInvoke = vi.fn();
    render(
      <KeyboardProvider services={services} platform="mac">
        <ConsumerThatRegisters hotkey="cmd+k" onInvoke={onInvoke} />
        <input data-testid="text" type="text" />
      </KeyboardProvider>,
    );
    const input = screen.getByTestId('text');
    fireEvent.keyDown(input, { key: 'k', metaKey: true });
    expect(onInvoke).toHaveBeenCalled();
  });

  it('bumps recency on auto-fire', () => {
    const services = makeServices();
    render(
      <KeyboardProvider services={services} platform="mac">
        <ConsumerThatRegisters hotkey="cmd+k" onInvoke={() => undefined} />
      </KeyboardProvider>,
    );
    expect(services.recency!.weight('demo.action')).toBe(0);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(services.recency!.weight('demo.action')).toBeGreaterThan(0.99);
  });

  it('useKeyboardActions returns a stable snapshot until the registry mutates', () => {
    const services = makeServices();
    services.registry.register({ id: 'a', label: 'A', invoke: vi.fn() });
    function Probe(): ReactNode {
      const actions = useKeyboardActions();
      return <div data-testid="probe" data-count={String(actions.length)} />;
    }
    render(
      <KeyboardProvider services={services} disableEventListener>
        <Probe />
      </KeyboardProvider>,
    );
    expect(screen.getByTestId('probe').getAttribute('data-count')).toBe('1');
  });

  it('builds an in-memory services bag when no `services` prop is passed', () => {
    function Probe(): ReactNode {
      const [count, setCount] = useState(0);
      useKeyboardAction({
        id: 'noop',
        label: 'NoOp',
        invoke: () => setCount((c) => c + 1),
      });
      return <div data-testid="probe" data-count={String(count)} />;
    }
    expect(() =>
      render(
        <KeyboardProvider disableEventListener>
          <Probe />
        </KeyboardProvider>,
      ),
    ).not.toThrow();
  });

  it('platform=other uses Ctrl as the portable cmd modifier', () => {
    const services = makeServices();
    const onInvoke = vi.fn();
    render(
      <KeyboardProvider services={services} platform="other">
        <ConsumerThatRegisters hotkey="cmd+k" onInvoke={onInvoke} />
      </KeyboardProvider>,
    );
    // On non-mac, `cmd+k` should match Ctrl+K, not Meta+K.
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(onInvoke).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(onInvoke).toHaveBeenCalled();
  });

  it('disableEventListener=true prevents the document-level handler', () => {
    const services = makeServices();
    const onInvoke = vi.fn();
    render(
      <KeyboardProvider services={services} platform="mac" disableEventListener>
        <ConsumerThatRegisters hotkey="cmd+k" onInvoke={onInvoke} />
      </KeyboardProvider>,
    );
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(onInvoke).not.toHaveBeenCalled();
  });
});
