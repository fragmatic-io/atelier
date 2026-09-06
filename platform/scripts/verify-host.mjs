// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/** Run in the actual host checkout. Does not install or execute project scripts. */
import ts from '../vendor/typescript/lib/typescript.js';
import { resolve } from 'node:path';
const root = resolve(process.argv[2] ?? '.'),
  path = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
if (!path) {
  console.error('No tsconfig.json found in host');
  process.exit(1);
}
const read = ts.readConfigFile(path, ts.sys.readFile);
if (read.error) {
  console.error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
  process.exit(1);
}
const config = ts.parseJsonConfigFileContent(read.config, ts.sys, root, { noEmit: true });
const program = ts.createProgram(config.fileNames, config.options);
const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
console.log(
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root,
    getCanonicalFileName: (p) => p,
    getNewLine: () => '\n',
  }),
);
console.log(
  JSON.stringify({
    compiler: ts.version,
    hostRoot: root,
    passed: diagnostics.length === 0,
    diagnostics: diagnostics.length,
  }),
);
process.exitCode = diagnostics.length ? 1 : 0;
