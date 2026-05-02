// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `detectLanguage` — pure heuristic language detection for code snippets.
 *
 * No deps. No Shiki / Prism / Starry-Night — those land in Cnt-1. This is the
 * lightweight pass we use from `<CodeBlock>` and `<Markdown>` so the agent
 * can render fenced/pasted code with a sensible monospace + label without
 * pulling a 1MB tokenizer into the bundle.
 *
 * Resolution order:
 *   1. Triple-backtick fence with explicit lang (`"```ts\n...```"` or a
 *      caller-supplied `hint`) — exact match against the alias table.
 *   2. Strong syntactic markers (e.g. `def …:` indented body = python).
 *   3. Token frequency (`import`, `function`, `const`, etc.) — the
 *      highest-scoring language wins, ties break in declaration order.
 * Returns `'plaintext'` as a safe fallback when no signal is strong enough.
 *
 * The accuracy bar is "defensible," not "perfect." We aim to recognise
 * idiomatic Slack/Discord/Notion paste shapes and the 14+ snippets in
 * `test/lib/detect-language.test.ts`. False positives are bounded by the
 * `'plaintext'` fallback whenever no marker fires.
 */

export type DetectedLanguage =
  | 'typescript'
  | 'javascript'
  | 'jsx'
  | 'tsx'
  | 'python'
  | 'ruby'
  | 'go'
  | 'rust'
  | 'java'
  | 'csharp'
  | 'sql'
  | 'html'
  | 'css'
  | 'json'
  | 'yaml'
  | 'toml'
  | 'xml'
  | 'bash'
  | 'zsh'
  | 'powershell'
  | 'markdown'
  | 'plaintext';

// -----------------------------------------------------------------------------
// Hint alias table — maps the casual language tags people put after the
// opening triple-backtick (`ts`, `py`, `sh`, `c#`) to canonical
// `DetectedLanguage` ids.
// -----------------------------------------------------------------------------
const HINT_ALIASES: Readonly<Record<string, DetectedLanguage>> = Object.freeze({
  // TypeScript / JavaScript
  ts: 'typescript',
  typescript: 'typescript',
  js: 'javascript',
  javascript: 'javascript',
  jsx: 'jsx',
  tsx: 'tsx',
  // Python / Ruby / Go / Rust / Java / C#
  py: 'python',
  python: 'python',
  rb: 'ruby',
  ruby: 'ruby',
  go: 'go',
  golang: 'go',
  rs: 'rust',
  rust: 'rust',
  java: 'java',
  cs: 'csharp',
  csharp: 'csharp',
  'c#': 'csharp',
  // SQL family
  sql: 'sql',
  postgres: 'sql',
  postgresql: 'sql',
  mysql: 'sql',
  // Markup / data
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  // Shells
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  zsh: 'zsh',
  ps1: 'powershell',
  powershell: 'powershell',
  pwsh: 'powershell',
  // Markdown / plaintext
  md: 'markdown',
  markdown: 'markdown',
  txt: 'plaintext',
  text: 'plaintext',
  plain: 'plaintext',
  plaintext: 'plaintext',
});

// -----------------------------------------------------------------------------
// Fence parser — given a possibly-fenced source, return the fence's lang hint
// (if present) and the inner body. We accept tildes too (CommonMark allows
// `~~~lang ... ~~~`) but stick to triple-backticks as the dominant idiom.
// -----------------------------------------------------------------------------
const FENCE_RE = /^\s*(?:```|~~~)([A-Za-z0-9#+\-_]*)\s*\r?\n([\s\S]*?)\r?\n(?:```|~~~)\s*$/;

interface FenceMatch {
  hint: string | undefined;
  body: string;
}

function parseFence(source: string): FenceMatch | null {
  const m = FENCE_RE.exec(source);
  if (!m) return null;
  const hint = m[1] && m[1].length > 0 ? m[1] : undefined;
  return { hint, body: m[2] ?? '' };
}

function resolveHint(raw: string | undefined): DetectedLanguage | null {
  if (raw === undefined) return null;
  const key = raw.trim().toLowerCase();
  if (key.length === 0) return null;
  return HINT_ALIASES[key] ?? null;
}

// -----------------------------------------------------------------------------
// Strong syntactic markers — fast checks ordered most-specific first. Any
// match short-circuits to that language.
// -----------------------------------------------------------------------------
function strongMarker(src: string): DetectedLanguage | null {
  // Shebangs win immediately.
  if (/^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?bash\b/.test(src)) return 'bash';
  if (/^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?zsh\b/.test(src)) return 'zsh';
  if (/^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?(?:sh|dash|ash)\b/.test(src)) return 'bash';
  if (/^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?python\d?\b/.test(src)) return 'python';
  if (/^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?ruby\b/.test(src)) return 'ruby';

  // Markup.
  if (/^\s*<!doctype\s+html/i.test(src)) return 'html';
  if (/^\s*<\?xml\b/i.test(src)) return 'xml';

  // JSON: starts with `{` or `[`, ends with the matching close, contains
  // `"key":` shape. Cheap structural test — full JSON.parse would be slow on
  // large blobs and we don't need correctness, just plausibility.
  const trimmed = src.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    if (/"\s*[\w-]+\s*"\s*:/.test(trimmed)) return 'json';
  }

  // YAML: a `---` document separator OR `key: value` lines without `{`/`}`
  // wrapping (which would be JSON). The `---` heuristic alone is strong.
  if (/^---\s*$/m.test(src) && /^\s*[\w-]+\s*:\s*\S/m.test(src)) return 'yaml';

  // TOML: `[section]` followed by `key = value`. Distinguish from INI by
  // requiring the equals form (INI also uses `=` so this overlaps; we accept
  // that overlap and call it TOML).
  if (/^\s*\[[\w.-]+\]\s*$/m.test(src) && /^\s*[\w.-]+\s*=\s*.+$/m.test(src)) return 'toml';

  // SQL: a SELECT … FROM (case-insensitive) is the strongest signal.
  if (/\bselect\b[\s\S]+?\bfrom\b/i.test(src)) return 'sql';

  // Python: `def name(...):` followed by an indented line.
  if (/^\s*def\s+[A-Za-z_][\w]*\s*\([^)]*\)\s*:\s*$/m.test(src)) return 'python';
  // Or `class Name(Base):` — also distinctive.
  if (/^\s*class\s+[A-Z][\w]*\s*(?:\([^)]*\))?\s*:\s*$/m.test(src)) return 'python';

  // Go: `func name(...) ... {` and `package main`.
  if (/^\s*package\s+\w+\s*$/m.test(src) && /\bfunc\s+\w+\s*\(/.test(src)) return 'go';

  // Rust: `fn name(...) { … }` plus `let mut` / `impl` / `use crate::`.
  if (/\bfn\s+\w+\s*\([^)]*\)\s*(?:->\s*[^\n{]+)?\s*\{/.test(src)) {
    if (/\b(?:let\s+mut|impl\b|use\s+crate::|->|fn\s+main\s*\()/.test(src)) return 'rust';
  }

  // Java: `public class Foo { … }` plus a `public static void main`.
  if (/\bpublic\s+class\s+\w+/.test(src) && /\bpublic\s+static\s+void\s+main\s*\(/.test(src)) {
    return 'java';
  }

  // C#: `using System;` + `namespace Foo { … }` or `Console.WriteLine`.
  if (
    /\busing\s+System(?:\.\w+)*\s*;/.test(src) &&
    /\b(?:namespace\s+\w+|Console\.Write(?:Line)?\s*\()/.test(src)
  ) {
    return 'csharp';
  }

  // CSS: a `selector { prop: value; }` block. Avoid matching JS object
  // literals by requiring a colon-followed-by-value-followed-by-semicolon
  // shape inside the braces.
  if (/^\s*[.#@:]?[\w\-,\s>+*[\]="'~]+\{\s*[\w-]+\s*:\s*[^;}]+;[\s\S]*\}\s*$/m.test(src)) {
    return 'css';
  }

  // HTML (without DOCTYPE): a `<tag>` followed by `</tag>`.
  if (/<([a-zA-Z][\w-]*)\b[^>]*>[\s\S]*<\/\1>/.test(src)) return 'html';

  // PowerShell: a `$variable = …` and a `Write-Host` / `Get-…` cmdlet.
  if (/\$[A-Za-z_][\w]*\s*=/.test(src) && /\b(?:Write-Host|Get-\w+|Set-\w+)\b/.test(src)) {
    return 'powershell';
  }

  return null;
}

// -----------------------------------------------------------------------------
// Token-frequency tie-breakers. Each language carries a list of regex
// signals; we count distinct hits and return the highest scorer if any
// language clears the threshold.
// -----------------------------------------------------------------------------
type Scorer = readonly [DetectedLanguage, readonly RegExp[]];

const SCORERS: readonly Scorer[] = [
  [
    'typescript',
    [
      /\binterface\s+[A-Z]\w*/,
      /\btype\s+\w+\s*=/,
      /:\s*(?:string|number|boolean|void|unknown|never)\b/,
      /\bas\s+(?:const|unknown|string|number)\b/,
    ],
  ],
  [
    'javascript',
    [
      /\bconst\s+\w+\s*=/,
      /\blet\s+\w+\s*=/,
      /\bfunction\s+\w+\s*\(/,
      /\bimport\s+[\w*{}\s,]+\s+from\s+['"][^'"]+['"]\s*;?/,
      /\bmodule\.exports\s*=/,
      /\brequire\s*\(\s*['"][^'"]+['"]\s*\)/,
      /=>\s*[{({]/,
    ],
  ],
  [
    'jsx',
    [
      /<[A-Z]\w*\s*[^>]*>/, // <UpperCaseTag …>
      /<\/[A-Z]\w*\s*>/,
      /\breturn\s*\(\s*</,
    ],
  ],
  [
    'python',
    [
      /^\s*from\s+\w[\w.]*\s+import\s+/m,
      /^\s*import\s+\w[\w.]*(?:\s*,\s*\w[\w.]*)*\s*$/m,
      /\bself\b/,
      /\bprint\s*\(/,
      /\b__name__\s*==\s*['"]__main__['"]/,
    ],
  ],
  ['ruby', [/\bdef\s+\w+/, /\bend\s*$/m, /\brequire\s+['"]\w+['"]/, /\bputs\s+/, /\bdo\s*\|.*?\|/]],
  [
    'bash',
    [
      /\becho\s+/,
      /\bexport\s+\w+=/,
      /\$\{[\w:-]+\}/,
      /\bif\s+\[\[?\s.+\s\]\]?\s*;?\s*then\b/,
      /\bfi\b\s*$/m,
      /\|\s*(?:grep|awk|sed|xargs|tee)\b/,
    ],
  ],
  ['markdown', [/^#{1,6}\s+\S/m, /^\s*[-*+]\s+\S/m, /\[[^\]]+\]\([^)]+\)/, /^>\s+\S/m, /```/]],
];

const MIN_SCORE = 2;

function tokenScore(src: string): DetectedLanguage | null {
  let best: { lang: DetectedLanguage; score: number } | null = null;
  for (const [lang, patterns] of SCORERS) {
    let s = 0;
    for (const p of patterns) {
      if (p.test(src)) s += 1;
    }
    if (s >= MIN_SCORE && (best === null || s > best.score)) {
      best = { lang, score: s };
    }
  }
  return best?.lang ?? null;
}

/**
 * Detect a code block's language from heuristics.
 *
 * @param source - The raw code body OR a fenced block (e.g. `"```ts\n…```"`).
 * @param hint   - Optional explicit language hint (e.g. from a fence). Wins
 *                 over heuristics when it resolves to a known language.
 */
export function detectLanguage(source: string, hint?: string): DetectedLanguage {
  // 1) Caller-supplied hint wins outright if it resolves.
  const hinted = resolveHint(hint);
  if (hinted !== null) return hinted;

  // 2) If the source is itself a fenced block, peel the fence and treat the
  //    fence's lang token as a hint.
  const fence = parseFence(source);
  if (fence !== null) {
    const fenceHint = resolveHint(fence.hint);
    if (fenceHint !== null) return fenceHint;
    // Fenced but no recognised hint — fall through to body heuristics.
    source = fence.body;
  }

  if (source.trim().length === 0) return 'plaintext';

  // 3) Strong markers.
  const strong = strongMarker(source);
  if (strong !== null) {
    // JSX upgrade: a JS file with `<UpperCaseTag>` pattern in a `return (`
    // block should bias toward jsx/tsx instead of js. We only do this when
    // the strong marker did NOT already pick something definitive.
    if (strong === 'javascript' || strong === 'typescript') {
      const jsxLike = /<[A-Z]\w*[^>]*>/.test(source) && /\breturn\s*\(/.test(source);
      if (jsxLike) return strong === 'typescript' ? 'tsx' : 'jsx';
    }
    return strong;
  }

  // 4) Token-frequency. TypeScript/JavaScript ambiguity is resolved by
  //    looking for type annotations (`: string`, `interface X`, `as const`)
  //    AFTER the JS scorer runs. JSX/TSX upgrade if uppercase tags appear.
  const scored = tokenScore(source);
  if (scored !== null) {
    if (scored === 'typescript' || scored === 'javascript') {
      const jsxLike = /<[A-Z]\w*[^>]*>/.test(source);
      if (jsxLike) return scored === 'typescript' ? 'tsx' : 'jsx';
    }
    if (scored === 'javascript') {
      // Upgrade js → ts if any TS-only marker appears.
      if (/\binterface\s+[A-Z]\w*/.test(source) || /:\s*(?:string|number|boolean)\b/.test(source)) {
        return 'typescript';
      }
    }
    return scored;
  }

  return 'plaintext';
}
