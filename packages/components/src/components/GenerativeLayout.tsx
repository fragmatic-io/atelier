// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Wave 11 / AI-3 — `<GenerativeLayout>` baseline primitive.
 *
 * Tome / Gamma / Notion-AI's "from a prompt, get a full document" surface
 * folded into a single Atelier primitive. The host wires a typed
 * `generate({ prompt, restyle?, expand?, regenerateBlockId?, currentBlocks? })`
 * function (mockable in tests; in production points at an LLM); the panel
 * owns the lifecycle — prompt input + Generate button, in-progress
 * skeleton strip, the rendered block list, and the end-user-visible
 * Regenerate / Restyle / Expand affordances (plus per-block delete +
 * regenerate).
 *
 * `<GenerativeLayout>` deliberately does NOT depend on `<BlockEditor>`.
 * Its `GenerativeBlock` type is a structural mirror of BlockEditor's
 * shape with a tighter (kind-driven) discriminated union — the same
 * pattern Cnt-10's saved-view hook uses to keep cross-component coupling
 * cheap. The exported `generativeBlocksToBlockEditor()` adapter maps the
 * generative shape onto BlockEditor's `Block[]` shape so a host that
 * wants the generated output to flow into a live editor can do so in
 * one line.
 *
 * Composition rule: `'leaf'` — content is driven by `generate` + props.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn } from './_variants.js';
import { Skeleton } from './Skeleton.js';

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

/**
 * One node in a generated layout. Mirrors `<BlockEditor>`'s `Block`
 * shape but with a tighter, discriminated union keyed on `kind` so the
 * generator + renderer get exhaustiveness checking out of the box.
 */
export type GenerativeBlock =
  | { id: string; kind: 'paragraph'; content: string }
  | { id: string; kind: 'heading'; content: string; level?: 1 | 2 | 3 }
  | {
      id: string;
      kind: 'callout';
      content: string;
      tone?: 'info' | 'success' | 'warning' | 'danger';
    }
  | { id: string; kind: 'code'; content: string; language?: string }
  | { id: string; kind: 'quote'; content: string }
  | { id: string; kind: 'divider' };

export interface GenerationRequest {
  prompt: string;
  /** When true, regenerate ALL blocks but with a different style. */
  restyle?: boolean;
  /** When true, ADD more blocks to the current set. */
  expand?: boolean;
  /** When set, only regenerate this single block. */
  regenerateBlockId?: string;
  /** Current document state — supplied for restyle/expand/per-block. */
  currentBlocks?: GenerativeBlock[];
}

export interface GenerationResult {
  blocks: GenerativeBlock[];
  /** Optional model / source label, surfaced in the output footer. */
  source?: string;
  /** Optional regen tokens — model output that lets a host wire 'continue'. */
  continuationToken?: string;
}

export type GenerativeFn = (req: GenerationRequest) => Promise<GenerationResult>;

export interface GenerativeLayoutProps {
  /** Initial prompt; if supplied AND `autoGenerate=true`, generates on mount. */
  initialPrompt?: string;
  /** Auto-generate on mount when `initialPrompt` is supplied. Default false. */
  autoGenerate?: boolean;
  /** Host-supplied generator. Required (no default — host wires the LLM). */
  generate: GenerativeFn;
  /** Initial blocks (e.g. from a saved doc) — bypasses initial generation. */
  initialBlocks?: GenerativeBlock[];
  /** Called whenever the rendered block list changes. */
  onChange?: (blocks: GenerativeBlock[]) => void;
  /** Called when generation completes with the source / token if any. */
  onGenerated?: (result: GenerationResult) => void;
  /** Skeleton lines to show while generating. Default 6. */
  skeletonLines?: number;
  /** Disable Regenerate / Restyle / Expand affordances. Default false. */
  readOnly?: boolean;
  className?: string;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Merge `incoming` blocks into `current` for the `expand` op — preserves
 * existing block order and dedupes by id (incoming wins on duplicate).
 */
function mergeExpand(current: GenerativeBlock[], incoming: GenerativeBlock[]): GenerativeBlock[] {
  const seen = new Set<string>();
  const out: GenerativeBlock[] = [];
  for (const b of current) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    // If incoming has a block with the same id, prefer the new shape.
    const replacement = incoming.find((i) => i.id === b.id);
    out.push(replacement ?? b);
  }
  for (const b of incoming) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(b);
  }
  return out;
}

/**
 * Replace a single block by id with the first block of the incoming set.
 * If no replacement is found we leave the block alone so a misbehaving
 * generator can't silently drop content.
 */
function replaceById(
  current: GenerativeBlock[],
  id: string,
  incoming: GenerativeBlock[],
): GenerativeBlock[] {
  const idx = current.findIndex((b) => b.id === id);
  if (idx < 0 || incoming.length === 0) return current;
  const replacement = incoming[0]!;
  // Keep the original id stable so React keys stay coherent — the
  // generator's choice of id for a per-block regen is informational.
  const next = [...current];
  next[idx] = { ...replacement, id };
  return next;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Generation failed';
}

// -----------------------------------------------------------------------------
// Per-block render switch — minimal styling, host CSS picks up the rest via
// `data-cir-genblock-*` attributes.
// -----------------------------------------------------------------------------

const CALLOUT_TONE_BG: Readonly<Record<string, string>> = Object.freeze({
  info: 'rgba(59,130,246,0.08)',
  success: 'rgba(34,197,94,0.08)',
  warning: 'rgba(234,179,8,0.10)',
  danger: 'rgba(239,68,68,0.10)',
});

function renderBlockBody(block: GenerativeBlock): ReactNode {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p data-cir-genblock-part="paragraph" style={{ margin: 0 }}>
          {block.content}
        </p>
      );
    case 'heading': {
      const level = block.level ?? 2;
      const Tag = `h${String(level)}` as 'h1' | 'h2' | 'h3';
      return (
        <Tag data-cir-genblock-part="heading" data-cir-genblock-level={level} style={{ margin: 0 }}>
          {block.content}
        </Tag>
      );
    }
    case 'callout': {
      const tone = block.tone ?? 'info';
      return (
        <aside
          data-cir-genblock-part="callout"
          data-cir-genblock-tone={tone}
          role="note"
          style={{
            borderLeft: '3px solid currentColor',
            padding: '8px 12px',
            background: CALLOUT_TONE_BG[tone] ?? CALLOUT_TONE_BG['info'],
            borderRadius: 4,
          }}
        >
          {block.content}
        </aside>
      );
    }
    case 'code': {
      const language = block.language ?? 'plaintext';
      return (
        <pre
          data-cir-genblock-part="code"
          data-cir-genblock-language={language}
          style={{
            margin: 0,
            padding: 8,
            background: 'rgba(0,0,0,0.04)',
            borderRadius: 4,
            fontFamily: 'ui-monospace, monospace',
            fontSize: 13,
            overflow: 'auto',
          }}
        >
          <code>{block.content}</code>
        </pre>
      );
    }
    case 'quote':
      return (
        <blockquote
          data-cir-genblock-part="quote"
          style={{
            margin: 0,
            padding: '4px 12px',
            borderLeft: '3px solid rgba(0,0,0,0.3)',
            fontStyle: 'italic',
          }}
        >
          {block.content}
        </blockquote>
      );
    case 'divider':
      return (
        <hr
          data-cir-genblock-part="divider"
          style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.15)', margin: '8px 0' }}
        />
      );
    default: {
      // Exhaustive guard — TS will fire if a new kind is added without a case.
      const _never: never = block;
      return _never;
    }
  }
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const HOVER_BUTTON_STYLE: CSSProperties = {
  border: '0',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
  padding: '2px 6px',
  borderRadius: 4,
};

export function GenerativeLayout({
  initialPrompt = '',
  autoGenerate = false,
  generate,
  initialBlocks,
  onChange,
  onGenerated,
  skeletonLines = 6,
  readOnly = false,
  className,
}: GenerativeLayoutProps): ReactElement {
  const promptId = useId();
  const [prompt, setPrompt] = useState<string>(initialPrompt);
  const [committedPrompt, setCommittedPrompt] = useState<string>(
    initialBlocks !== undefined ? initialPrompt : '',
  );
  const [blocks, setBlocks] = useState<GenerativeBlock[]>(initialBlocks ?? []);
  const [source, setSource] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const autoFiredRef = useRef<boolean>(false);

  // We thread `onChange` through a ref so the run-once auto-generate effect
  // does not need it in its dep list (the effect deliberately fires once).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onGeneratedRef = useRef(onGenerated);
  onGeneratedRef.current = onGenerated;

  const updateBlocks = useCallback((next: GenerativeBlock[]): void => {
    setBlocks(next);
    onChangeRef.current?.(next);
  }, []);

  const runGenerate = useCallback(
    async (req: GenerationRequest, mode: 'replace' | 'expand' | 'replace-one'): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        const result = await generate(req);
        const incoming = result.blocks;
        let next: GenerativeBlock[];
        if (mode === 'expand') {
          next = mergeExpand(req.currentBlocks ?? blocks, incoming);
        } else if (mode === 'replace-one' && req.regenerateBlockId !== undefined) {
          next = replaceById(req.currentBlocks ?? blocks, req.regenerateBlockId, incoming);
        } else {
          next = incoming;
        }
        setSource(result.source);
        updateBlocks(next);
        onGeneratedRef.current?.(result);
        setCommittedPrompt(req.prompt);
      } catch (err) {
        // Non-destructive: keep the previous blocks visible, surface the
        // error in the footer, and re-enable the prompt input.
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [generate, blocks, updateBlocks],
  );

  // Auto-generate on mount when `initialPrompt` is supplied AND
  // `autoGenerate=true` AND no `initialBlocks` were provided. Fires once.
  // We thread `runGenerate` through a ref so this effect's deps stay
  // gated on the props that drive the first fire (without it the
  // run-once invariant would couple to closure identity churn).
  const runGenerateRef = useRef(runGenerate);
  runGenerateRef.current = runGenerate;
  useEffect(() => {
    if (autoFiredRef.current) return;
    if (!autoGenerate) return;
    if (initialBlocks !== undefined) return;
    if (initialPrompt.trim() === '') return;
    autoFiredRef.current = true;
    void runGenerateRef.current({ prompt: initialPrompt }, 'replace');
  }, [autoGenerate, initialPrompt, initialBlocks]);

  // -- User-driven actions --------------------------------------------------

  const onSubmitPrompt = useCallback((): void => {
    const trimmed = prompt.trim();
    if (trimmed === '') return;
    void runGenerate({ prompt: trimmed }, 'replace');
  }, [prompt, runGenerate]);

  const onRegenerate = useCallback((): void => {
    if (committedPrompt === '') return;
    void runGenerate({ prompt: committedPrompt }, 'replace');
  }, [committedPrompt, runGenerate]);

  const onRestyle = useCallback((): void => {
    if (committedPrompt === '') return;
    void runGenerate({ prompt: committedPrompt, restyle: true, currentBlocks: blocks }, 'replace');
  }, [committedPrompt, blocks, runGenerate]);

  const onExpand = useCallback((): void => {
    if (committedPrompt === '') return;
    void runGenerate({ prompt: committedPrompt, expand: true, currentBlocks: blocks }, 'expand');
  }, [committedPrompt, blocks, runGenerate]);

  const onRegenerateBlock = useCallback(
    (id: string): void => {
      if (committedPrompt === '') return;
      void runGenerate(
        { prompt: committedPrompt, regenerateBlockId: id, currentBlocks: blocks },
        'replace-one',
      );
    },
    [committedPrompt, blocks, runGenerate],
  );

  const onDeleteBlock = useCallback(
    (id: string): void => {
      const next = blocks.filter((b) => b.id !== id);
      updateBlocks(next);
    },
    [blocks, updateBlocks],
  );

  // -- Render ---------------------------------------------------------------

  const showFooterActions = !readOnly && committedPrompt !== '' && blocks.length > 0;
  const skeletonCount = Math.max(1, Math.floor(skeletonLines));

  return (
    <section
      data-cir-component="GenerativeLayout"
      data-busy={busy ? 'true' : 'false'}
      role="region"
      aria-label="Generative layout"
      className={cn(className)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 12,
        border: '1px solid rgba(0,0,0,0.1)',
        borderRadius: 8,
      }}
    >
      <div
        data-cir-part="generative-prompt"
        style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        <label
          htmlFor={promptId}
          data-cir-part="generative-prompt-label"
          style={{ fontSize: 12, opacity: 0.7 }}
        >
          Prompt
        </label>
        <textarea
          id={promptId}
          data-cir-part="generative-prompt-input"
          value={prompt}
          disabled={busy}
          onChange={(e) => {
            setPrompt(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            // Cmd/Ctrl + Enter submits — common chat-input affordance.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              onSubmitPrompt();
            }
          }}
          rows={3}
          placeholder="Describe what you want to generate…"
          style={{
            width: '100%',
            padding: 8,
            border: '1px solid rgba(0,0,0,0.15)',
            borderRadius: 4,
            font: 'inherit',
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-cir-part="generative-generate"
            disabled={busy || prompt.trim() === ''}
            onClick={onSubmitPrompt}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              border: '1px solid rgba(0,0,0,0.15)',
              background: 'rgba(0,0,0,0.04)',
              cursor: busy || prompt.trim() === '' ? 'not-allowed' : 'pointer',
              font: 'inherit',
            }}
          >
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      <div
        data-cir-part="generative-body"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {busy ? (
          <div data-cir-part="generative-skeleton">
            <Skeleton shape="line" count={skeletonCount} />
          </div>
        ) : null}
        {blocks.map((block) => (
          <GenerativeBlockRow
            key={block.id}
            block={block}
            readOnly={readOnly}
            canRegenerate={committedPrompt !== ''}
            onDelete={() => {
              onDeleteBlock(block.id);
            }}
            onRegenerate={() => {
              onRegenerateBlock(block.id);
            }}
          />
        ))}
      </div>

      <div
        data-cir-part="generative-footer"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          paddingTop: 8,
          borderTop: '1px solid rgba(0,0,0,0.08)',
          fontSize: 12,
        }}
      >
        <div data-cir-part="generative-meta" style={{ opacity: 0.7 }}>
          {error !== null ? (
            <span data-cir-part="generative-error" role="alert" style={{ color: '#b91c1c' }}>
              {error}
            </span>
          ) : source !== undefined ? (
            <span data-cir-part="generative-source">Source: {source}</span>
          ) : null}
        </div>
        {showFooterActions ? (
          <div data-cir-part="generative-actions" style={{ display: 'inline-flex', gap: 4 }}>
            <button
              type="button"
              data-cir-part="generative-regenerate"
              disabled={busy}
              onClick={onRegenerate}
              style={{ ...HOVER_BUTTON_STYLE, border: '1px solid rgba(0,0,0,0.15)' }}
            >
              Regenerate
            </button>
            <button
              type="button"
              data-cir-part="generative-restyle"
              disabled={busy}
              onClick={onRestyle}
              style={{ ...HOVER_BUTTON_STYLE, border: '1px solid rgba(0,0,0,0.15)' }}
            >
              Restyle
            </button>
            <button
              type="button"
              data-cir-part="generative-expand"
              disabled={busy}
              onClick={onExpand}
              style={{ ...HOVER_BUTTON_STYLE, border: '1px solid rgba(0,0,0,0.15)' }}
            >
              Expand
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

GenerativeLayout.displayName = 'GenerativeLayout';

// -----------------------------------------------------------------------------
// Per-block row — renders the block body + a tiny inline action group on
// hover. We keep the action affordances always-rendered (CSS-driven hover
// in real-world hosts) so jsdom-level tests can target them by role.
// -----------------------------------------------------------------------------

interface GenerativeBlockRowProps {
  block: GenerativeBlock;
  readOnly: boolean;
  canRegenerate: boolean;
  onDelete: () => void;
  onRegenerate: () => void;
}

function GenerativeBlockRow({
  block,
  readOnly,
  canRegenerate,
  onDelete,
  onRegenerate,
}: GenerativeBlockRowProps): ReactElement {
  return (
    <div
      data-cir-genblock
      data-cir-genblock-kind={block.kind}
      data-block-id={block.id}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}
    >
      <div data-cir-genblock-body style={{ flex: 1, minWidth: 0 }}>
        {renderBlockBody(block)}
      </div>
      {readOnly ? null : (
        <div
          data-cir-genblock-actions
          style={{
            display: 'inline-flex',
            gap: 4,
            opacity: 0.7,
            flex: '0 0 auto',
          }}
        >
          {canRegenerate ? (
            <button
              type="button"
              data-cir-part="generative-block-regenerate"
              aria-label={`Regenerate this block`}
              onClick={onRegenerate}
              style={HOVER_BUTTON_STYLE}
            >
              Regenerate this block
            </button>
          ) : null}
          <button
            type="button"
            data-cir-part="generative-block-delete"
            aria-label={`Delete block`}
            onClick={onDelete}
            style={HOVER_BUTTON_STYLE}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Adapter — generative shape → BlockEditor `Block[]` shape. Keeps `id` and
// content stable; `kind` becomes `type`; the per-kind extras (`level`,
// `tone`, `language`) move into `meta`. Returns `unknown[]` so the
// public surface stays free of a structural import from BlockEditor (the
// host casts on the way in via `as Block[]`).
// -----------------------------------------------------------------------------

export function generativeBlocksToBlockEditor(blocks: GenerativeBlock[]): unknown[] {
  return blocks.map((b): Record<string, unknown> => {
    switch (b.kind) {
      case 'paragraph':
        return { id: b.id, type: 'paragraph', content: b.content };
      case 'heading':
        return {
          id: b.id,
          type: 'heading',
          content: b.content,
          meta: { level: b.level ?? 2 },
        };
      case 'callout': {
        const tone = b.tone ?? 'info';
        // BlockEditor uses `severity`; the generative shape uses `tone`.
        // The tones map 1:1 so we forward verbatim.
        return {
          id: b.id,
          type: 'callout',
          content: b.content,
          meta: { severity: tone },
        };
      }
      case 'code':
        return {
          id: b.id,
          type: 'code',
          content: b.content,
          meta: { language: b.language ?? 'plaintext' },
        };
      case 'quote':
        return { id: b.id, type: 'quote', content: b.content };
      case 'divider':
        return { id: b.id, type: 'divider' };
      default: {
        // Exhaustive guard — TS will fire if a new kind is added without a case.
        const _never: never = b;
        return _never;
      }
    }
  });
}

// -----------------------------------------------------------------------------
// Text-render — single-line summary of the layout's current state.
// -----------------------------------------------------------------------------

export function generativeLayoutTextRender(
  props: Pick<GenerativeLayoutProps, 'initialPrompt' | 'initialBlocks'>,
): string {
  const promptPart =
    props.initialPrompt !== undefined && props.initialPrompt !== ''
      ? `prompt="${props.initialPrompt}"`
      : 'prompt=""';
  const count = props.initialBlocks?.length ?? 0;
  return `[GenerativeLayout: ${promptPart}, ${String(count)} blocks]`;
}

// -----------------------------------------------------------------------------
// Binding
// -----------------------------------------------------------------------------

export const GenerativeLayoutBinding: ComponentBinding = {
  id: 'GenerativeLayout',
  factory: GenerativeLayout as ComponentBinding['factory'],
  manifestContract: {
    description:
      'Tome / Gamma / Notion-AI-style generative layout panel. Takes a host-supplied ' +
      '`generate({ prompt, restyle?, expand?, regenerateBlockId?, currentBlocks? })` ' +
      'function and renders the resulting `GenerativeBlock[]` (paragraph / heading / ' +
      'callout / code / quote / divider) inline. End-user-visible affordances: ' +
      'Regenerate / Restyle / Expand on the whole document; Regenerate-this-block + ' +
      'Delete on each block. Skeleton strip while generating.',
    allowed_props: {
      initialPrompt: 'string',
      autoGenerate: 'boolean',
      // Host-supplied generator (typed as `GenerativeFn`).
      generate: 'function',
      // `initialBlocks` is an array of `GenerativeBlock`.
      initialBlocks: 'array',
      skeletonLines: 'number',
      readOnly: 'boolean',
      className: 'string',
    },
  },
};
