// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import ts from 'typescript';
import { createRequire } from 'node:module';
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  readdir,
  lstat,
  realpath,
} from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import postcss from 'postcss';
const require = createRequire(import.meta.url);
export const FORGE_VERSION = '2.3.0-rc.1';
const fail = (code, message, details) => {
  throw Object.assign(new Error(message), { code, status: 400, details });
};
const canonical = (x) =>
  JSON.stringify(x, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
const digest = (x) =>
  createHash('sha256')
    .update(typeof x === 'string' ? x : canonical(x))
    .digest('hex');
function plain(x, d = 0) {
  if (d > 35) fail('DEPTH_LIMIT', 'Artifact nesting exceeds limit');
  if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      if (['__proto__', 'prototype', 'constructor'].includes(k))
        fail('PROTOTYPE_KEY', 'Forbidden object key');
      plain(v, d + 1);
    }
  }
}
const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
addFormats(ajv, { mode: 'fast' });
export function validateData(value, schema) {
  plain(value);
  plain(schema);
  const serialized = canonical(schema);
  if (serialized.length > 30000 || /"(?:pattern|patternProperties|\$async)"/.test(serialized))
    fail('SCHEMA_LIMIT', 'Schema is too large or uses unsupported unbounded patterns');
  if (/"\$ref"\s*:\s*"(?!#)/.test(serialized))
    fail('SCHEMA_REFERENCE', 'Only local schema references are permitted');
  let check;
  try {
    check = ajv.compile(schema);
  } catch (e) {
    fail('DATA_SCHEMA', e.message);
  }
  if (!check(value))
    fail('DATA_CONTRACT', 'Value does not match the reviewed data contract', check.errors);
  return value;
}
const S = { type: 'string', minLength: 1, maxLength: 200 };
export const SOURCE_KIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: S,
    name: S,
    description: { type: 'string', maxLength: 1500 },
    target: { enum: ['react'] },
    grounding: { enum: ['bound', 'static', 'generated'] },
    source: { type: 'string', minLength: 20, maxLength: 100000 },
    css: { type: 'string', maxLength: 40000 },
    modules: { type: 'object', additionalProperties: { type: 'string', maxLength: 80000 } },
    dataSchema: { type: 'object', additionalProperties: true },
    actions: { type: 'array', maxItems: 16, items: S },
    sampleData: { type: 'object', additionalProperties: true },
    tasks: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: S,
          steps: {
            type: 'array',
            minItems: 1,
            maxItems: 15,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                op: { enum: ['click', 'fill', 'select', 'press'] },
                selector: S,
                value: { type: 'string', maxLength: 1000 },
              },
              required: ['op', 'selector', 'value'],
            },
          },
          expect: {
            type: 'object',
            additionalProperties: false,
            properties: { selector: S, text: { type: 'string', maxLength: 1000 } },
            required: ['selector', 'text'],
          },
        },
        required: ['name', 'steps', 'expect'],
      },
    },
  },
  required: [
    'id',
    'name',
    'description',
    'target',
    'grounding',
    'source',
    'css',
    'modules',
    'dataSchema',
    'actions',
    'sampleData',
    'tasks',
  ],
};
export const MODEL_KIT_SCHEMA = {
  ...SOURCE_KIT_SCHEMA,
  properties: {
    ...Object.fromEntries(
      Object.entries(SOURCE_KIT_SCHEMA.properties).filter(
        ([k]) => !['modules', 'dataSchema', 'sampleData'].includes(k),
      ),
    ),
    modulesJson: { type: 'string', maxLength: 160000 },
    dataSchemaJson: { type: 'string', maxLength: 30000 },
    sampleDataJson: { type: 'string', maxLength: 40000 },
  },
  required: SOURCE_KIT_SCHEMA.required.map((k) =>
    ['modules', 'dataSchema', 'sampleData'].includes(k) ? k + 'Json' : k,
  ),
};
export const SOURCE_MODEL_SCHEMA = MODEL_KIT_SCHEMA;
export function decodeModelKit(x) {
  const { modulesJson, dataSchemaJson, sampleDataJson, ...rest } = x;
  return {
    ...rest,
    modules: JSON.parse(modulesJson),
    dataSchema: JSON.parse(dataSchemaJson),
    sampleData: JSON.parse(sampleDataJson),
  };
}
const forbidden = new Set([
  'globalThis',
  'window',
  'document',
  'parent',
  'top',
  'self',
  'opener',
  'frames',
  'location',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Worker',
  'SharedWorker',
  'eval',
  'Function',
  'AsyncFunction',
  'require',
  'process',
  'module',
  'Buffer',
  'Deno',
  'Bun',
  'constructor',
  'prototype',
  '__proto__',
  'Reflect',
  'Proxy',
  'getPrototypeOf',
  'setPrototypeOf',
  'getOwnPropertyNames',
  'getOwnPropertySymbols',
  'getOwnPropertyDescriptors',
  'getOwnPropertyDescriptor',
  'defineProperty',
  'defineProperties',
  'caller',
  'callee',
  'arguments',
  '__atelierStep',
  '__atelierIndex',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'postMessage',
  'Image',
  'Audio',
  'SharedArrayBuffer',
  'Atomics',
]);
const tags = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'base',
  'link',
  'meta',
  'style',
  'foreignobject',
]);
function validateSource(name, source, moduleNames) {
  if (/@ts-(?:ignore|nocheck|expect-error)|@jsxImportSource|<reference\s/i.test(source))
    fail('SOURCE_SUPPRESSION', 'Compiler suppressions and external references are not permitted');
  const tree = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
    issues = [];
  function visit(n) {
    if (ts.isImportDeclaration(n)) {
      const id = n.moduleSpecifier.text;
      if (id !== 'react' && !moduleNames.includes(id)) issues.push('Unregistered import: ' + id);
    }
    if (ts.isImportEqualsDeclaration(n) || n.kind === ts.SyntaxKind.ImportKeyword)
      issues.push('Dynamic import is forbidden');
    if (n.kind === ts.SyntaxKind.ThisKeyword || ts.isComputedPropertyName(n))
      issues.push('This/computed declarations are unsupported');
    if (ts.isJsxSpreadAttribute(n)) issues.push('Explicit JSX props are required');
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n))
      if (tags.has(n.tagName.getText(tree).toLowerCase())) issues.push('Forbidden element');
    if (ts.isJsxAttribute(n)) {
      const k = n.name.getText(tree);
      if (
        [
          'dangerouslySetInnerHTML',
          'innerHTML',
          'outerHTML',
          'ref',
          'src',
          'srcSet',
          'srcDoc',
          'action',
          'formAction',
        ].includes(k)
      )
        issues.push('Forbidden JSX attribute: ' + k);
      if (
        k === 'href' &&
        (!n.initializer ||
          !ts.isStringLiteral(n.initializer) ||
          !n.initializer.text.startsWith('#'))
      )
        issues.push('Only document-fragment links are supported');
    }
    ts.forEachChild(n, visit);
  }
  visit(tree);
  if (tree.parseDiagnostics.length) fail('SOURCE_SYNTAX', 'Invalid TSX', tree.parseDiagnostics);
  if (issues.length)
    fail('SOURCE_POLICY', 'Source violates its isolated execution target', [...new Set(issues)]);
  return tree;
}
function transformer(context) {
  const f = context.factory,
    step = () =>
      f.createExpressionStatement(
        f.createCallExpression(f.createIdentifier('__atelierStep'), undefined, []),
      ),
    body = (b) =>
      ts.isBlock(b)
        ? f.updateBlock(b, [step(), ...b.statements])
        : f.createBlock([step(), b], true);
  function visit(node) {
    const n = ts.visitEachChild(node, visit, context);
    if (ts.isElementAccessExpression(n))
      return f.updateElementAccessExpression(
        n,
        n.expression,
        f.createCallExpression(f.createIdentifier('__atelierIndex'), undefined, [
          n.argumentExpression,
        ]),
      );
    if (ts.isForStatement(n))
      return f.updateForStatement(n, n.initializer, n.condition, n.incrementor, body(n.statement));
    if (ts.isForOfStatement(n))
      return f.updateForOfStatement(
        n,
        n.awaitModifier,
        n.initializer,
        n.expression,
        body(n.statement),
      );
    if (ts.isForInStatement(n))
      return f.updateForInStatement(n, n.initializer, n.expression, body(n.statement));
    if (ts.isWhileStatement(n)) return f.updateWhileStatement(n, n.expression, body(n.statement));
    if (ts.isDoStatement(n)) return f.updateDoStatement(n, body(n.statement), n.expression);
    if (ts.isArrowFunction(n))
      return f.updateArrowFunction(
        n,
        n.modifiers,
        n.typeParameters,
        n.parameters,
        n.type,
        n.equalsGreaterThanToken,
        ts.isBlock(n.body)
          ? body(n.body)
          : f.createBlock([step(), f.createReturnStatement(n.body)], true),
      );
    if (ts.isFunctionDeclaration(n) && n.body)
      return f.updateFunctionDeclaration(
        n,
        n.modifiers,
        n.asteriskToken,
        n.name,
        n.typeParameters,
        n.parameters,
        n.type,
        body(n.body),
      );
    if (ts.isFunctionExpression(n))
      return f.updateFunctionExpression(
        n,
        n.modifiers,
        n.asteriskToken,
        n.name,
        n.typeParameters,
        n.parameters,
        n.type,
        body(n.body),
      );
    return n;
  }
  return (root) => ts.visitNode(root, visit);
}
function semantic(sources, folder) {
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    noImplicitAny: false,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
    types: ['react'],
    typeRoots: [resolve(dirname(require.resolve('@types/react/package.json')), '..')],
    baseUrl: folder,
    paths: { '@project/*': ['modules/*'] },
  };
  const base = ts.createCompilerHost(options);
  const normalized = new Map(Object.entries(sources).map(([k, v]) => [join(folder, k), v]));
  const host = {
    ...base,
    fileExists: (p) => normalized.has(p) || base.fileExists(p),
    readFile: (p) => normalized.get(p) ?? base.readFile(p),
    directoryExists: (p) =>
      p === folder || p === join(folder, 'modules') || base.directoryExists?.(p),
    getSourceFile: (p, lang, onerror, create) =>
      normalized.has(p)
        ? ts.createSourceFile(p, normalized.get(p), lang, true, ts.ScriptKind.TSX)
        : base.getSourceFile(p, lang, onerror, create),
  };
  const program = ts.createProgram([...normalized.keys()], options, host),
    checker = program.getTypeChecker(),
    issues = [],
    dangerousProperties = new Set(['constructor', 'prototype', '__proto__']);
  for (const [name] of normalized) {
    const sf = program.getSourceFile(name);
    function visit(n) {
      if (ts.isIdentifier(n) && forbidden.has(n.text)) {
        const symbol = checker.getSymbolAtLocation(n),
          declaredHere = symbol?.declarations?.some((d) =>
            normalized.has(d.getSourceFile().fileName),
          );
        if (!declaredHere)
          issues.push({
            file: name,
            code: 'AMBIENT_CAPABILITY',
            message: 'Ambient capability: ' + n.text,
          });
      }
      if (ts.isPropertyAccessExpression(n) && dangerousProperties.has(n.name.text))
        issues.push({
          file: name,
          code: 'PROTOTYPE_ACCESS',
          message: 'Prototype-chain property access is forbidden',
        });
      if (ts.isElementAccessExpression(n)) {
        const type = checker.getTypeAtLocation(n.argumentExpression);
        if (!(type.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)))
          issues.push({
            file: name,
            code: 'DYNAMIC_PROPERTY',
            message: 'Computed access must use a numeric array index',
          });
      }
      ts.forEachChild(n, visit);
    }
    visit(sf);
  }
  if (issues.length) fail('SOURCE_POLICY', 'Source violates its isolated execution target', issues);
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((x) => x.category === ts.DiagnosticCategory.Error);
  if (errors.length)
    fail(
      'SOURCE_TYPES',
      'Semantic TypeScript check failed',
      errors.slice(0, 30).map((x) => ({
        file: x.file?.fileName,
        line:
          x.start !== undefined ? x.file?.getLineAndCharacterOfPosition(x.start).line + 1 : null,
        code: x.code,
        message: ts.flattenDiagnosticMessageText(x.messageText, '\n'),
      })),
    );
  return {
    passed: true,
    compiler: ts.version,
    noImplicitAny: false,
    allowSyntheticDefaultImports: true,
  };
}
const runtimeVersion = 'react-iframe-events-v2';
const contractHash = () =>
  digest({
    forge: FORGE_VERSION,
    runtimeVersion,
    react: require('react/package.json').version,
    reactDom: require('react-dom/package.json').version,
    compiler: ts.version,
    validate: validateSource.toString(),
    transformer: transformer.toString(),
    sandbox: sandboxDocument.toString(),
  });
export async function compileSourceKit(
  value,
  { projectVersion = 'unbound', tokens = {}, approvedActions = [] } = {},
) {
  const kit = structuredClone(value);
  plain(kit);
  validateData(kit, SOURCE_KIT_SCHEMA);
  if (!/^[a-z][a-z0-9-]{1,79}$/.test(kit.id)) fail('KIT_ID', 'Use a stable lowercase component ID');
  if (canonical(kit).length > 320000) fail('SOURCE_SIZE', 'Kit exceeds its source budget');
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-proj-|sk-ant-api\d+-)[\w-]{24,}/.test(
      canonical(kit),
    )
  )
    fail('SECRET_DETECTED', 'Do not place credentials in source artifacts');
  if (!kit.actions.every((x) => approvedActions.includes(x)))
    fail('UNAPPROVED_ACTION', 'Component expanded its approved action scope');
  if (
    Object.keys(kit.modules).length > 12 ||
    Object.keys(kit.modules).some((k) => !/^[A-Z][A-Za-z0-9]{0,60}$/.test(k))
  )
    fail('MODULE_NAMES', 'Use at most twelve named project modules');
  let css;
  try {
    css = postcss.parse(kit.css);
  } catch (e) {
    fail('CSS_SYNTAX', e.message);
  }
  css.walkAtRules((n) => {
    if (!['media', 'supports', 'keyframes', 'container', 'layer'].includes(n.name))
      fail('CSS_POLICY', 'Unsupported stylesheet directive');
  });
  if (/url\s*\(|expression\s*\(|@import|behavior\s*:|\\|<\/style/i.test(kit.css))
    fail('CSS_EGRESS', 'No stylesheet egress or escape sequences are allowed');
  validateData(kit.sampleData, kit.dataSchema);
  const sources = {
    'Component.tsx': kit.source,
    ...Object.fromEntries(
      Object.entries(kit.modules).map(([k, v]) => ['modules/' + k + '.tsx', v]),
    ),
  };
  const folder = resolve(dirname(require.resolve('react/package.json')), '../../.atelier-virtual');
  const names = Object.keys(kit.modules).map((k) => '@project/' + k);
  for (const [k, v] of Object.entries(sources)) validateSource(k, v, names);
  const typeEvidence = semantic(sources, folder);
  const sourceJS = {};
  for (const [k, v] of Object.entries(sources)) {
    sourceJS[k] = ts.transpileModule(v, {
      fileName: k,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
      transformers: { before: [transformer] },
    }).outputText;
  }
  const bootstrap = `import React from 'react';import {createRoot} from 'react-dom/client';import Component from '@kit/main';const ctx=globalThis.__ATELIER_FRAME;delete globalThis.__ATELIER_FRAME;let work=0;globalThis.__atelierStep=()=>{if(++work>100000)throw new Error('Component work budget exceeded');};globalThis.__atelierIndex=v=>{if(!Number.isSafeInteger(v)||v<0)throw new Error('Only nonnegative array indexes are supported');return v;};for(const e of ['click','input','change','keydown'])addEventListener(e,()=>{work=0;},{capture:true});const send=(type,payload)=>parent.postMessage({atelier:1,channel:ctx.channel,type,payload},'*');const pending=new Map();let sequence=0;const emit=(capabilityId,input)=>{if(!ctx.actions.includes(capabilityId))return Promise.reject(new Error('Action not declared'));if(pending.size>=8)return Promise.reject(new Error('Too many actions'));const requestId=ctx.channel.slice(0,14)+'_'+(++sequence);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Outcome uncertain; reconcile with host before retrying'));},30000);pending.set(requestId,{resolve,reject,timer});send('action',{requestId,capabilityId,input});});};addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!==ctx.channel||e.data?.atelier!==1)return;const m=e.data;if(m.type==='action-result'){const q=pending.get(m.payload.requestId);if(q){clearTimeout(q.timer);pending.delete(m.payload.requestId);m.payload.error?q.reject(new Error(m.payload.error)):q.resolve(m.payload.result);}}});addEventListener('submit',e=>e.preventDefault(),true);addEventListener('click',e=>{const a=e.target?.closest?.('a');if(a&&!a.getAttribute('href')?.startsWith('#'))e.preventDefault();},true);addEventListener('error',e=>send('error',{message:String(e.message).slice(0,300)}));addEventListener('unhandledrejection',e=>send('error',{message:String(e.reason?.message??e.reason).slice(0,300)}));class Boundary extends React.Component{constructor(props){super(props);this.state={error:null};}static getDerivedStateFromError(e){return{error:e.message};}componentDidCatch(e){send('error',{message:e.message});}render(){return this.state.error?React.createElement('p',{role:'alert'},'This component could not render.'):this.props.children;}}createRoot(document.getElementById('root')).render(React.createElement(Boundary,null,React.createElement(Component,{data:ctx.data,state:ctx.state,context:{},emit})));requestAnimationFrame(()=>requestAnimationFrame(()=>send('ready',{digest:ctx.digest})));`;
  const result = await build({
    stdin: { contents: bootstrap, resolveDir: folder, sourcefile: 'bootstrap.jsx', loader: 'jsx' },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    write: false,
    minify: true,
    metafile: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'project-artifacts',
        setup(b) {
          b.onResolve({ filter: /^@kit\/main$/ }, () => ({
            path: 'Component.tsx',
            namespace: 'kit',
          }));
          b.onResolve({ filter: /^@project\// }, (args) => {
            const key = args.path.slice(9);
            if (!Object.hasOwn(kit.modules, key))
              return { errors: [{ text: 'Unregistered project module' }] };
            return { path: 'modules/' + key + '.tsx', namespace: 'kit' };
          });
          b.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, (args) => ({
            path: require.resolve(args.path),
          }));
          b.onLoad({ filter: /.*/, namespace: 'kit' }, (args) => ({
            contents: sourceJS[args.path],
            loader: 'js',
            resolveDir: folder,
          }));
        },
      },
    ],
  });
  const javascript = result.outputFiles[0].text;
  if (javascript.length > 1600000) fail('BUNDLE_LIMIT', 'Component bundle exceeds budget');
  const body = {
    version: FORGE_VERSION,
    target: 'react',
    kit,
    projectVersion,
    tokens,
    javascript,
    typeEvidence,
    executionContractHash: contractHash(),
  };
  return { ...body, digest: digest(body) };
}
export function verifyCompilation(compiled) {
  plain(compiled);
  const { digest: claimed, ...body } = compiled;
  if (claimed !== digest(body)) fail('COMPONENT_TAMPER', 'Compiled component integrity failed');
  if (body.executionContractHash !== contractHash())
    fail('EXECUTION_CONTRACT_CHANGED', 'Rebuild after execution-contract changes');
  return compiled;
}
const json = (x) =>
  JSON.stringify(x)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x],
  );
export function sandboxDocument(
  compiled,
  {
    data = compiled.kit.sampleData,
    state = 'ready',
    theme = 'light',
    direction = 'ltr',
    channel = randomBytes(24).toString('base64url'),
  } = {},
) {
  verifyCompilation(compiled);
  validateData(data, compiled.kit.dataSchema);
  if (canonical(data).length > 262144) fail('ARTIFACT_SIZE', 'Rendered data exceeds 256 KB');
  const nonce = randomBytes(24).toString('base64');
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'none'; font-src 'none'; img-src data:; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'`;
  const tokenCSS = Object.entries(compiled.tokens ?? {})
    .filter(
      ([k, v]) =>
        /^[a-z][a-z0-9-]*$/.test(k) &&
        typeof v === 'string' &&
        /^[a-zA-Z0-9#().,% /-]+$/.test(v) &&
        !v.includes('url'),
    )
    .map(([k, v]) => `--${k}:${v};`)
    .join('');
  return {
    channel,
    csp: csp + '; sandbox allow-scripts',
    html: `<!doctype html><html lang="en" dir="${direction === 'rtl' ? 'rtl' : 'ltr'}" data-theme="${theme === 'dark' ? 'dark' : 'light'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${esc(compiled.kit.name)}</title><style>:root{color-scheme:light;--surface:#fff;--soft:#f1f5fa;--text:#17283c;--muted:#62738a;--primary:#3863d4;--border:#dae2ed;${tokenCSS}}[data-theme=dark]{color-scheme:dark;--surface:#142034;--soft:#1e2f47;--text:#e9effa;--muted:#a5b5cd;--border:#34465f}*{box-sizing:border-box}body{margin:0;background:var(--surface);color:var(--text);font:15px/1.5 system-ui,sans-serif}button,input,select,textarea{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--primary);outline-offset:3px}svg{max-width:100%}button:disabled{opacity:.6;cursor:not-allowed}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}${compiled.kit.css}</style></head><body><main id="root"></main><script nonce="${nonce}">globalThis.__ATELIER_FRAME=${json({ channel, data, state, actions: compiled.kit.actions, digest: compiled.digest })};${compiled.javascript.replace(/<\/script/gi, '<\\/script')}</script></body></html>`,
  };
}
export async function exportSourceKit(compiled, destination) {
  verifyCompilation(compiled);
  const out = resolve(destination);
  if ((await realpath(dirname(out))) !== dirname(out))
    fail('SYMLINK_EXPORT', 'Export through a real parent directory');
  await mkdir(out, { recursive: false, mode: 0o700 });
  const files = {
    'Component.tsx': compiled.kit.source,
    'component.css': compiled.kit.css,
    'contract.json': JSON.stringify(
      {
        id: compiled.kit.id,
        target: 'react',
        dataSchema: compiled.kit.dataSchema,
        actions: compiled.kit.actions,
        digest: compiled.digest,
      },
      null,
      2,
    ),
    'acceptance.json': JSON.stringify(
      { sampleData: compiled.kit.sampleData, tasks: compiled.kit.tasks },
      null,
      2,
    ),
    'README.md': `# ${compiled.kit.name}\n\nReal React source with @project module aliases. Configure aliases in your host build. Editing invalidates previous approval: rebuild, evaluate, review. No provider credentials belong in this export.\n`,
    ...Object.fromEntries(
      Object.entries(compiled.kit.modules).map(([k, v]) => ['modules/' + k + '.tsx', v]),
    ),
  };
  const manifest = [];
  try {
    for (const [path, text] of Object.entries(files)) {
      await mkdir(dirname(join(out, path)), { recursive: true });
      await writeFile(join(out, path), text, { flag: 'wx', mode: 0o600 });
      manifest.push({ path, sha256: digest(text) });
    }
    await writeFile(join(out, 'FILES.json'), JSON.stringify(manifest, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (e) {
    await rm(out, { recursive: true, force: true });
    throw e;
  }
  return { directory: out, files: manifest };
}
export async function verifyExport(destination) {
  const out = resolve(destination);
  if ((await realpath(out)) !== out) fail('SYMLINK_EXPORT', 'No symlink export roots');
  const info = await lstat(join(out, 'FILES.json'));
  if (!info.isFile() || info.isSymbolicLink() || info.size > 20000)
    fail('MANIFEST_INVALID', 'Invalid manifest');
  const manifest = JSON.parse(await readFile(join(out, 'FILES.json'), 'utf8'));
  if (!Array.isArray(manifest) || manifest.length > 30)
    fail('MANIFEST_INVALID', 'Invalid manifest');
  const expected = new Set(['FILES.json']);
  for (const entry of manifest) {
    if (
      !/^(?:modules\/)?[\w.-]+$/.test(entry.path) ||
      entry.path.includes('..') ||
      expected.has(entry.path)
    )
      fail('MANIFEST_INVALID', 'Unsafe or duplicate path');
    expected.add(entry.path);
    const p = join(out, entry.path),
      s = await lstat(p);
    if (!s.isFile() || s.isSymbolicLink() || s.size > 200000)
      fail('SYMLINK_EXPORT', 'Only bounded regular files are allowed');
    if (digest(await readFile(p, 'utf8')) !== entry.sha256)
      fail('EXPORT_TAMPER', 'Export content changed');
  }
  async function scan(dir, prefix = '') {
    for (const x of await readdir(dir, { withFileTypes: true })) {
      const name = prefix + x.name;
      if (x.isSymbolicLink()) fail('SYMLINK_EXPORT', 'Symlink in export');
      if (x.isDirectory()) {
        if (name !== 'modules') fail('EXPORT_EXTRA', 'Unexpected directory');
        await scan(join(dir, x.name), name + '/');
      } else if (!expected.has(name)) fail('EXPORT_EXTRA', 'Unlisted file');
    }
  }
  await scan(out);
  return { verified: manifest.length };
}
