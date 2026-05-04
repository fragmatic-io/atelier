// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `detectLanguage` — the lightweight heuristic used by
 * `<CodeBlock>` and `<Markdown>` to label fenced code without pulling
 * Shiki into the bundle.
 *
 * Coverage strategy: hit each of the four resolution paths described
 * in the source — caller hint, fenced hint, strong marker, token score —
 * plus the `'plaintext'` fallback when nothing fires.
 */

import { describe, expect, it } from 'vitest';
import { detectLanguage } from '../../src/lib/detect-language.js';

describe('detectLanguage — caller hint wins', () => {
  it('resolves canonical aliases', () => {
    expect(detectLanguage('print("x")', 'py')).toBe('python');
    expect(detectLanguage('def f(): pass', 'python')).toBe('python');
    expect(detectLanguage('SELECT * FROM x', 'mysql')).toBe('sql');
    expect(detectLanguage('# heading', 'md')).toBe('markdown');
    expect(detectLanguage('x = 1', 'c#')).toBe('csharp');
  });

  it('case-insensitive + trims hint', () => {
    expect(detectLanguage('def f(): pass', '  PY  ')).toBe('python');
    expect(detectLanguage('SELECT *', 'SQL')).toBe('sql');
  });

  it('returns plaintext when hint is empty / whitespace-only', () => {
    // Empty hint falls through to heuristics; the body has no marker
    // beyond a single line so we land on plaintext.
    expect(detectLanguage('hello there', '   ')).toBe('plaintext');
  });

  it('unknown hint is ignored — heuristics take over', () => {
    // Hint "klingon" is unknown; the body is a JSON object → strong marker.
    expect(detectLanguage('{"a": 1}', 'klingon')).toBe('json');
  });
});

describe('detectLanguage — fence parsing', () => {
  it('uses the fence-declared language when present', () => {
    expect(detectLanguage('```ts\nconst x: string = "y";\n```')).toBe('typescript');
    expect(detectLanguage('~~~py\nprint("x")\n~~~')).toBe('python');
  });

  it('peels the fence and falls through to body heuristics when the lang is unknown', () => {
    // Fence with a bogus lang → body must be re-scored.
    expect(detectLanguage('```martian\nSELECT * FROM users\n```')).toBe('sql');
  });

  it('handles fenced empty body as plaintext', () => {
    expect(detectLanguage('```\n\n```')).toBe('plaintext');
  });
});

describe('detectLanguage — strong markers', () => {
  it('shebang lines short-circuit to bash / zsh / python / ruby', () => {
    expect(detectLanguage('#!/usr/bin/env bash\necho hi')).toBe('bash');
    expect(detectLanguage('#!/usr/bin/env zsh\necho hi')).toBe('zsh');
    expect(detectLanguage('#!/usr/bin/env python3\nprint("x")')).toBe('python');
    expect(detectLanguage('#!/usr/bin/env ruby\nputs "hi"')).toBe('ruby');
    expect(detectLanguage('#!/bin/sh\necho hi')).toBe('bash');
  });

  it('html doctype + xml prolog short-circuit', () => {
    expect(detectLanguage('<!doctype html><html><body>hi</body></html>')).toBe('html');
    expect(detectLanguage('<?xml version="1.0"?><root />')).toBe('xml');
  });

  it('JSON object / array marker', () => {
    expect(detectLanguage('{"name": "ada", "age": 36}')).toBe('json');
    expect(detectLanguage('[{"a": 1}, {"b": 2}]')).toBe('json');
  });

  it('YAML --- separator + key:value', () => {
    expect(detectLanguage('---\nname: ada\nage: 36\n')).toBe('yaml');
  });

  it('TOML [section] + key = value', () => {
    expect(detectLanguage('[server]\nport = 8080\nhost = "localhost"\n')).toBe('toml');
  });

  it('SQL SELECT … FROM marker', () => {
    expect(detectLanguage('select id, name from users where active = true;')).toBe('sql');
  });

  it('python def + class markers', () => {
    expect(detectLanguage('def hello(name):\n    print(name)\n')).toBe('python');
    expect(detectLanguage('class Animal(Base):\n    pass\n')).toBe('python');
  });

  it('go marker — package + func', () => {
    expect(detectLanguage('package main\n\nfunc add(a, b int) int { return a+b }\n')).toBe('go');
  });

  it('rust marker — fn + let mut / impl', () => {
    expect(detectLanguage('fn main() {\n  let mut x = 1;\n}')).toBe('rust');
  });

  it('java marker — public class + main', () => {
    expect(
      detectLanguage(
        'public class Hello {\n  public static void main(String[] args) {\n    System.out.println("hi");\n  }\n}',
      ),
    ).toBe('java');
  });

  it('c# marker — using System + Console.WriteLine', () => {
    expect(detectLanguage('using System;\nConsole.WriteLine("hi");')).toBe('csharp');
  });

  it('css marker — selector + property:value;', () => {
    expect(detectLanguage('.btn { color: red; padding: 4px; }')).toBe('css');
  });

  it('html marker without doctype — paired tags', () => {
    expect(detectLanguage('<div><span>hi</span></div>')).toBe('html');
  });

  it('powershell marker — $var + Write-Host', () => {
    expect(detectLanguage('$name = "ada"\nWrite-Host $name')).toBe('powershell');
  });
});

describe('detectLanguage — token scoring + JSX/TSX upgrade', () => {
  it('scores typescript by interface + type-annotation patterns', () => {
    // Avoid `{` style braces that would match the css strong-marker.
    const src = `
interface User
  id: string
type Status = 'active' | 'idle'
function describe(s: Status): string
  return s
`;
    expect(detectLanguage(src)).toBe('typescript');
  });

  it('upgrades typescript → tsx when an UpperCase tag and `return (` appear', () => {
    const src = `
interface Props { name: string }
function App(p: Props): JSX.Element {
  return (
    <Greeter name={p.name} />
  );
}
`;
    expect(detectLanguage(src)).toBe('tsx');
  });

  it('upgrades javascript → jsx when an UpperCase tag and `return (` appear', () => {
    // Avoid the html paired-tag strong marker by using a self-closing tag
    // (no `</tag>` form) so we land in token-scoring with a JS marker set
    // and then upgrade to jsx.
    const src = `
const Item = (props) => {
  return (
    <Card label={props.label} />
  );
};
module.exports = Item;
`;
    expect(detectLanguage(src)).toBe('jsx');
  });

  it('upgrades javascript → typescript when a TS-only marker fires after scoring', () => {
    // const + arrow function → js scorer hits 2.
    // `: string` annotation → upgrade to typescript.
    const src = `
const greet = (name: string) => {
  return "hi " + name;
};
`;
    expect(detectLanguage(src)).toBe('typescript');
  });

  it('returns plaintext when no scorer clears MIN_SCORE', () => {
    expect(detectLanguage('hello world')).toBe('plaintext');
    expect(detectLanguage('a single line of nothing')).toBe('plaintext');
  });

  it('returns plaintext for whitespace-only input', () => {
    expect(detectLanguage('   \n\t')).toBe('plaintext');
  });

  it('ruby scorer fires on def + end + puts', () => {
    const src = `
def greet(name)
  puts "hi #{name}"
end
`;
    expect(detectLanguage(src)).toBe('ruby');
  });

  it('bash scorer fires on echo + export + pipe', () => {
    const src = `
export NAME=ada
echo $NAME | grep ada
`;
    expect(detectLanguage(src)).toBe('bash');
  });

  it('markdown scorer fires on heading + list + link', () => {
    const src = `
# Heading

- item one
- item two

See [docs](https://example.com).
`;
    expect(detectLanguage(src)).toBe('markdown');
  });
});
