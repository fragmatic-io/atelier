// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import ts from '../../../vendor/typescript/lib/typescript.js';
import { resolve, relative, sep } from 'node:path';
import { readFileSync } from 'node:fs';
import { hash } from '../../control-plane/src/util.mjs';
function typeSchema(checker, type, seen = new Set(), depth = 0) {
  if (depth > 7 || seen.has(type)) return { 'x-typescript': checker.typeToString(type) };
  const next = new Set(seen);
  next.add(type);
  if (type.flags & ts.TypeFlags.StringLiteral) return { type: 'string', const: type.value };
  if (type.flags & ts.TypeFlags.NumberLiteral) return { type: 'number', const: type.value };
  if (type.flags & ts.TypeFlags.String) return { type: 'string' };
  if (type.flags & ts.TypeFlags.Number) return { type: 'number' };
  if (type.flags & ts.TypeFlags.Boolean) return { type: 'boolean' };
  if (type.flags & ts.TypeFlags.Null) return { type: 'null' };
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {};
  if (type.isUnion()) {
    const types = type.types.filter((x) => !(x.flags & ts.TypeFlags.Undefined));
    if (types.every((t) => t.flags & ts.TypeFlags.StringLiteral))
      return { type: 'string', enum: types.map((t) => t.value) };
    if (types.every((t) => t.flags & ts.TypeFlags.BooleanLiteral)) return { type: 'boolean' };
    return { anyOf: types.map((t) => typeSchema(checker, t, next, depth + 1)) };
  }
  if (checker.isArrayType(type) || checker.isTupleType(type))
    return {
      type: 'array',
      items: typeSchema(
        checker,
        checker.getTypeArguments(type)[0] ?? checker.getAnyType(),
        next,
        depth + 1,
      ),
    };
  if (type.getCallSignatures().length)
    return { 'x-callback': true, 'x-typescript': checker.typeToString(type) };
  const properties = {},
    required = [];
  for (const symbol of type.getProperties().slice(0, 100)) {
    if (symbol.name.startsWith('__@')) continue;
    const d = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (!d) continue;
    const t = checker.getTypeOfSymbolAtLocation(symbol, d);
    properties[symbol.name] = typeSchema(checker, t, next, depth + 1);
    if (!(symbol.flags & ts.SymbolFlags.Optional)) required.push(symbol.name);
  }
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: !!checker.getIndexTypeOfType(type, ts.IndexKind.String),
  };
}
/** Uses the actual TypeScript AST and type checker; never executes project modules. */
export function enrichProjectAst(root, files, components = []) {
  const absolute = resolve(root);
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    jsx: ts.JsxEmit.Preserve,
    strictNullChecks: true,
    skipLibCheck: true,
    noEmit: true,
  };
  const host = ts.createCompilerHost(options);
  const originalRead = host.readFile,
    originalExists = host.fileExists;
  const vendor = resolve(new URL('../../../vendor/typescript/', import.meta.url).pathname);
  const allowed = (p) => {
    const r = resolve(p);
    return r === absolute || r.startsWith(absolute + sep) || r.startsWith(vendor + sep);
  };
  host.readFile = (p) => (allowed(p) ? originalRead(p) : undefined);
  host.fileExists = (p) => allowed(p) && originalExists(p);
  const program = ts.createProgram(
    files.map((f) => resolve(root, f)),
    options,
    host,
  );
  const checker = program.getTypeChecker();
  const enriched = [];
  const imports = [];
  const callSites = [];
  const entities = [];
  const issues = [];
  for (const sf of program.getSourceFiles()) {
    if (!sf.fileName.startsWith(absolute + sep)) continue;
    const path = relative(absolute, sf.fileName).split(sep).join('/');
    const module = checker.getSymbolAtLocation(sf);
    for (const exported of module ? checker.getExportsOfModule(module) : []) {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const d = symbol.valueDeclaration ?? symbol.declarations?.[0];
      if (!d) continue;
      const name =
        exported.name === 'default'
          ? symbol.name === 'default'
            ? null
            : symbol.name
          : exported.name;
      if (!name) continue;
      if (ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d)) {
        const schema = typeSchema(checker, checker.getTypeAtLocation(d));
        if (schema.type === 'object')
          entities.push({
            id: name,
            name,
            fields: Object.entries(schema.properties ?? {}).map(([name, schema]) => ({
              name,
              schema,
            })),
            sourcePath: path,
            confidence: 0.95,
            evidence: [
              {
                source: 'typescript-ast',
                sourcePath: path,
                sourceHash: hash(sf.text),
                status: 'observed',
                confidence: 0.95,
              },
            ],
          });
      }
      if (
        !/^[A-Z]/.test(name) ||
        /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name) ||
        /\/route\.[cm]?[jt]sx?$/.test('/' + path)
      )
        continue;
      const type = checker.getTypeOfSymbolAtLocation(symbol, d);
      const signature = type.getCallSignatures()[0];
      if (!signature) continue;
      const param = signature.getParameters()[0];
      const props = param
        ? checker.getTypeOfSymbolAtLocation(param, param.valueDeclaration ?? d)
        : null;
      const schema = props
        ? typeSchema(checker, props)
        : { type: 'object', properties: {}, additionalProperties: false };
      const existing = components.find((c) => c.exportName === name && c.sourcePath === path);
      const eventProps = Object.entries(schema.properties ?? {})
        .filter(([, s]) => s['x-callback'])
        .map(([name, schema]) => ({ name, typescript: schema['x-typescript'] }));
      enriched.push({
        ...existing,
        id: existing?.id ?? name,
        exportName: name,
        sourcePath: path,
        framework: 'react',
        chunkId: `host:${path}:${name}`,
        contentHash: hash(sf.text),
        purpose: existing?.purpose ?? `Host component ${name}`,
        goodFor: existing?.goodFor ?? [name],
        avoidFor: [],
        propsSchema: schema,
        events: eventProps,
        slots: [],
        tokensUsed: existing?.tokensUsed ?? [],
        layoutRole: existing?.layoutRole ?? 'custom',
        states: existing?.states ?? {},
        confidence: 0.96,
        evidence: [
          ...(existing?.evidence ?? []),
          {
            source: 'typescript-ast',
            sourcePath: path,
            sourceHash: hash(sf.text),
            confidence: 0.96,
            status: 'observed',
          },
        ],
      });
    }
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))
        imports.push({ from: path, to: node.moduleSpecifier.text });
      if (ts.isCallExpression(node)) {
        const expression = node.expression.getText(sf);
        if (expression === 'fetch' || /\b(axios|api|client)\./.test(expression)) {
          const arg = node.arguments[0];
          const literal =
            arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
              ? arg.text
              : null;
          callSites.push({
            path,
            expression,
            url: literal,
            dynamic: !literal,
            line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    for (const d of program.getSyntacticDiagnostics(sf).slice(0, 20))
      issues.push({
        path,
        line: sf.getLineAndCharacterOfPosition(d.start ?? 0).line + 1,
        message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
      });
  }
  return { components: enriched, entities, imports, callSites, issues, version: ts.version };
}
export function checkGeneratedSource(
  source,
  { allowedImports = ['react', 'react/jsx-runtime'], maxBytes = 100000 } = {},
) {
  if (Buffer.byteLength(source) > maxBytes)
    return { passed: false, errors: ['Source exceeds size limit'] };
  const sf = ts.createSourceFile(
    'Generated.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const errors = [];
  const banned = new Set([
    'eval',
    'Function',
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'Worker',
    'importScripts',
    'require',
    'setInterval',
  ]);
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const target = node.moduleSpecifier.text;
      if (!allowedImports.includes(target)) errors.push(`Unapproved import: ${target}`);
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const name = node.expression.getText(sf);
      if (banned.has(name) || name === 'import')
        errors.push(`Forbidden executable capability: ${name}`);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ['cookie', 'localStorage', 'sessionStorage', 'innerHTML', 'outerHTML'].includes(
        node.name.text,
      )
    )
      errors.push(`Forbidden browser access: ${node.name.text}`);
    if (
      ts.isJsxAttribute(node) &&
      ['dangerouslySetInnerHTML', 'srcDoc'].includes(node.name.getText(sf))
    )
      errors.push(`Forbidden JSX attribute: ${node.name.getText(sf)}`);
    if (
      ts.isIdentifier(node) &&
      ['process', 'globalThis', 'window', 'document'].includes(node.text)
    )
      errors.push(`Forbidden ambient authority: ${node.text}`);
    ts.forEachChild(node, visit);
  }
  visit(sf);
  const output = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  errors.push(
    ...(output.diagnostics ?? [])
      .filter((d) => d.category === ts.DiagnosticCategory.Error)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')),
  );
  return {
    passed: errors.length === 0,
    errors: [...new Set(errors)],
    compiler: ts.version,
    check: 'AST/syntax—not a sandbox or host integration typecheck',
    javascriptHash: hash(output.outputText),
  };
}
