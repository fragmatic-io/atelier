// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `<BlockEditor>` — Wave 11 / Cnt-7.
 *
 * Notion / Coda / Tana / Linear's docs surface — a document built from typed
 * blocks. Each block renders through a kind-specific primitive (paragraph →
 * `<RichText>`, code → `<CodeBlock>`, …), and the editor weaves keyboard
 * navigation + structural mutation around them.
 *
 * Bounded scope (8 baseline block types):
 *   - `paragraph` — a `<RichText>`-style line of editable prose.
 *   - `heading`   — `h1` / `h2` / `h3` from `meta.level`. Defaults to `h2`.
 *   - `callout`   — bordered tinted box (`<Alert>`-style severity variant).
 *   - `toggle`    — collapsible `<details>` whose `children[]` are nested blocks.
 *   - `code`      — `<CodeBlock>` (sources `meta.language` for the language pill).
 *   - `embed`     — placeholder iframe-style frame (URL via `meta.url`).
 *   - `quote`     — left-border styled blockquote.
 *   - `divider`   — horizontal rule (no content; meta-less).
 *
 * Editing model — minimal but real. We keep the editor structurally simple by
 * leaning on a single uncontrolled `contentEditable` per text-bearing block
 * and a top-level reducer over `Block[]`. The host controls `blocks` and
 * receives `onChange(next)` whenever the user mutates the structure.
 *
 * Keyboard contract:
 *   - `/`         — opens `<BlockMenu>` anchored at the active block. Picking
 *                   a kind inserts a fresh block of that kind below.
 *   - Enter       — at the END of an empty / non-empty paragraph creates a new
 *                   empty paragraph below and moves focus to it.
 *   - Backspace   — at the START of an empty block, deletes that block. The
 *                   browser's default backspace handles in-prose deletion.
 *   - ArrowUp /   — moves focus across blocks. Walks the DOM-order list of
 *     ArrowDown    `data-cir-block` containers; the host editor's caret
 *                  lands at the first / last position of the target block.
 *
 * Drag-and-drop reorder uses the **HTML5 drag API** — no `react-dnd` (the
 * spec gut-checks "no react-dnd dep"). Each block emits a `[draggable]`
 * handle when the editor's `draggable` prop is set; the handle's
 * `dragstart` writes the block id into `dataTransfer.setData('text/plain', id)`,
 * the row's `dragover` calls `preventDefault()` to opt into being a drop
 * target, and `drop` reorders the blocks array via `onChange`.
 *
 * Slash-command flow — when the user types `/` while focused inside a block,
 * we:
 *  1. Stop the keystroke from inserting the literal slash (paragraph-only;
 *     other blocks pass through so e.g. code can include `/`).
 *  2. Open `<BlockMenu>` with the active block id threaded through as
 *     `position`.
 *  3. On insert, push a fresh block of the picked kind below the active one.
 *
 * We *do not* try to wire up a full block editor (caret-aware splitting,
 * markdown-shortcuts, multi-block selection, undo). Those land later as
 * follow-ups; AI-1 ("Ask AI" on selection) is the next gate.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { CodeBlock } from './CodeBlock.js';
import { BlockMenu } from './BlockMenu.js';
import {
  InMemoryBlockKindRegistry,
  type BlockInsertContext,
  type BlockKind,
  type BlockKindRegistry,
} from '../blocks/registry.js';
import { cn, layoutVariantClass, type LayoutVariant } from './_variants.js';

/** The 8 baseline block types Cnt-7 ships. */
export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'callout'
  | 'toggle'
  | 'code'
  | 'embed'
  | 'quote'
  | 'divider';

/**
 * One node in the document tree. `content` carries the text payload (HTML for
 * paragraph / heading / quote / callout / toggle; raw source for code; URL
 * for embed). `children` is reserved for the toggle block, which nests other
 * blocks. `meta` carries kind-specific configuration (heading level, code
 * language, callout severity, …).
 */
export interface Block {
  id: string;
  type: BlockType;
  content?: string;
  children?: readonly Block[];
  meta?: Readonly<Record<string, unknown>>;
}

export type BlockEditorVariant = LayoutVariant;

export interface BlockEditorProps {
  blocks: readonly Block[];
  onChange: (blocks: readonly Block[]) => void;
  /**
   * Typed block-kinds registry from Cnt-6. When omitted, an internal
   * `InMemoryBlockKindRegistry` populated with the 8 baseline kinds is used,
   * so the editor works out-of-the-box with no host wiring.
   */
  kindRegistry?: BlockKindRegistry;
  /** Surface fed to `<BlockMenu>` (default `'doc'`). */
  surface?: string;
  /** Trigger character for the slash menu (default `'/'`). */
  slashTrigger?: string;
  /** Whether to render drag handles + accept HTML5 drop reorders. */
  draggable?: boolean;
  variant?: BlockEditorVariant;
  className?: string;
  /** Optional ARIA label override; defaults to `'Document'`. */
  ariaLabel?: string;
}

// -----------------------------------------------------------------------------
// Defaults — the 8 baseline kinds. The keys map 1:1 onto `BlockType`. The
// registry the editor builds when no host registry is supplied registers each
// kind with `id: 'baseline.<type>'` so the slash menu's data-cir-kind reflects
// the canonical baseline namespace.
// -----------------------------------------------------------------------------

const BASELINE_KIND_LABELS: Readonly<Record<BlockType, string>> = Object.freeze({
  paragraph: 'Paragraph',
  heading: 'Heading',
  callout: 'Callout',
  toggle: 'Toggle',
  code: 'Code',
  embed: 'Embed',
  quote: 'Quote',
  divider: 'Divider',
});

const BASELINE_KIND_DESCRIPTIONS: Readonly<Record<BlockType, string>> = Object.freeze({
  paragraph: 'Plain text body',
  heading: 'Section title (h1 / h2 / h3)',
  callout: 'Bordered, tinted notice block',
  toggle: 'Collapsible block with nested children',
  code: 'Syntax-highlighted code with copy',
  embed: 'Embedded URL (link / video / iframe)',
  quote: 'Left-border block quote',
  divider: 'Horizontal rule',
});

const BASELINE_KIND_GROUPS: Readonly<Record<BlockType, string>> = Object.freeze({
  paragraph: 'Text',
  heading: 'Text',
  quote: 'Text',
  callout: 'Text',
  toggle: 'Text',
  code: 'Media',
  embed: 'Media',
  divider: 'Misc',
});

/**
 * Build a registry pre-populated with the 8 baseline kinds. The `insert`
 * callback is a no-op marker — `<BlockEditor>` itself owns the actual block
 * insertion (the registry's job is to advertise kinds to `<BlockMenu>`).
 */
function buildBaselineRegistry(): InMemoryBlockKindRegistry {
  const reg = new InMemoryBlockKindRegistry();
  const types: readonly BlockType[] = [
    'paragraph',
    'heading',
    'callout',
    'toggle',
    'code',
    'embed',
    'quote',
    'divider',
  ];
  for (const type of types) {
    const kind: BlockKind = {
      id: `baseline.${type}`,
      label: BASELINE_KIND_LABELS[type],
      description: BASELINE_KIND_DESCRIPTIONS[type],
      group: BASELINE_KIND_GROUPS[type],
      keywords: [type],
      // Registry-side insert is a sentinel; the editor's `onInsert` handler
      // drives the actual mutation via the kind id.
      insert: (): void => undefined,
    };
    reg.add(kind);
  }
  return reg;
}

// -----------------------------------------------------------------------------
// Meta accessor helpers. `Block.meta` is `Readonly<Record<string, unknown>>`
// so the lint rule rightly forbids passing untrusted values to `String(…)`.
// These tiny readers narrow at the access site without spraying type
// assertions through the per-type render functions.
// -----------------------------------------------------------------------------

function metaString(meta: Block['meta'], key: string, fallback: string): string {
  const value = meta?.[key];
  return typeof value === 'string' ? value : fallback;
}

function metaNumberOr<T extends number>(
  meta: Block['meta'],
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = meta?.[key];
  return allowed.find((v) => v === value) ?? fallback;
}

// -----------------------------------------------------------------------------
// ID + factory helpers — block creation.
// -----------------------------------------------------------------------------

let idCounter = 0;
/**
 * Generate a stable-ish block id. Test environments may not have
 * `crypto.randomUUID`, so we fall back to a monotonic counter prefixed with
 * `'blk'`. Collisions across editor instances are tolerable; React keys only
 * need uniqueness within `blocks[]`.
 */
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `blk-${String(idCounter)}`;
}

/** Map a baseline kind id (from `<BlockMenu>`) to its `BlockType`. */
function typeFromKindId(kindId: string): BlockType | null {
  if (!kindId.startsWith('baseline.')) return null;
  const tail = kindId.slice('baseline.'.length) as BlockType;
  return tail in BASELINE_KIND_LABELS ? tail : null;
}

/** Construct a fresh, empty block of the requested type. */
function createBlock(type: BlockType): Block {
  const id = genId();
  switch (type) {
    case 'heading':
      return { id, type, content: '', meta: { level: 2 } };
    case 'code':
      return { id, type, content: '', meta: { language: 'plaintext' } };
    case 'callout':
      return { id, type, content: '', meta: { severity: 'info' } };
    case 'toggle':
      return { id, type, content: '', children: [] };
    case 'embed':
      return { id, type, content: '', meta: { url: '' } };
    case 'divider':
      return { id, type };
    case 'quote':
    case 'paragraph':
    default:
      return { id, type, content: '' };
  }
}

// -----------------------------------------------------------------------------
// `<BlockEditor>` — top-level component.
// -----------------------------------------------------------------------------

export function BlockEditor({
  blocks,
  onChange,
  kindRegistry,
  surface = 'doc',
  slashTrigger = '/',
  draggable = false,
  variant = 'ghost',
  className,
  ariaLabel = 'Document',
}: BlockEditorProps): ReactNode {
  const labelId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  // The active (focused) block id — drives where slash insertions land and
  // which row the up/down keys move out of.
  const [activeId, setActiveId] = useState<string | null>(null);
  // Slash-menu controlled state.
  const [menuOpen, setMenuOpen] = useState(false);
  // Drag state — id of the block currently being dragged. Null when idle.
  const [dragId, setDragId] = useState<string | null>(null);

  // Build a baseline registry once, lazily, when no host registry is supplied.
  // Memoised so resubscribe doesn't churn `<BlockMenu>` on every render.
  const internalRegistry = useMemo(() => {
    if (kindRegistry !== undefined) return null;
    return buildBaselineRegistry();
  }, [kindRegistry]);
  const registry: BlockKindRegistry = kindRegistry ?? internalRegistry!;

  // -- Mutation helpers ------------------------------------------------------

  /** Insert `block` immediately after `afterId`; or at the end if afterId is null. */
  const insertAfter = useCallback(
    (afterId: string | null, block: Block): void => {
      const idx = afterId === null ? blocks.length - 1 : blocks.findIndex((b) => b.id === afterId);
      const next = [...blocks];
      next.splice(idx + 1, 0, block);
      onChange(next);
      setActiveId(block.id);
    },
    [blocks, onChange],
  );

  const removeBlock = useCallback(
    (id: string): void => {
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx < 0) return;
      const next = blocks.filter((b) => b.id !== id);
      onChange(next);
      // After delete, re-focus the previous block if any.
      const fallback = next[Math.max(0, idx - 1)];
      setActiveId(fallback?.id ?? null);
    },
    [blocks, onChange],
  );

  const updateBlock = useCallback(
    (id: string, patch: Partial<Block>): void => {
      const next = blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
      onChange(next);
    },
    [blocks, onChange],
  );

  const moveBlock = useCallback(
    (fromId: string, toId: string): void => {
      if (fromId === toId) return;
      const fromIdx = blocks.findIndex((b) => b.id === fromId);
      const toIdx = blocks.findIndex((b) => b.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;
      const next = [...blocks];
      const [moved] = next.splice(fromIdx, 1);
      if (!moved) return;
      next.splice(toIdx, 0, moved);
      onChange(next);
    },
    [blocks, onChange],
  );

  // -- Slash-menu insertion --------------------------------------------------

  const onMenuInsert = useCallback(
    (kind: BlockKind, _ctx: BlockInsertContext): void => {
      const type = typeFromKindId(kind.id);
      if (type === null) return;
      const after = activeId;
      insertAfter(after, createBlock(type));
    },
    [activeId, insertAfter],
  );

  // -- Keyboard handling on a block container --------------------------------

  const focusBlock = useCallback((id: string | null, position: 'start' | 'end' = 'end'): void => {
    if (id === null) return;
    const root = rootRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-cir-block][data-block-id="${id}"]`);
    if (!el) return;
    const editable = el.querySelector<HTMLElement>('[data-cir-block-editable="true"]');
    const target = editable ?? el;
    if (typeof target.focus === 'function') target.focus();
    // Best-effort caret placement at start / end of the editable text node.
    if (editable && typeof window !== 'undefined' && typeof window.getSelection === 'function') {
      const sel = window.getSelection();
      const range = document.createRange();
      if (position === 'end') range.selectNodeContents(editable);
      else range.setStart(editable, 0);
      range.collapse(position === 'start');
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  const onBlockKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>, block: Block): void => {
    // Slash → open menu (paragraph / heading / quote / callout / toggle only —
    // code and embed pass through so `/` remains a literal character there).
    const slashContext = block.type !== 'code' && block.type !== 'embed';
    if (e.key === slashTrigger && slashContext) {
      e.preventDefault();
      setActiveId(block.id);
      setMenuOpen(true);
      return;
    }
    if (e.key === 'Enter' && block.type === 'paragraph') {
      // Avoid `<br>` insertion; break out into a fresh paragraph instead.
      e.preventDefault();
      const fresh = createBlock('paragraph');
      insertAfter(block.id, fresh);
      // Wait a tick for React to paint the new node before focusing.
      window.setTimeout(() => {
        focusBlock(fresh.id, 'start');
      }, 0);
      return;
    }
    if (e.key === 'Backspace') {
      // Delete the block when it's empty AND the caret is at the start.
      const isEmpty = (block.content ?? '').replace(/<br\s*\/?>(\s*)/gi, '').trim() === '';
      if (isEmpty) {
        e.preventDefault();
        const idx = blocks.findIndex((b) => b.id === block.id);
        const prev = blocks[idx - 1];
        removeBlock(block.id);
        if (prev) {
          window.setTimeout(() => {
            focusBlock(prev.id, 'end');
          }, 0);
        }
        return;
      }
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const idx = blocks.findIndex((b) => b.id === block.id);
      const target = e.key === 'ArrowUp' ? blocks[idx - 1] : blocks[idx + 1];
      if (target) {
        e.preventDefault();
        setActiveId(target.id);
        focusBlock(target.id, e.key === 'ArrowUp' ? 'end' : 'start');
      }
    }
  };

  // -- Drag handlers ---------------------------------------------------------

  const onDragStart = (e: ReactDragEvent<HTMLDivElement>, id: string): void => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDragId(id);
  };

  const onDragOver = (e: ReactDragEvent<HTMLDivElement>): void => {
    // Opt into the row being a drop target. Without this `drop` never fires.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: ReactDragEvent<HTMLDivElement>, targetId: string): void => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData('text/plain') || (dragId ?? '');
    if (fromId !== '') moveBlock(fromId, targetId);
    setDragId(null);
  };

  const onDragEnd = (): void => {
    setDragId(null);
  };

  // Auto-seed an empty document with one paragraph so the user has somewhere
  // to start typing. We mirror Notion / Coda behaviour. We deliberately
  // depend ONLY on `blocks.length === 0` (not the closures): this fires the
  // first time the host hands us an empty document. Subsequent renders with
  // non-empty blocks short-circuit, and a re-empty doc re-seeds.
  const hasSeededRef = useRef(false);
  useEffect(() => {
    if (blocks.length === 0 && !hasSeededRef.current) {
      hasSeededRef.current = true;
      const fresh = createBlock('paragraph');
      onChange([fresh]);
      setActiveId(fresh.id);
    } else if (blocks.length > 0) {
      hasSeededRef.current = true;
    }
  }, [blocks.length, onChange]);

  return (
    <div
      ref={rootRef}
      data-cir-component="BlockEditor"
      data-variant={variant}
      data-cir-surface={surface}
      role="group"
      aria-labelledby={labelId}
      className={cn(layoutVariantClass[variant], className)}
    >
      <span id={labelId} data-cir-part="block-editor-label" style={{ display: 'none' }}>
        {ariaLabel}
      </span>
      <div data-cir-part="block-editor-list">
        {blocks.map((block, index) => (
          <BlockRow
            key={block.id}
            block={block}
            index={index}
            isActive={block.id === activeId}
            isDragging={block.id === dragId}
            draggable={draggable}
            onFocus={() => {
              setActiveId(block.id);
            }}
            onKeyDown={(e) => {
              onBlockKeyDown(e, block);
            }}
            onContentChange={(content) => {
              updateBlock(block.id, { content });
            }}
            onMetaChange={(meta) => {
              updateBlock(block.id, { meta: { ...block.meta, ...meta } });
            }}
            onDragStart={(e) => {
              onDragStart(e, block.id);
            }}
            onDragOver={onDragOver}
            onDrop={(e) => {
              onDrop(e, block.id);
            }}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
      <BlockMenu
        registry={registry}
        surface={surface}
        open={menuOpen}
        trigger={(slashTrigger as '/' | '@' | '#') ?? '/'}
        position={activeId}
        onInsert={onMenuInsert}
        onClose={() => {
          setMenuOpen(false);
        }}
      />
    </div>
  );
}

BlockEditor.displayName = 'BlockEditor';

// -----------------------------------------------------------------------------
// Row — one block. Splits per-type rendering into a single component so the
// outer editor stays focused on structure + keyboard wiring.
// -----------------------------------------------------------------------------

interface BlockRowProps {
  block: Block;
  index: number;
  isActive: boolean;
  isDragging: boolean;
  draggable: boolean;
  onFocus: () => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  onContentChange: (content: string) => void;
  onMetaChange: (meta: Record<string, unknown>) => void;
  onDragStart: (e: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver: (e: ReactDragEvent<HTMLDivElement>) => void;
  onDrop: (e: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

const ROW_BASE_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
};

function BlockRow({
  block,
  index,
  isActive,
  isDragging,
  draggable,
  onFocus,
  onKeyDown,
  onContentChange,
  onMetaChange,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: BlockRowProps): ReactNode {
  return (
    <div
      data-cir-block
      data-cir-block-type={block.type}
      data-block-id={block.id}
      data-block-index={index}
      data-active={isActive ? 'true' : 'false'}
      data-dragging={isDragging ? 'true' : 'false'}
      style={ROW_BASE_STYLE}
      onDragOver={draggable ? onDragOver : undefined}
      onDrop={draggable ? onDrop : undefined}
    >
      {draggable ? (
        <span
          data-cir-part="block-drag-handle"
          role="button"
          aria-label={`Drag block ${String(index + 1)}`}
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          style={{
            cursor: 'grab',
            userSelect: 'none',
            opacity: 0.5,
            padding: '0 2px',
          }}
        >
          ⠿
        </span>
      ) : null}
      <div data-cir-part="block-body" style={{ flex: 1 }} onKeyDown={onKeyDown} onFocus={onFocus}>
        <BlockBody block={block} onContentChange={onContentChange} onMetaChange={onMetaChange} />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Per-type rendering. Each branch is intentionally tiny — block editors only
// get bigger as new affordances land, so we keep the surface small now.
// -----------------------------------------------------------------------------

interface BlockBodyProps {
  block: Block;
  onContentChange: (content: string) => void;
  onMetaChange: (meta: Record<string, unknown>) => void;
}

function BlockBody({ block, onContentChange, onMetaChange }: BlockBodyProps): ReactNode {
  switch (block.type) {
    case 'heading':
      return <HeadingBlock block={block} onContentChange={onContentChange} />;
    case 'callout':
      return <CalloutBlock block={block} onContentChange={onContentChange} />;
    case 'toggle':
      return <ToggleBlock block={block} onContentChange={onContentChange} />;
    case 'code':
      return (
        <CodeBlockBody
          block={block}
          onContentChange={onContentChange}
          onMetaChange={onMetaChange}
        />
      );
    case 'embed':
      return <EmbedBlock block={block} onContentChange={onContentChange} />;
    case 'quote':
      return <QuoteBlock block={block} onContentChange={onContentChange} />;
    case 'divider':
      return <DividerBlock />;
    case 'paragraph':
    default:
      return <ParagraphBlock block={block} onContentChange={onContentChange} />;
  }
}

interface BodyHandlerProps {
  block: Block;
  onContentChange: (content: string) => void;
}

function ParagraphBlock({ block, onContentChange }: BodyHandlerProps): ReactNode {
  return (
    <div
      data-cir-part="block-paragraph"
      data-cir-block-editable="true"
      role="textbox"
      aria-label="Paragraph"
      contentEditable
      suppressContentEditableWarning
      tabIndex={0}
      onInput={(e) => {
        onContentChange(e.currentTarget.innerHTML);
      }}
      // Only seed on first mount; subsequent renders preserve the caret. The
      // host's `blocks` prop is the source of truth, but writing innerHTML on
      // every re-render would clobber the caret.
      ref={(el) => {
        if (el && el.innerHTML === '' && (block.content ?? '') !== '') {
          el.innerHTML = block.content ?? '';
        }
      }}
    />
  );
}

function HeadingBlock({ block, onContentChange }: BodyHandlerProps): ReactNode {
  const level = metaNumberOr(block.meta, 'level', [1, 2, 3] as const, 2);
  const Tag = `h${String(level)}` as 'h1' | 'h2' | 'h3';
  return (
    <Tag
      data-cir-part="block-heading"
      data-cir-block-editable="true"
      data-cir-heading-level={level}
      role="heading"
      aria-level={level}
      contentEditable
      suppressContentEditableWarning
      tabIndex={0}
      onInput={(e) => {
        onContentChange(e.currentTarget.innerHTML);
      }}
      ref={(el) => {
        if (el && el.innerHTML === '' && (block.content ?? '') !== '') {
          el.innerHTML = block.content ?? '';
        }
      }}
    />
  );
}

function CalloutBlock({ block, onContentChange }: BodyHandlerProps): ReactNode {
  const severity = metaString(block.meta, 'severity', 'info');
  return (
    <div
      data-cir-part="block-callout"
      data-cir-callout-severity={severity}
      role="note"
      style={{
        borderLeft: '3px solid currentColor',
        padding: '8px 12px',
        background: 'rgba(0,0,0,0.03)',
        borderRadius: 4,
      }}
    >
      <div
        data-cir-block-editable="true"
        contentEditable
        suppressContentEditableWarning
        tabIndex={0}
        role="textbox"
        aria-label="Callout body"
        onInput={(e) => {
          onContentChange(e.currentTarget.innerHTML);
        }}
        ref={(el) => {
          if (el && el.innerHTML === '' && (block.content ?? '') !== '') {
            el.innerHTML = block.content ?? '';
          }
        }}
      />
    </div>
  );
}

function ToggleBlock({ block, onContentChange }: BodyHandlerProps): ReactNode {
  return (
    <details data-cir-part="block-toggle">
      <summary
        data-cir-block-editable="true"
        contentEditable
        suppressContentEditableWarning
        tabIndex={0}
        role="textbox"
        aria-label="Toggle summary"
        style={{ cursor: 'pointer' }}
        onInput={(e) => {
          onContentChange(e.currentTarget.innerHTML);
        }}
        ref={(el) => {
          if (el && el.innerHTML === '' && (block.content ?? '') !== '') {
            el.innerHTML = block.content ?? '';
          }
        }}
      />
      <div data-cir-part="block-toggle-children" data-child-count={block.children?.length ?? 0}>
        {/*
          Nested children are rendered as plain text for the baseline shipping
          surface — full nested editing is left for a follow-up. The shape is
          here so hosts can mutate `block.children` and the editor will at
          least surface a count + the child text.
        */}
        {block.children?.map((child) => (
          <div
            key={child.id}
            data-cir-block
            data-cir-block-type={child.type}
            data-block-id={child.id}
          >
            {child.content ?? ''}
          </div>
        ))}
      </div>
    </details>
  );
}

interface CodeBlockBodyProps {
  block: Block;
  onContentChange: (content: string) => void;
  onMetaChange: (meta: Record<string, unknown>) => void;
}

function CodeBlockBody({ block, onContentChange, onMetaChange }: CodeBlockBodyProps): ReactNode {
  const language = metaString(block.meta, 'language', 'plaintext');
  return (
    <div data-cir-part="block-code">
      <textarea
        data-cir-block-editable="true"
        aria-label="Code"
        spellCheck={false}
        value={block.content ?? ''}
        rows={Math.max(3, (block.content ?? '').split('\n').length + 1)}
        onChange={(e) => {
          onContentChange(e.currentTarget.value);
        }}
        style={{
          width: '100%',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 13,
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: 4,
          padding: 8,
          resize: 'vertical',
        }}
      />
      <CodeBlock
        code={block.content ?? ''}
        // Shipped DetectedLanguage union is narrow — when meta.language isn't
        // a known id we omit the prop entirely and let auto-detection pick.
        {...(isKnownLanguage(language) ? { language: language as never } : {})}
      />
      {/* Reference `onMetaChange` so language re-tagging can land later. */}
      <span hidden onClick={() => onMetaChange({ language })} />
    </div>
  );
}

function isKnownLanguage(lang: string): boolean {
  // Mirror the `DetectedLanguage` union from `lib/detect-language.ts`. We
  // intentionally hard-code the list here so this file has no extra import
  // surface; out-of-list languages just fall through to plain text.
  return [
    'plaintext',
    'typescript',
    'javascript',
    'tsx',
    'jsx',
    'json',
    'css',
    'html',
    'shell',
    'python',
    'rust',
    'go',
    'sql',
    'yaml',
    'markdown',
  ].includes(lang);
}

function EmbedBlock({ block, onContentChange }: BodyHandlerProps): ReactNode {
  const url = metaString(block.meta, 'url', block.content ?? '');
  return (
    <div data-cir-part="block-embed" role="figure">
      <input
        data-cir-block-editable="true"
        type="url"
        value={url}
        placeholder="Paste an embed URL"
        aria-label="Embed URL"
        onChange={(e) => {
          onContentChange(e.currentTarget.value);
        }}
        style={{
          width: '100%',
          padding: 8,
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: 4,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 13,
        }}
      />
      {url !== '' ? (
        <div
          data-cir-part="block-embed-preview"
          style={{
            border: '1px dashed rgba(0,0,0,0.2)',
            borderRadius: 4,
            padding: 16,
            marginTop: 4,
            textAlign: 'center',
            opacity: 0.7,
            fontSize: 13,
          }}
        >
          Embed: {url}
        </div>
      ) : null}
    </div>
  );
}

function QuoteBlock({ block, onContentChange }: BodyHandlerProps): ReactNode {
  return (
    <blockquote
      data-cir-part="block-quote"
      data-cir-block-editable="true"
      role="textbox"
      aria-label="Quote"
      contentEditable
      suppressContentEditableWarning
      tabIndex={0}
      style={{
        margin: 0,
        padding: '4px 12px',
        borderLeft: '3px solid rgba(0,0,0,0.3)',
        fontStyle: 'italic',
      }}
      onInput={(e) => {
        onContentChange(e.currentTarget.innerHTML);
      }}
      ref={(el) => {
        if (el && el.innerHTML === '' && (block.content ?? '') !== '') {
          el.innerHTML = block.content ?? '';
        }
      }}
    />
  );
}

function DividerBlock(): ReactNode {
  return (
    <hr
      data-cir-part="block-divider"
      tabIndex={0}
      style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.15)', margin: '8px 0' }}
    />
  );
}

// -----------------------------------------------------------------------------
// Text-render — collapse the document to plain text. Walks each block in
// order; toggle children render inline as `(N children)` since the nested
// surface is intentionally minimal in this milestone.
// -----------------------------------------------------------------------------

export function blockEditorTextRender(props: Pick<BlockEditorProps, 'blocks'>): string {
  const blocks = props?.blocks ?? [];
  if (blocks.length === 0) return '[BlockEditor: empty]';
  const lines: string[] = [];
  for (const block of blocks) {
    lines.push(renderBlockText(block));
  }
  return lines.join('\n');
}

function renderBlockText(block: Block): string {
  const text = stripHtml(block.content ?? '');
  switch (block.type) {
    case 'heading': {
      const level = metaNumberOr(block.meta, 'level', [1, 2, 3] as const, 2);
      const hashes = '#'.repeat(level);
      return `${hashes} ${text}`;
    }
    case 'callout':
      return `[!] ${text}`;
    case 'toggle': {
      const childCount = block.children?.length ?? 0;
      return childCount > 0 ? `▸ ${text} (${String(childCount)} children)` : `▸ ${text}`;
    }
    case 'code': {
      const language = metaString(block.meta, 'language', '');
      return language !== '' && language !== 'plaintext'
        ? `\`\`\`${language}\n${block.content ?? ''}\n\`\`\``
        : `\`\`\`\n${block.content ?? ''}\n\`\`\``;
    }
    case 'embed': {
      const url = metaString(block.meta, 'url', block.content ?? '');
      return url !== '' ? `[embed: ${url}]` : '[embed]';
    }
    case 'quote':
      return `> ${text}`;
    case 'divider':
      return '---';
    case 'paragraph':
    default:
      return text;
  }
}

function stripHtml(input: string): string {
  // Crude tag-strip — adequate for the text fallback. Browsers will already
  // have escaped unsafe HTML on the way in via the ContentEditable surface.
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const BlockEditorBinding: ComponentBinding = {
  id: 'BlockEditor',
  factory: BlockEditor,
};
