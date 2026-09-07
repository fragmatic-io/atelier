// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { assert } from '../../control-plane/src/util.mjs';

export const SURFACE_TARGET_PROFILES = Object.freeze({
  'hosted-script': Object.freeze({
    id: 'hosted-script',
    label: 'Atelier hosted script',
    clientRuntime: 'browser',
    clientLanguage: 'javascript',
    buildTool: 'none',
    serverFramework: 'none',
  }),
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

// Older rows remain displayable and revocable after the hosted-runtime migration,
// but new installs have one supported product path.
export const SURFACE_TARGETS = Object.freeze(['hosted-script']);

export function surfaceTargetProfile(id) {
  const profile = SURFACE_TARGET_PROFILES[id];
  assert(profile, 400, 'INSTALL_TARGET', 'Choose a supported client and server target');
  return profile;
}
