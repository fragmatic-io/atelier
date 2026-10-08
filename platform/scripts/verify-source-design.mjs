#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { compileSourceKit, resolveDesignContext, sandboxDocument } from '../packages/source-forge/src/compiler.mjs';
import { resolveBrowserPython } from './run-browser-integration.mjs';

const execute = promisify(execFile);

/** Synthetic, deterministic probe; no customer inputs or review bypasses. */
export async function prepareSourceDesignProbe() {
  const designContext = resolveDesignContext({
    model: { projectVersion: 'source-design-browser-probe-1' },
    approvedContract: {
      viewport: { bucket: 'desktop', colorScheme: 'dark' },
      roles: {
        root: { fontFamily: '"Host Probe", sans-serif', fontSize: '17px', fontWeight: '500', lineHeight: '1.6', color: '#ecf0fa', backgroundColor: '#11191b' },
        button: { backgroundColor: '#a1ccb8', color: '#11221a', paddingBlock: '11px', paddingInline: '19px' },
        nav: { gap: '23px' },
      },
    },
  });
  const kit = {
    id: 'host-design-probe', name: 'Host design probe', description: 'Verify isolated host design delivery with synthetic inputs.',
    target: 'react', grounding: 'static',
    source: `import React,{useState} from 'react';
export default function DesignProbe({context}) {
  const [count,setCount]=useState(0);
  const frozen=Object.isFrozen(context)&&Object.isFrozen(context.designContext)&&Object.isFrozen(context.tokens)&&Object.isFrozen(context.designContext.roles.root);
  return <section className="probe-shell"><p id="context-hash">{context.designContext.hash}</p><p id="context-frozen">{String(frozen)}</p><p id="context-theme">{context.theme}</p><nav id="design-nav" aria-label="Probe navigation"><button className="probe-button" id="increment" onClick={()=>setCount(value=>value+1)}>Increment</button></nav><output id="count">{count}</output></section>;
}`,
    css: '.probe-shell{padding:24px}.probe-shell .probe-button{padding:1px 2px;background:#fff;color:#000}nav{display:flex;gap:1px}',
    modules: {}, dataSchema: { type: 'object', additionalProperties: false }, sampleData: {}, actions: [],
    tasks: [{ name: 'Increment local state', steps: [{ op: 'click', selector: '#increment', value: '' }], expect: { selector: '#count', text: '1' } }],
  };
  const compiled = await compileSourceKit(kit, { designContext });
  return { ...sandboxDocument(compiled), compiledDigest: compiled.digest, designContextHash: designContext.hash };
}

export async function runSourceDesignProbe() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const python = await resolveBrowserPython({ root });
  const payload = await prepareSourceDesignProbe();
  const directory = await mkdtemp(join(tmpdir(), 'atelier-source-design-'));
  try {
    const path = join(directory, 'input.json');
    await writeFile(path, JSON.stringify(payload), { mode: 0o600 });
    const { stdout } = await execute(python, [fileURLToPath(new URL('./verify-source-design.py', import.meta.url)), path], {
      timeout: 45000, maxBuffer: 512 * 1024, shell: false,
    });
    return JSON.parse(stdout);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await runSourceDesignProbe(), null, 2));
  } catch (error) {
    console.error(error.stderr?.trim() || error.message);
    process.exitCode = 1;
  }
}
