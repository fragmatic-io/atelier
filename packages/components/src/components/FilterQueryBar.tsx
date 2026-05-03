// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Wave 11 / Nav-6 — `<FilterQueryBar>` baseline primitive.
 *
 * Linear's top bar lets users type `assignee:me priority:high status:open`
 * and renders each `field:value` token as an inline chip the moment it
 * resolves. This component ships that affordance:
 *
 *  - User types `assignee:me priority:high` in the input.
 *  - As soon as a `field:value` token is followed by whitespace, it is
 *    parsed into a `ParsedFilter` and rendered as a chip immediately to
 *    the left of the cursor.
 *  - Free text after the last token flows to `onTextChange` so a host can
 *    pair the structured chips with a fallback text query.
 *  - Operators recognised:
 *      `field:value`            → eq
 *      `field:!value`           → ne
 *      `field:value1,value2`    → in
 *      `field:>value`           → gt
 *      `field:<value`           → lt
 *      `field:~value`           → contains
 *  - Backspace at the start of the input deletes the last chip.
 *  - Click a chip's × to remove it.
 *
 * The pure parser is exposed as `parseFilterQuery(query, fields)` so
 * server-side / headless code can resolve query strings the same way.
 *
 * (We use the name `FilterQueryBar` rather than `FilterBar` because the
 * latter is taken by the older filter-strip component — `<FilterBar>`
 * renders typed `select` / `toggle` / `search` controls, not a free-form
 * query input. The two compose: a host can mount both above a list, with
 * the chip-bar at the very top for power users and the structured strip
 * just under it for click-driven discovery.)
 *
 * Composition rule: `'leaf'` — content is prop-driven.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ChangeEvent,
} from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn } from './_variants.js';

export type ParsedFilterOp = 'eq' | 'ne' | 'in' | 'gt' | 'lt' | 'contains';

export interface FilterField {
  /** Token key, e.g. `'assignee'`. */
  key: string;
  /** Display label (defaults to `key`). */
  label?: string;
  /** Typed enum values for autocomplete; omit for free-form. */
  values?: readonly string[];
  /** When true, value is free-form (no autocomplete). */
  freeform?: boolean;
}

export interface ParsedFilter {
  field: string;
  op: ParsedFilterOp;
  value: string | string[];
  /** Original token, for chip rendering and round-tripping. */
  raw: string;
}

export interface ParseFilterQueryResult {
  filters: ParsedFilter[];
  remainingText: string;
}

export interface FilterQueryBarProps {
  fields: readonly FilterField[];
  value?: ParsedFilter[];
  defaultValue?: ParsedFilter[];
  onChange?: (filters: ParsedFilter[]) => void;
  onTextChange?: (text: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * Strip surrounding ASCII double-quotes. We don't try to handle escaped
 * quotes (rare in practice for filter UIs); doubled quotes pass through
 * literally and the host can normalise.
 */
function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parse a raw `field:value` payload (the part AFTER the colon) into an
 * `op` + normalised `value`.
 */
function parseValueAndOp(raw: string): { op: ParsedFilterOp; value: string | string[] } {
  if (raw.startsWith('!')) return { op: 'ne', value: unquote(raw.slice(1)) };
  if (raw.startsWith('>')) return { op: 'gt', value: unquote(raw.slice(1)) };
  if (raw.startsWith('<')) return { op: 'lt', value: unquote(raw.slice(1)) };
  if (raw.startsWith('~')) return { op: 'contains', value: unquote(raw.slice(1)) };
  // `,` anywhere → `in` op with comma-split list (after unquoting individual parts).
  if (raw.includes(',')) {
    const parts = raw
      .split(',')
      .map((p) => unquote(p.trim()))
      .filter((p) => p.length > 0);
    return { op: 'in', value: parts };
  }
  return { op: 'eq', value: unquote(raw) };
}

/**
 * Tokenise a query string into whitespace-separated tokens, but keep
 * `key:"quoted value"` as a single token. We do NOT try to fully parse
 * shell-style quoting; the goal is forgiving day-to-day use, not
 * round-tripping shell scripts.
 */
function tokenise(query: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < query.length) {
    while (i < query.length && /\s/.test(query.charAt(i))) i += 1;
    if (i >= query.length) break;
    const start = i;
    let inQuotes = false;
    while (i < query.length) {
      const ch = query.charAt(i);
      if (ch === '"') {
        inQuotes = !inQuotes;
        i += 1;
        continue;
      }
      if (!inQuotes && /\s/.test(ch)) break;
      i += 1;
    }
    out.push(query.slice(start, i));
  }
  return out;
}

/**
 * Pure parser for the Linear-style query grammar. Tokens that aren't
 * `field:value` for a known field roll back into `remainingText` so the
 * host can use them as a free-text fallback.
 */
export function parseFilterQuery(
  query: string,
  fields: readonly FilterField[],
): ParseFilterQueryResult {
  const fieldMap = new Map(fields.map((f) => [f.key, f]));
  const tokens = tokenise(query);
  const filters: ParsedFilter[] = [];
  const leftover: string[] = [];
  for (const tok of tokens) {
    const colon = tok.indexOf(':');
    if (colon <= 0 || colon === tok.length - 1) {
      leftover.push(tok);
      continue;
    }
    const key = tok.slice(0, colon);
    if (!fieldMap.has(key)) {
      leftover.push(tok);
      continue;
    }
    const rest = tok.slice(colon + 1);
    const { op, value } = parseValueAndOp(rest);
    filters.push({ field: key, op, value, raw: tok });
  }
  return { filters, remainingText: leftover.join(' ') };
}

/**
 * Render-time helper — format a `ParsedFilter` back to its chip label.
 */
export function formatFilterChip(f: ParsedFilter): string {
  return f.raw;
}

export function FilterQueryBar({
  fields,
  value,
  defaultValue,
  onChange,
  onTextChange,
  placeholder = 'Filter… (try assignee:me priority:high)',
  ariaLabel = 'Filter query',
  className,
}: FilterQueryBarProps): React.ReactElement {
  const isControlled = value !== undefined;
  const [uncontrolled, setUncontrolled] = useState<ParsedFilter[]>(defaultValue ?? []);
  const filters = isControlled ? value : uncontrolled;
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const fieldKeys = useMemo(() => new Set(fields.map((f) => f.key)), [fields]);

  const commitFilters = useCallback(
    (next: ParsedFilter[]) => {
      if (!isControlled) setUncontrolled(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );

  // When the draft text contains a parseable token followed by whitespace,
  // promote it into a chip and consume that part of the draft. We always
  // emit `onTextChange` with the residual free text.
  const handleDraftChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      // Only promote when a trailing whitespace seals the last token.
      if (/\s$/.test(next)) {
        const parsed = parseFilterQuery(next, fields);
        if (parsed.filters.length > 0) {
          commitFilters([...filters, ...parsed.filters]);
          setDraft(parsed.remainingText);
          onTextChange?.(parsed.remainingText);
          return;
        }
      }
      setDraft(next);
      const parsed = parseFilterQuery(next, fields);
      onTextChange?.(parsed.remainingText);
    },
    [fields, filters, commitFilters, onTextChange],
  );

  const removeAt = useCallback(
    (idx: number) => {
      const next = filters.filter((_, i) => i !== idx);
      commitFilters(next);
    },
    [filters, commitFilters],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && draft.length === 0 && filters.length > 0) {
        e.preventDefault();
        commitFilters(filters.slice(0, -1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const parsed = parseFilterQuery(draft, fields);
        if (parsed.filters.length > 0) {
          commitFilters([...filters, ...parsed.filters]);
        }
        setDraft(parsed.remainingText);
        onTextChange?.(parsed.remainingText);
      }
    },
    [draft, fields, filters, commitFilters, onTextChange],
  );

  // Surface `fieldKeys` to the rendered DOM for testability — hosts can
  // assert on `data-cir-fields` to confirm the configured grammar.
  const fieldKeysAttr = useMemo(() => Array.from(fieldKeys).sort().join(','), [fieldKeys]);

  // Auto-focus the input when a chip is removed via click so the
  // user can keep typing without re-clicking the input. Cheap, pleasant.
  useEffect(() => {
    inputRef.current?.focus();
  }, [filters.length]);

  return (
    <div
      data-cir-component="FilterQueryBar"
      data-cir-fields={fieldKeysAttr}
      role="search"
      aria-label={ariaLabel}
      className={cn(className)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        flexWrap: 'wrap',
        padding: '4px 6px',
        border: '1px solid currentColor',
        borderRadius: '6px',
        minWidth: '240px',
        background: 'transparent',
      }}
    >
      {filters.map((f, idx) => (
        <span
          key={`${String(idx)}-${f.raw}`}
          data-cir-part="filter-chip"
          data-field={f.field}
          data-op={f.op}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '1px 6px',
            borderRadius: '9999px',
            background: 'rgba(110,86,207,0.12)',
            color: 'inherit',
            fontSize: '12px',
            lineHeight: 1.4,
          }}
        >
          <span data-cir-part="filter-chip-label">{f.raw}</span>
          <button
            type="button"
            data-cir-part="filter-chip-remove"
            aria-label={`Remove filter ${f.raw}`}
            onClick={(): void => removeAt(idx)}
            style={{
              border: 0,
              background: 'transparent',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              color: 'inherit',
              font: 'inherit',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        data-cir-part="filter-query-input"
        type="text"
        value={draft}
        placeholder={filters.length === 0 ? placeholder : undefined}
        onChange={handleDraftChange}
        onKeyDown={onKeyDown}
        aria-label="Filter query input"
        style={{
          flex: 1,
          minWidth: '120px',
          border: 0,
          outline: 'none',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
        }}
      />
    </div>
  );
}

FilterQueryBar.displayName = 'FilterQueryBar';

export function filterQueryBarTextRender(props: FilterQueryBarProps): string {
  const count = props.value?.length ?? props.defaultValue?.length ?? 0;
  return `[FilterQueryBar: ${String(count)} active filters]`;
}

export const FilterQueryBarBinding: ComponentBinding = {
  id: 'FilterQueryBar',
  factory: FilterQueryBar as ComponentBinding['factory'],
  manifestContract: {
    description:
      'Linear-style filter syntax bar. The user types `field:value` tokens ' +
      '(e.g. `assignee:me priority:high`); each completed token becomes a chip ' +
      'inline. Operators: `:` (eq), `:!` (ne), `:,` (in), `:>` (gt), `:<` (lt), ' +
      '`:~` (contains). Backspace at the start of the input removes the last chip; ' +
      "clicking a chip's × removes it. Free text after the last token flows to " +
      '`onTextChange`.',
    allowed_props: {
      fields: 'unknown',
      value: 'unknown',
      defaultValue: 'unknown',
      placeholder: 'string',
      ariaLabel: 'string',
      className: 'string',
    },
  },
};
