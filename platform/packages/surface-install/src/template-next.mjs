// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import {
  environmentExample,
  designStyles,
  file,
  jsxText,
  quote,
  reactMount,
  relativeToRoot,
  routeSegments,
} from './template-shared.mjs';

function authorityTypeScript() {
  return `import type { HostBridgeOptions, Subject } from '@atelier/platform/host';

// Change this to true only after every function below is connected to your real
// authenticated server session and business authorization layer.
export const authorityConfigured = false;

export async function getAtelierSubject(): Promise<Subject> {
  throw new Error('ATELIER_AUTH_REQUIRED: map the current server session to an Atelier subject');
}

export const authorizeAtelier: HostBridgeOptions['authorize'] = async () => false;
export const atelierLoaders: NonNullable<HostBridgeOptions['loaders']> = {};
export const atelierExecutors: NonNullable<HostBridgeOptions['executors']> = {};
`;
}

function nextServer(install) {
  return `import { Buffer } from 'node:buffer';
import { HostBridge, SqliteActionLedger } from '@atelier/platform/host';
import { authorizeAtelier, atelierExecutors, atelierLoaders } from './authority';

const requiredNames = [
  'ATELIER_CONTROL_ORIGIN',
  'ATELIER_TENANT_ID',
  'ATELIER_PROJECT_ID',
  'ATELIER_HOST_TOKEN',
  'ATELIER_CONFIRMATION_KEY',
  'ATELIER_ACTION_LEDGER',
] as const;

export function environmentConfigured() {
  return requiredNames.every((name) => Boolean(process.env[name]));
}

let bridge: HostBridge | null = null;
export function getAtelierBridge() {
  if (!environmentConfigured()) {
    throw new Error('ATELIER_CONFIG_REQUIRED: configure every server-only Atelier variable');
  }
  bridge ??= new HostBridge({
    tenantId: process.env.ATELIER_TENANT_ID!,
    projectId: process.env.ATELIER_PROJECT_ID!,
    environment: ${quote(install.environment)},
    origin: process.env.ATELIER_CONTROL_ORIGIN!,
    token: process.env.ATELIER_HOST_TOKEN!,
    confirmationKey: Buffer.from(process.env.ATELIER_CONFIRMATION_KEY!, 'base64'),
    ledger: new SqliteActionLedger(process.env.ATELIER_ACTION_LEDGER!),
    authorize: authorizeAtelier,
    loaders: atelierLoaders,
    executors: atelierExecutors,
  });
  return bridge;
}
`;
}

function nextRouteHandler(root) {
  return `import { Buffer } from 'node:buffer';
import { NextRequest, NextResponse } from 'next/server';
import { authorityConfigured, getAtelierSubject } from '${root}lib/atelier/authority';
import { environmentConfigured, getAtelierBridge } from '${root}lib/atelier/server';

function unsafeKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(unsafeKey);
  return Object.entries(value).some(
    ([key, child]) => ['__proto__', 'prototype', 'constructor'].includes(key) || unsafeKey(child),
  );
}

async function readBody(request: NextRequest) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
    const error = new Error('Use application/json') as Error & { status: number; code: string };
    Object.assign(error, { status: 415, code: 'CONTENT_TYPE' });
    throw error;
  }
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > 100 * 1024) {
    const error = new Error('Request exceeds 100 KB') as Error & { status: number; code: string };
    Object.assign(error, { status: 413, code: 'BODY_TOO_LARGE' });
    throw error;
  }
  let body: unknown;
  try { body = JSON.parse(text); } catch {
    const error = new Error('Request is not valid JSON') as Error & { status: number; code: string };
    Object.assign(error, { status: 400, code: 'INVALID_JSON' });
    throw error;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || unsafeKey(body)) {
    const error = new Error('Request must be a safe JSON object') as Error & { status: number; code: string };
    Object.assign(error, { status: 400, code: 'INVALID_JSON' });
    throw error;
  }
  return body as Record<string, unknown>;
}

function failure(error: unknown) {
  const value = error as { status?: number; code?: string; message?: string };
  return NextResponse.json(
    { error: { code: value.code ?? 'ATELIER_BRIDGE_ERROR', message: value.message ?? 'Bridge failed' } },
    { status: value.status ?? 500 },
  );
}

export async function GET(_request: NextRequest, context: { params: Promise<{ operation: string }> }) {
  const { operation } = await context.params;
  if (operation !== 'install-health') return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  return NextResponse.json({ environmentConfigured: environmentConfigured(), authorityConfigured });
}

export async function POST(request: NextRequest, context: { params: Promise<{ operation: string }> }) {
  try {
    const requestOrigin = request.headers.get('origin');
    if (requestOrigin !== new URL(request.url).origin)
      return NextResponse.json({ error: { code: 'CSRF_FAILED', message: 'Exact same-origin header required' } }, { status: 403 });
    const { operation } = await context.params;
    const body = await readBody(request);
    const subject = await getAtelierSubject();
    const bridge = getAtelierBridge();
    if (operation === 'resolve') return NextResponse.json(await bridge.resolve(subject, body.slotId, body.context));
    if (operation === 'load') return NextResponse.json(await bridge.load({ ...body, subject }));
    if (operation === 'confirm') return NextResponse.json(await bridge.confirm({ ...body, subject }));
    if (operation === 'dispatch') return NextResponse.json(await bridge.dispatch({ ...body, subject }));
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}
`;
}

export function nextBundle(install) {
  const segment = routeSegments(install.routePath);
  const routeDepth = install.routePath.split('/').filter(Boolean).length;
  const bridgeSegment = routeSegments(install.bridgePath);
  const bridgeDepth = install.bridgePath.split('/').filter(Boolean).length;
  const routeFiles =
    install.mode === 'route'
      ? [
          file(
            `app/${segment}/page.tsx`,
            'Customer-owned route',
            `import { AtelierSurfaceMount } from '${relativeToRoot(routeDepth)}components/atelier/AtelierSurfaceMount';\n\nexport default function AtelierWorkspacePage() {\n  return <main aria-label={${quote(install.navLabel)}}><AtelierSurfaceMount /></main>;\n}\n`,
          ),
          file(
            'components/atelier/AtelierNavLink.tsx',
            'Navigation link owned by the customer app',
            `import Link from 'next/link';\n\nexport function AtelierNavLink() {\n  return <Link href=${quote(install.routePath)}>${jsxText(install.navLabel)}</Link>;\n}\n`,
          ),
        ]
      : [];
  const placementPatches =
    install.mode === 'route'
      ? [
          {
            target: 'your existing navigation component',
            purpose: 'Expose the customer-owned route',
            snippet: `import { AtelierNavLink } from '<relative-path>/components/atelier/AtelierNavLink';\n// Replace <relative-path>, then place <AtelierNavLink /> in the approved navigation group.`,
          },
        ]
      : [
          {
            target: `the existing Next.js page for ${install.routePath}`,
            purpose: `Mount the approved ${install.mode} surface without replacing the page`,
            snippet: `import { AtelierSurfaceMount } from '<relative-path>/components/atelier/AtelierSurfaceMount';\n// Replace <relative-path>, then place <AtelierSurfaceMount context={pageContext} /> at the approved insertion point.`,
          },
        ];
  return {
    files: [
      file(
        'components/atelier/AtelierSurfaceMount.tsx',
        'Client-owned surface mount and factual install receipt',
        reactMount(install, { next: true }),
      ),
      file(
        'components/atelier/atelier-design.css',
        'Reviewed host design contract styles',
        designStyles(install),
      ),
      ...routeFiles,
      file(
        'lib/atelier/authority.ts',
        'Fail-closed customer authority adapter',
        authorityTypeScript(),
      ),
      file('lib/atelier/server.ts', 'Server-only HostBridge', nextServer(install)),
      file(
        `app/${bridgeSegment}/[operation]/route.ts`,
        'Same-origin browser-to-host bridge',
        nextRouteHandler(relativeToRoot(bridgeDepth + 1)),
      ),
      file(
        'atelier.env.example',
        'Required server-only configuration',
        environmentExample(install),
      ),
    ],
    patches: [
      {
        target: 'app/layout.tsx',
        purpose: 'Load scoped surface styles once',
        snippet: `import '@atelier/platform/surface.css';\nimport '../components/atelier/atelier-design.css';`,
      },
      ...placementPatches,
    ],
  };
}
