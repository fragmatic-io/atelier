// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The workspace packages ship raw TypeScript (their `main` points at `src/`).
  // Next.js needs to transpile them in this app.
  transpilePackages: [
    '@cir/compiler',
    '@cir/components',
    '@cir/policies',
    '@cir/react',
    '@cir/runtime',
    '@cir/schemas',
  ],
  // CIR packages are authored as TS NodeNext, which requires `.js` extensions
  // in import specifiers even when the source file is `.ts`/`.tsx`. Webpack
  // won't synthesize that resolution by default — `extensionAlias` tells it to
  // try the matching TS extension before falling back to the literal JS path.
  webpack: (cfg) => {
    cfg.resolve = cfg.resolve ?? {};
    cfg.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return cfg;
  },
};

export default config;
