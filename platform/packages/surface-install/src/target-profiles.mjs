// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { assert } from '../../control-plane/src/util.mjs';

export const SURFACE_TARGET_PROFILES = Object.freeze({
  'nextjs-app': Object.freeze({
    id: 'nextjs-app',
    label: 'Next.js App Router',
    clientRuntime: 'react',
    clientLanguage: 'typescript',
    buildTool: 'nextjs',
    serverFramework: 'nextjs',
  }),
  'react-router': Object.freeze({
    id: 'react-router',
    label: 'React Router + Express',
    clientRuntime: 'react',
    clientLanguage: 'typescript',
    buildTool: 'framework-neutral',
    serverFramework: 'express',
  }),
  dom: Object.freeze({
    id: 'dom',
    label: 'Framework-neutral DOM + Node',
    clientRuntime: 'dom',
    clientLanguage: 'javascript',
    buildTool: 'framework-neutral',
    serverFramework: 'express',
  }),
  'vite-react-fastapi': Object.freeze({
    id: 'vite-react-fastapi',
    label: 'Vite React + FastAPI',
    clientRuntime: 'react',
    clientLanguage: 'typescript',
    buildTool: 'vite',
    serverFramework: 'fastapi',
  }),
});

export const SURFACE_TARGETS = Object.freeze(Object.keys(SURFACE_TARGET_PROFILES));

export function surfaceTargetProfile(id) {
  const profile = SURFACE_TARGET_PROFILES[id];
  assert(profile, 400, 'INSTALL_TARGET', 'Choose a supported client and server target');
  return profile;
}
