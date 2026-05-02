// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Inline string templates used by `cir init`. Kept as plain string-returning
 * functions (no mustache / handlebars) to match the rest of the repo's
 * "no UX libraries" stance.
 *
 * Limitation (Wave 2): every template assumes Next.js 15. A Vite variant
 * will land in Wave 3+ when the runtime hooks ship a Vite-friendly
 * adapter.
 */

export interface InitContext {
  /** Project name, used as the `package.json` `name`. */
  appName: string;
}

export function packageJsonTemplate(ctx: InitContext): string {
  const pkg = {
    name: ctx.appName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      next: '^15.1.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
    devDependencies: {
      '@types/node': '^22.10.0',
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
      typescript: '^5.7.2',
    },
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function pageTemplate(ctx: InitContext): string {
  return `// SPDX-License-Identifier: MIT
export default function Page() {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>${ctx.appName}</h1>
      <p>
        Welcome to your new CIR app. Edit <code>app/page.tsx</code> and start
        composing capabilities, skills, and components.
      </p>
      <ul>
        <li>
          Capabilities live in <code>capabilities/</code>
        </li>
        <li>
          Skills live in <code>skills/</code>
        </li>
        <li>
          Components live in <code>components/</code>
        </li>
      </ul>
    </main>
  );
}
`;
}

export function layoutTemplate(): string {
  return `// SPDX-License-Identifier: MIT
import type { ReactNode } from 'react';
// <DebugPanel> surfaces a live audit stream + last-compiled-from info in dev.
// It expects a \`sink\` prop wired to your StreamingAuditSink (typically the
// same one passed to <CirRuntime>'s \`services.audit\`). For terminal-side
// observability while you're hacking, run \`cir dev --tail\` in another shell.
import { DebugPanel } from '@cir/react/debug';

export const metadata = {
  title: 'CIR app',
  description: 'A new CIR app',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Render <DebugPanel sink={...} defaultOpen /> inside your <CirRuntime>
  // provider tree once you wire the sink. In dev only:
  //   {process.env.NODE_ENV === 'development' ? <DebugPanel sink={sink} /> : null}
  void DebugPanel;
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
}

export function tsconfigTemplate(): string {
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: false,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  };
  return `${JSON.stringify(tsconfig, null, 2)}\n`;
}

export function nextConfigTemplate(): string {
  return `// SPDX-License-Identifier: MIT
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
`;
}

/**
 * Tailwind config (Vis-2 + Vis-1). Pairs with `<CirRoute>`'s
 * `useColorModeFromIntent`, which mirrors the user's
 * `intent.global_preferences.color_mode` onto `<html data-color-mode>`.
 * The `class` strategy in the array is the bridge for hosts that toggle
 * `class="dark"` on `<html>` directly; the
 * `[data-color-mode="dark"]` selector is what `<CirRoute>` writes.
 *
 * Wave 11 / Vis-1 — typography depth. When the host projects the brand
 * kit's `typography.letter_spacing` / `typography.line_height` to
 * `--cir-tracking-*` / `--cir-leading-*` CSS variables (typically in
 * `globals.css`, alongside `--cir-color-*`), the entries below let the
 * Tailwind utility classes (`tracking-tight`, `leading-normal`, …)
 * resolve to the brand-kit tokens automatically. Hosts that do not
 * declare these scales keep the Tailwind defaults.
 */
export function tailwindConfigTemplate(): string {
  return `// SPDX-License-Identifier: MIT
/** @type {import('tailwindcss').Config} */
const config = {
  // CIR mirrors the user's intent profile color_mode onto
  // <html data-color-mode>. The 'class' fallback covers hosts that toggle
  // class="dark" themselves; either selector enables Tailwind's dark: utilities.
  darkMode: ['class', '[data-color-mode="dark"]'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './node_modules/@cir/components/dist/**/*.js',
  ],
  theme: {
    extend: {
      // Vis-1 — typography depth. The runtime projects the brand kit's
      // typography.letter_spacing / line_height entries to CSS variables;
      // the utilities below resolve to those variables when present and
      // fall through to the bare value otherwise.
      letterSpacing: {
        tight: 'var(--cir-tracking-tight, -0.02em)',
        normal: 'var(--cir-tracking-normal, 0)',
        wide: 'var(--cir-tracking-wide, 0.04em)',
      },
      lineHeight: {
        tight: 'var(--cir-leading-tight, 1.25)',
        normal: 'var(--cir-leading-normal, 1.5)',
        loose: 'var(--cir-leading-loose, 1.75)',
      },
      // Vis-1 — OpenType feature settings. The runtime composes a single
      // \`font-feature-settings\` value from the brand kit's typography.opentype
      // flags and assigns it to --cir-font-feature-settings on :root. Tailwind
      // utilities can opt in via fontFeatureSettings: 'cir' on a class.
      fontFeatureSettings: {
        cir: 'var(--cir-font-feature-settings, normal)',
      },
    },
  },
  plugins: [],
};

export default config;
`;
}

export function gitignoreTemplate(): string {
  return `node_modules
.next
dist
coverage
.env
.env.local
.DS_Store
`;
}

export function readmeTemplate(ctx: InitContext): string {
  return `# ${ctx.appName}

A new CIR app, scaffolded by \`cir init\`.

## Getting started

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## Layout

- \`app/\` — Next.js 15 App Router pages.
- \`capabilities/\` — capability JSON artifacts.
- \`skills/\` — skill markdown bundles.
- \`components/\` — your project's component overrides (use \`cir add\` to copy baselines).

See \`docs/\` in the [CIR repo](https://github.com/fragmatic-io/cir) for more.
`;
}

export function placeholderTemplate(label: string): string {
  return `# ${label}\n\nThis directory holds CIR \`${label}\` artifacts.\nDelete this file once you add real artifacts.\n`;
}
