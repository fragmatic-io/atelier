// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `atelier lint skill <path>`.
 *
 * Coverage:
 *   - Valid `.skill.md` file → exit 0, OK line printed.
 *   - Malformed YAML frontmatter → exit 1, error mentions reason +
 *     line:column.
 *   - SkillSchema-invalid frontmatter → exit 1, error names the missing
 *     fields.
 *   - File-not-found → exit 1, error mentions the missing path.
 *   - --json round-trips a structured result.
 *   - The dispatcher correctly rejects unknown targets.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  lintCommand,
  lintSkillCommand,
  renderLintSkill,
  runLintSkill,
  type LintSkillResult,
} from '../src/commands/lint.js';

const VALID_SKILL = `---
name: email-triage
version: 1.4.0
description: Categorize an email thread by urgency and required action.
capabilities_used:
  - thread.read
  - thread.classify
when_to_use: When the user opens a thread that contains explicit asks.
when_not_to_use: Marketing emails. Auth codes. Receipts.
example_flow: |
  1. Read thread content.
  2. Classify by intent.
  3. Propose tasks.
known_failure_modes:
  - Confusing FYI emails for action items.
---

# Email triage

Body prose for the compiler.
`;

const MALFORMED_YAML_SKILL = `---
name: broken
version: 0.1.0
description: "an unterminated scalar
capabilities_used:
  - x
---

Body.
`;

const SCHEMA_INVALID_SKILL = `---
name: incomplete
version: 0.1.0
description: missing the required fields
---

Body.
`;

describe('runLintSkill', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'atelier-lint-'));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('returns ok=true with no issues on a valid skill', async () => {
    const file = join(tmp, 'good.skill.md');
    await writeFile(file, VALID_SKILL, 'utf8');
    const result = await runLintSkill(file);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.file).toBe(file);
  });

  it('reports a yaml-kind issue with line/column for malformed frontmatter', async () => {
    const file = join(tmp, 'bad-yaml.skill.md');
    await writeFile(file, MALFORMED_YAML_SKILL, 'utf8');
    const result = await runLintSkill(file);
    expect(result.ok).toBe(false);
    expect(result.issues).toHaveLength(1);
    const [issue] = result.issues;
    expect(issue?.kind).toBe('yaml');
    expect(typeof issue?.line).toBe('number');
    expect(typeof issue?.column).toBe('number');
    expect((issue?.line ?? 0) >= 1).toBe(true);
    expect((issue?.column ?? 0) >= 1).toBe(true);
    expect(issue?.message.length).toBeGreaterThan(0);
  });

  it('reports schema-kind issues for shape violations', async () => {
    const file = join(tmp, 'incomplete.skill.md');
    await writeFile(file, SCHEMA_INVALID_SKILL, 'utf8');
    const result = await runLintSkill(file);
    expect(result.ok).toBe(false);
    const kinds = new Set(result.issues.map((i) => i.kind));
    expect(kinds.has('schema')).toBe(true);
    const paths = new Set(result.issues.map((i) => i.path));
    expect(paths.has('/capabilities_used')).toBe(true);
    expect(paths.has('/when_to_use')).toBe(true);
  });

  it('reports an io-kind issue when the file is missing', async () => {
    const file = join(tmp, 'does-not-exist.skill.md');
    const result = await runLintSkill(file);
    expect(result.ok).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.kind).toBe('io');
  });
});

describe('renderLintSkill', () => {
  it('renders OK with the file path on a clean result', () => {
    const result: LintSkillResult = { file: '/tmp/x.skill.md', ok: true, issues: [] };
    expect(renderLintSkill(result)).toBe('OK  /tmp/x.skill.md');
  });

  it('renders YAML errors with line:column and a caret snippet', () => {
    const result: LintSkillResult = {
      file: '/tmp/x.skill.md',
      ok: false,
      issues: [
        {
          severity: 'error',
          kind: 'yaml',
          message: 'unexpected end of the stream',
          line: 4,
          column: 12,
          path: null,
          snippet: 'description: "an unterminated scalar',
        },
      ],
    };
    const text = renderLintSkill(result);
    expect(text).toContain('INVALID  /tmp/x.skill.md');
    expect(text).toContain('yaml   4:12');
    expect(text).toContain('| description: "an unterminated scalar');
    // 1-based column 12 → 11 spaces of pad before the caret.
    expect(text).toContain(`| ${' '.repeat(11)}^`);
  });

  it('renders schema errors with the JSON path', () => {
    const result: LintSkillResult = {
      file: '/tmp/x.skill.md',
      ok: false,
      issues: [
        {
          severity: 'error',
          kind: 'schema',
          message: 'Required',
          line: null,
          column: null,
          path: '/capabilities_used',
          snippet: null,
        },
      ],
    };
    const text = renderLintSkill(result);
    expect(text).toContain('schema /capabilities_used  Required');
  });
});

describe('lintSkillCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let tmp: string;
  beforeEach(async () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    tmp = await mkdtemp(join(tmpdir(), 'atelier-lint-cli-'));
  });
  afterEach(async () => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(tmp, { recursive: true, force: true });
  });

  it('returns 0 and prints OK on a valid skill', async () => {
    const file = join(tmp, 'good.skill.md');
    await writeFile(file, VALID_SKILL, 'utf8');
    const code = await lintSkillCommand([file], {}, tmp);
    expect(code).toBe(0);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('OK  ');
  });

  it('returns 1 and prints a useful message on malformed YAML', async () => {
    const file = join(tmp, 'bad.skill.md');
    await writeFile(file, MALFORMED_YAML_SKILL, 'utf8');
    const code = await lintSkillCommand([file], {}, tmp);
    expect(code).toBe(1);
    const errOut = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOut).toContain('INVALID');
    expect(errOut).toMatch(/yaml\s+\d+:\d+/);
  });

  it('returns 1 and prints schema errors on schema-invalid frontmatter', async () => {
    const file = join(tmp, 'incomplete.skill.md');
    await writeFile(file, SCHEMA_INVALID_SKILL, 'utf8');
    const code = await lintSkillCommand([file], {}, tmp);
    expect(code).toBe(1);
    const errOut = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOut).toContain('schema /capabilities_used');
  });

  it('returns 1 and prints usage when no positional is given', async () => {
    const code = await lintSkillCommand([], {}, tmp);
    expect(code).toBe(1);
    const errOut = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOut).toContain('usage: atelier lint skill');
  });

  it('returns 0 and prints usage on --help', async () => {
    const code = await lintSkillCommand([], { help: 'true' }, tmp);
    expect(code).toBe(0);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('usage: atelier lint skill');
  });

  it('--json emits a structured payload and still exits 1 on bad input', async () => {
    const file = join(tmp, 'bad.skill.md');
    await writeFile(file, MALFORMED_YAML_SKILL, 'utf8');
    const code = await lintSkillCommand([file], { json: 'true' }, tmp);
    expect(code).toBe(1);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    const parsed = JSON.parse(printed) as LintSkillResult;
    expect(parsed.ok).toBe(false);
    expect(parsed.issues[0]?.kind).toBe('yaml');
    expect(typeof parsed.issues[0]?.line).toBe('number');
  });
});

describe('lintCommand dispatcher', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let tmp: string;
  beforeEach(async () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    tmp = await mkdtemp(join(tmpdir(), 'atelier-lint-disp-'));
  });
  afterEach(async () => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(tmp, { recursive: true, force: true });
  });

  it('routes `lint skill <path>` to the skill linter', async () => {
    const file = join(tmp, 'good.skill.md');
    await writeFile(file, VALID_SKILL, 'utf8');
    const code = await lintCommand(['skill', file], {}, tmp);
    expect(code).toBe(0);
  });

  it('returns 1 with a clear error on an unknown target', async () => {
    const code = await lintCommand(['mystery'], {}, tmp);
    expect(code).toBe(1);
    const errOut = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOut).toContain("unknown target 'mystery'");
  });

  it('prints top-level usage on --help with no target', async () => {
    const code = await lintCommand([], { help: 'true' }, tmp);
    expect(code).toBe(0);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('usage: atelier lint');
  });
});
