// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import {
  InMemoryAliasOverlay,
  InMemoryKeyboardRegistry,
  InMemoryRecencyTracker,
  type KeyboardServices,
} from '@atelier/keyboard';
import { KeyboardProvider, useKeyboardAction, useKeyboardActions } from '../src/keyboard/index.js';

function makeServices(extras?: Partial<KeyboardServices>): KeyboardServices {
  return {
    registry: new InMemoryKeyboardRegistry(),
    recency: new InMemoryRecencyTracker(),
    ...extras,
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

  // ---------------------------------------------------------------------------
  // Wave 11 / Int-7 — chord shortcuts + alias overlay
  // ---------------------------------------------------------------------------

  it('chord shortcut g i fires after both keys arrive', () => {
    const services = makeServices();
    const onInvoke = vi.fn();
    render(
      <KeyboardProvider services={services} platform="mac">
        <ConsumerThatRegisters hotkey="g i" onInvoke={onInvoke} />
      </KeyboardProvider>,
    );
    fireEvent.keyDown(document, { key: 'g' });
    expect(onInvoke).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'i' });
    expect(onInvoke).toHaveBeenCalledTimes(1);
  });

  it('chord siblings g i and g a fire independently', () => {
    const services = makeServices();
    const onInbox = vi.fn();
    const onArchive = vi.fn();
    function Probe(): ReactNode {
      useKeyboardAction({ id: 'go.inbox', label: 'Inbox', hotkey: 'g i', invoke: onInbox });
      useKeyboardAction({ id: 'go.archive', label: 'Archive', hotkey: 'g a', invoke: onArchive });
      return null;
    }
    render(
      <KeyboardProvider services={services} platform="mac">
        <Probe />
      </KeyboardProvider>,
    );
    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 'i' });
    expect(onInbox).toHaveBeenCalledTimes(1);
    expect(onArchive).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 'a' });
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it('chord pending state does not consume an unrelated key as the second step', () => {
    const services = makeServices();
    const onInvoke = vi.fn();
    render(
      <KeyboardProvider services={services} platform="mac">
        <ConsumerThatRegisters hotkey="g i" onInvoke={onInvoke} />
      </KeyboardProvider>,
    );
    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 'q' });
    expect(onInvoke).not.toHaveBeenCalled();
  });

  it('escape cancels a pending chord without firing', () => {
    const services = makeServices();
    const onInvoke = vi.fn();
    render(
      <KeyboardProvider services={services} platform="mac">
        <ConsumerThatRegisters hotkey="g i" onInvoke={onInvoke} />
      </KeyboardProvider>,
    );
    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'i' });
    expect(onInvoke).not.toHaveBeenCalled();
  });

  it('typing the first chord key in a text input cancels the chord', () => {
    const services = makeServices();
    const onInvoke = vi.fn();
    render(
      <KeyboardProvider services={services} platform="mac">
        <ConsumerThatRegisters hotkey="g i" onInvoke={onInvoke} />
        <input data-testid="text" type="text" />
      </KeyboardProvider>,
    );
    // Bare-key chord should not start from inside an input.
    const input = screen.getByTestId('text');
    fireEvent.keyDown(input, { key: 'g' });
    fireEvent.keyDown(document, { key: 'i' });
    expect(onInvoke).not.toHaveBeenCalled();
  });

  it('alias overlay rebinding fires on the user-set hotkey', () => {
    const aliases = new InMemoryAliasOverlay();
    // ConsumerThatRegisters registers id='demo.action'
    aliases.set('demo.action', 'cmd+j');
    const services = makeServices({ aliases });
    const onInvoke = vi.fn();
    render(
      <KeyboardProvider services={services} platform="mac">
        <ConsumerThatRegisters hotkey="cmd+k" onInvoke={onInvoke} />
      </KeyboardProvider>,
    );
    // Original Cmd+K is shadowed.
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(onInvoke).not.toHaveBeenCalled();
    // Alias Cmd+J fires.
    fireEvent.keyDown(document, { key: 'j', metaKey: true });
    expect(onInvoke).toHaveBeenCalledTimes(1);
  });

  it('alias overlay only rebinds the targeted action', () => {
    const aliases = new InMemoryAliasOverlay();
    aliases.set('demo.action', 'cmd+j');
    const services = makeServices({ aliases });
    const onPalette = vi.fn();
    const onOther = vi.fn();
    function Probe(): ReactNode {
      useKeyboardAction({
        id: 'demo.action',
        label: 'Demo',
        hotkey: 'cmd+k',
        invoke: onPalette,
      });
      useKeyboardAction({
        id: 'other.action',
        label: 'Other',
        hotkey: 'cmd+l',
        invoke: onOther,
      });
      return null;
    }
    render(
      <KeyboardProvider services={services} platform="mac">
        <Probe />
      </KeyboardProvider>,
    );
    // Aliased
    fireEvent.keyDown(document, { key: 'j', metaKey: true });
    expect(onPalette).toHaveBeenCalledTimes(1);
    // Unaliased — declared hotkey still works
    fireEvent.keyDown(document, { key: 'l', metaKey: true });
    expect(onOther).toHaveBeenCalledTimes(1);
  });

  it('aliases are advisory: clearing restores the declared hotkey', () => {
    const aliases = new InMemoryAliasOverlay();
    aliases.set('demo.action', 'cmd+j');
    const services = makeServices({ aliases });
    const onInvoke = vi.fn();
    render(
      <KeyboardProvider services={services} platform="mac">
        <ConsumerThatRegisters hotkey="cmd+k" onInvoke={onInvoke} />
      </KeyboardProvider>,
    );
    aliases.clear('demo.action');
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(onInvoke).toHaveBeenCalledTimes(1);
  });
});
