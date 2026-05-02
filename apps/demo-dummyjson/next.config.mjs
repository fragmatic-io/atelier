// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Next.js config mirroring `apps/demo/next.config.ts`. Workspace packages ship
 * raw TypeScript (their `main` points at `src/`), so Next must transpile them
 * and resolve `.js` import specifiers to their `.ts`/`.tsx` source files.
 */

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: [
    '@atelier/compiler',
    '@atelier/components',
    '@atelier/data-resolvers',
    '@atelier/policies',
    '@atelier/react',
    '@atelier/runtime',
    '@atelier/schemas',
    '@atelier/vault-client',
  ],
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
