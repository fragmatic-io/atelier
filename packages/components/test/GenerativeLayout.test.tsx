// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  GenerativeLayout,
  GenerativeLayoutBinding,
  generativeBlocksToBlockEditor,
  generativeLayoutTextRender,
  type GenerationRequest,
  type GenerationResult,
  type GenerativeBlock,
} from '../src/components/GenerativeLayout.js';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function makeBlocks(...ids: string[]): GenerativeBlock[] {
  return ids.map((id) => ({ id, kind: 'paragraph', content: `body of ${id}` }));
}

type GeneratorSpy = ReturnType<typeof vi.fn<(req: GenerationRequest) => Promise<GenerationResult>>>;

/**
 * Build a generator spy that resolves with the supplied result. Tests that
 * need to inspect the request shape introspect `mock.calls[i]![0]`.
 */
function makeGenerator(
  result: GenerationResult | ((req: GenerationRequest) => GenerationResult),
): GeneratorSpy {
  return vi.fn((req: GenerationRequest): Promise<GenerationResult> => {
    const resolved = typeof result === 'function' ? result(req) : result;
    return Promise.resolve(resolved);
  });
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('<GenerativeLayout>', () => {
  it('exposes a labelled prompt textarea + region role', () => {
    const generate = makeGenerator({ blocks: [] });
    render(<GenerativeLayout generate={generate} />);
    const region = screen.getByRole('region', { name: 'Generative layout' });
    expect(region).toBeTruthy();
    // The textarea has a connected label via htmlFor / id.
    const textarea = screen.getByLabelText('Prompt');
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('does not call generate on mount when autoGenerate is false', () => {
    const generate = makeGenerator({ blocks: [] });
    render(<GenerativeLayout generate={generate} initialPrompt="hello" />);
    expect(generate).not.toHaveBeenCalled();
  });

  it('auto-generates on mount when initialPrompt is supplied AND autoGenerate=true', async () => {
    const generate = makeGenerator({ blocks: makeBlocks('b1') });
    render(<GenerativeLayout generate={generate} initialPrompt="hello" autoGenerate />);
    await waitFor(() => {
      expect(generate).toHaveBeenCalledTimes(1);
    });
    expect(generate.mock.calls[0]![0]).toEqual({ prompt: 'hello' });
  });

  it('Generate button calls generator with the typed prompt and renders blocks', async () => {
    const result: GenerationResult = {
      blocks: [
        { id: 'b1', kind: 'heading', content: 'Title', level: 1 },
        { id: 'b2', kind: 'paragraph', content: 'Body' },
      ],
    };
    const generate = makeGenerator(result);
    const onChange = vi.fn();
    const onGenerated = vi.fn();
    render(<GenerativeLayout generate={generate} onChange={onChange} onGenerated={onGenerated} />);
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A pitch deck' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
      await Promise.resolve();
    });
    expect(generate).toHaveBeenCalledWith({ prompt: 'A pitch deck' });
    // Blocks rendered in DOM.
    const heading = document.querySelector('[data-cir-genblock-part="heading"]');
    expect(heading?.textContent).toBe('Title');
    const para = document.querySelector('[data-cir-genblock-part="paragraph"]');
    expect(para?.textContent).toBe('Body');
    expect(onChange).toHaveBeenCalledWith(result.blocks);
    expect(onGenerated).toHaveBeenCalledWith(result);
  });

  it('shows skeleton strip while generating; previous blocks remain visible on rejection', async () => {
    const initial: GenerativeBlock[] = makeBlocks('keep1', 'keep2');
    let reject: (e: Error) => void = () => undefined;
    const generate: GeneratorSpy = vi.fn(
      (): Promise<GenerationResult> =>
        new Promise<GenerationResult>((_, rj) => {
          reject = rj;
        }),
    );

    render(<GenerativeLayout generate={generate} initialPrompt="x" initialBlocks={initial} />);
    // Click Regenerate to enter the busy state.
    const regenBtn = screen.getByRole('button', { name: 'Regenerate' });
    fireEvent.click(regenBtn);

    // Skeleton strip is visible.
    await waitFor(() => {
      const sk = document.querySelector('[data-cir-part="generative-skeleton"]');
      expect(sk).not.toBeNull();
    });
    // Previous blocks still rendered.
    expect(document.querySelectorAll('[data-cir-genblock]').length).toBe(2);

    // Reject the in-flight request.
    await act(async () => {
      reject(new Error('boom'));
      await Promise.resolve();
    });

    // Error rendered, blocks still there.
    expect(screen.getByRole('alert').textContent).toBe('boom');
    expect(document.querySelectorAll('[data-cir-genblock]').length).toBe(2);
  });

  it('Regenerate calls with { prompt } only (no restyle/expand flags)', async () => {
    const initial = makeBlocks('a');
    const generate = makeGenerator({ blocks: makeBlocks('a2') });
    render(
      <GenerativeLayout generate={generate} initialPrompt="hello world" initialBlocks={initial} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
      await Promise.resolve();
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]![0]).toEqual({ prompt: 'hello world' });
  });

  it('Restyle calls with { prompt, restyle: true, currentBlocks }', async () => {
    const initial = makeBlocks('a', 'b');
    const generate = makeGenerator({ blocks: makeBlocks('x', 'y') });
    render(
      <GenerativeLayout generate={generate} initialPrompt="prompt-1" initialBlocks={initial} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restyle' }));
      await Promise.resolve();
    });
    const req = generate.mock.calls[0]![0];
    expect(req.prompt).toBe('prompt-1');
    expect(req.restyle).toBe(true);
    expect(req.expand).toBeUndefined();
    expect(req.currentBlocks?.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('Expand calls with { prompt, expand: true, currentBlocks } and dedupes by id', async () => {
    const initial = makeBlocks('a', 'b');
    const generate = makeGenerator({
      blocks: [
        { id: 'b', kind: 'paragraph', content: 'updated b' },
        { id: 'c', kind: 'paragraph', content: 'new c' },
      ],
    });
    render(<GenerativeLayout generate={generate} initialPrompt="p" initialBlocks={initial} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
      await Promise.resolve();
    });
    const req = generate.mock.calls[0]![0];
    expect(req.expand).toBe(true);
    expect(req.currentBlocks?.map((b) => b.id)).toEqual(['a', 'b']);
    // Result merged: a (kept), b (replaced), c (new) — in that order, no dupes.
    const ids = Array.from(document.querySelectorAll('[data-cir-genblock]')).map((el) =>
      el.getAttribute('data-block-id'),
    );
    expect(ids).toEqual(['a', 'b', 'c']);
    // The b row picked up the updated content.
    const bRow = document.querySelector('[data-cir-genblock][data-block-id="b"]');
    expect(bRow?.textContent).toContain('updated b');
  });

  it('per-block Regenerate calls with { prompt, regenerateBlockId, currentBlocks } and replaces only the matching id', async () => {
    const initial: GenerativeBlock[] = [
      { id: 'a', kind: 'paragraph', content: 'A' },
      { id: 'b', kind: 'paragraph', content: 'B' },
      { id: 'c', kind: 'paragraph', content: 'C' },
    ];
    const generate = makeGenerator({
      blocks: [{ id: 'fresh', kind: 'paragraph', content: 'FRESH' }],
    });
    render(<GenerativeLayout generate={generate} initialPrompt="p" initialBlocks={initial} />);
    const bRow = document.querySelector('[data-cir-genblock][data-block-id="b"]')!;
    const regenBtn = bRow.querySelector('[data-cir-part="generative-block-regenerate"]')!;
    await act(async () => {
      fireEvent.click(regenBtn);
      await Promise.resolve();
    });
    const req = generate.mock.calls[0]![0];
    expect(req.prompt).toBe('p');
    expect(req.regenerateBlockId).toBe('b');
    expect(req.currentBlocks?.map((bb) => bb.id)).toEqual(['a', 'b', 'c']);
    // Only b was replaced; ids stay stable (we keep the original id).
    const ids = Array.from(document.querySelectorAll('[data-cir-genblock]')).map((el) =>
      el.getAttribute('data-block-id'),
    );
    expect(ids).toEqual(['a', 'b', 'c']);
    // The b row picked up the FRESH content.
    const bRow2 = document.querySelector('[data-cir-genblock][data-block-id="b"]')!;
    expect(bRow2.textContent).toContain('FRESH');
  });

  it('per-block Delete removes the block and fires onChange', () => {
    const initial = makeBlocks('a', 'b', 'c');
    const generate = makeGenerator({ blocks: [] });
    const onChange = vi.fn();
    render(
      <GenerativeLayout
        generate={generate}
        initialPrompt="p"
        initialBlocks={initial}
        onChange={onChange}
      />,
    );
    const bRow = document.querySelector('[data-cir-genblock][data-block-id="b"]')!;
    const delBtn = bRow.querySelector('[data-cir-part="generative-block-delete"]')!;
    fireEvent.click(delBtn);
    const ids = Array.from(document.querySelectorAll('[data-cir-genblock]')).map((el) =>
      el.getAttribute('data-block-id'),
    );
    expect(ids).toEqual(['a', 'c']);
    expect(onChange).toHaveBeenCalledWith([
      { id: 'a', kind: 'paragraph', content: 'body of a' },
      { id: 'c', kind: 'paragraph', content: 'body of c' },
    ]);
  });

  it('readOnly hides Regenerate / Restyle / Expand and the per-block actions', () => {
    const initial = makeBlocks('a');
    const generate = makeGenerator({ blocks: [] });
    render(
      <GenerativeLayout generate={generate} initialPrompt="p" initialBlocks={initial} readOnly />,
    );
    expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restyle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand' })).toBeNull();
    // Per-block delete + regen also hidden.
    expect(document.querySelectorAll('[data-cir-genblock-actions]').length).toBe(0);
  });

  it('skeleton strip honours skeletonLines prop while generating', async () => {
    let resolve: (r: GenerationResult) => void = () => undefined;
    const generate: GeneratorSpy = vi.fn(
      (): Promise<GenerationResult> =>
        new Promise<GenerationResult>((rs) => {
          resolve = rs;
        }),
    );
    render(
      <GenerativeLayout generate={generate} initialPrompt="hello" autoGenerate skeletonLines={3} />,
    );
    await waitFor(() => {
      const sk = document.querySelector('[data-cir-part="generative-skeleton"]');
      expect(sk).not.toBeNull();
    });
    // Skeleton component reports a count via data-count.
    const sk = document.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(sk.getAttribute('data-count')).toBe('3');
    // Resolve to avoid an unhandled rejection on cleanup.
    await act(async () => {
      resolve({ blocks: [] });
      await Promise.resolve();
    });
  });

  it('renders all six block kinds end-to-end', async () => {
    const all: GenerativeBlock[] = [
      { id: '1', kind: 'paragraph', content: 'p' },
      { id: '2', kind: 'heading', content: 'H', level: 3 },
      { id: '3', kind: 'callout', content: 'note', tone: 'warning' },
      { id: '4', kind: 'code', content: 'x = 1', language: 'python' },
      { id: '5', kind: 'quote', content: 'q' },
      { id: '6', kind: 'divider' },
    ];
    const generate = makeGenerator({ blocks: all });
    render(<GenerativeLayout generate={generate} initialPrompt="x" autoGenerate />);
    await waitFor(() => {
      expect(document.querySelectorAll('[data-cir-genblock]').length).toBe(6);
    });
    expect(document.querySelector('[data-cir-genblock-part="heading"]')?.tagName).toBe('H3');
    expect(
      document
        .querySelector('[data-cir-genblock-part="callout"]')
        ?.getAttribute('data-cir-genblock-tone'),
    ).toBe('warning');
    expect(
      document
        .querySelector('[data-cir-genblock-part="code"]')
        ?.getAttribute('data-cir-genblock-language'),
    ).toBe('python');
    expect(document.querySelector('[data-cir-genblock-part="divider"]')).not.toBeNull();
  });

  it('surfaces the result.source label in the footer', async () => {
    const generate = makeGenerator({
      blocks: makeBlocks('a'),
      source: 'gpt-test/v1',
    });
    render(<GenerativeLayout generate={generate} initialPrompt="x" autoGenerate />);
    await waitFor(() => {
      expect(screen.getByText(/Source: gpt-test\/v1/)).toBeTruthy();
    });
  });

  it('binding registers the GenerativeLayout id', () => {
    expect(GenerativeLayoutBinding.id).toBe('GenerativeLayout');
    expect(GenerativeLayoutBinding.factory).toBe(GenerativeLayout);
    expect(GenerativeLayoutBinding.manifestContract?.allowed_props['generate']).toBe('function');
  });

  it('text-render reports prompt + block count', () => {
    expect(generativeLayoutTextRender({})).toBe('[GenerativeLayout: prompt="", 0 blocks]');
    expect(
      generativeLayoutTextRender({
        initialPrompt: 'pitch deck',
        initialBlocks: makeBlocks('a', 'b'),
      }),
    ).toBe('[GenerativeLayout: prompt="pitch deck", 2 blocks]');
  });
});

describe('generativeBlocksToBlockEditor', () => {
  it('maps every kind into BlockEditor shape and preserves ids', () => {
    const src: GenerativeBlock[] = [
      { id: 'p', kind: 'paragraph', content: 'p-body' },
      { id: 'h', kind: 'heading', content: 'h-body', level: 3 },
      { id: 'c', kind: 'callout', content: 'c-body', tone: 'danger' },
      { id: 'co', kind: 'code', content: 'x=1', language: 'python' },
      { id: 'q', kind: 'quote', content: 'q-body' },
      { id: 'd', kind: 'divider' },
    ];
    const out = generativeBlocksToBlockEditor(src) as Array<Record<string, unknown>>;
    expect(out.map((b) => b['id'])).toEqual(['p', 'h', 'c', 'co', 'q', 'd']);
    expect(out[0]).toEqual({ id: 'p', type: 'paragraph', content: 'p-body' });
    expect(out[1]).toEqual({ id: 'h', type: 'heading', content: 'h-body', meta: { level: 3 } });
    expect(out[2]).toEqual({
      id: 'c',
      type: 'callout',
      content: 'c-body',
      meta: { severity: 'danger' },
    });
    expect(out[3]).toEqual({
      id: 'co',
      type: 'code',
      content: 'x=1',
      meta: { language: 'python' },
    });
    expect(out[4]).toEqual({ id: 'q', type: 'quote', content: 'q-body' });
    expect(out[5]).toEqual({ id: 'd', type: 'divider' });
  });

  it('applies kind-specific defaults when optional fields are absent', () => {
    const src: GenerativeBlock[] = [
      { id: 'h', kind: 'heading', content: 'h' },
      { id: 'c', kind: 'callout', content: 'c' },
      { id: 'co', kind: 'code', content: 'x' },
    ];
    const out = generativeBlocksToBlockEditor(src) as Array<Record<string, unknown>>;
    expect((out[0] as { meta: { level: number } }).meta.level).toBe(2);
    expect((out[1] as { meta: { severity: string } }).meta.severity).toBe('info');
    expect((out[2] as { meta: { language: string } }).meta.language).toBe('plaintext');
  });
});
