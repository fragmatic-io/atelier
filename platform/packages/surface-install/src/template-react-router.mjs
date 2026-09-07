// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { expressAuthority, expressBridge } from './template-express.mjs';
import {
  designStyles,
  environmentExample,
  file,
  jsxText,
  quote,
  reactMount,
} from './template-shared.mjs';

export function reactRouterBundle(install) {
  const routeFiles =
    install.mode === 'route'
      ? [
          file(
            'src/atelier/AtelierSurfaceRoute.tsx',
            'Customer-owned React Router route element',
            `import { AtelierSurfaceMount } from './AtelierSurfaceMount';\n\nexport function AtelierSurfaceRoute() {\n  return <main aria-label={${quote(install.navLabel)}}><AtelierSurfaceMount /></main>;\n}\n`,
          ),
          file(
            'src/atelier/AtelierNavLink.tsx',
            'Customer-owned navigation link',
            `import { NavLink } from 'react-router-dom';\n\nexport function AtelierNavLink() {\n  return <NavLink to=${quote(install.routePath)}>${jsxText(install.navLabel)}</NavLink>;\n}\n`,
          ),
        ]
      : [];
  const placementPatches =
    install.mode === 'route'
      ? [
          {
            target: 'your React Router route table',
            purpose: 'Register the customer-owned route',
            snippet: `import { AtelierSurfaceRoute } from './atelier/AtelierSurfaceRoute';\n// Add: { path: ${quote(install.routePath)}, element: <AtelierSurfaceRoute /> }`,
          },
          {
            target: 'your existing navigation component',
            purpose: 'Expose the route',
            snippet: `import { AtelierNavLink } from './atelier/AtelierNavLink';\n// Place <AtelierNavLink /> in the approved navigation group.`,
          },
        ]
      : [
          {
            target: `the existing React route component for ${install.routePath}`,
            purpose: `Mount the approved ${install.mode} surface without replacing the route`,
            snippet: `import { AtelierSurfaceMount } from './atelier/AtelierSurfaceMount';\n// Place <AtelierSurfaceMount context={pageContext} /> at the approved insertion point.`,
          },
        ];
  return {
    files: [
      file(
        'src/atelier/AtelierSurfaceMount.tsx',
        'React surface mount and factual install receipt',
        reactMount(install),
      ),
      file(
        'src/atelier/atelier-design.css',
        'Reviewed host design contract styles',
        designStyles(install),
      ),
      ...routeFiles,
      file(
        'server/atelier-authority.mjs',
        'Fail-closed host authority adapter',
        expressAuthority(),
      ),
      file('server/atelier-bridge.mjs', 'Express HostBridge router', expressBridge(install)),
      file(
        'atelier.env.example',
        'Required server-only configuration',
        environmentExample(install),
      ),
    ],
    patches: [
      {
        target: 'src/main.tsx',
        purpose: 'Load scoped styles once',
        snippet: `import '@atelier/platform/surface.css';\nimport './atelier/atelier-design.css';`,
      },
      ...placementPatches,
      {
        target: 'your Express application bootstrap',
        purpose: 'Mount the same-origin bridge after session and CSRF middleware',
        snippet: `import { atelierRouter } from './server/atelier-bridge.mjs';\napp.use(express.json({ limit: '100kb' }));\napp.use(${quote(install.bridgePath)}, requireSession, requireSameOriginCsrf, atelierRouter);`,
      },
    ],
  };
}
