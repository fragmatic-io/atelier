// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Atelier allows these scopes; types are conventional defaults
    'scope-enum': [
      2,
      'always',
      [
        'capability',
        'capabilities',
        'skill',
        'skills',
        'component',
        'components',
        'policy',
        'policies',
        'recipe',
        'recipes',
        'eval',
        'evals',
        'runtime',
        'compiler',
        'schema',
        'schemas',
        'manifest',
        'docs',
        'deps',
        'ci',
        'tooling',
        'release',
        'chat',
        'voice',
        'agent',
        'app',
        'apps',
        'demo',
        'cli',
        // Wave 11 Int-3 added @atelier/keyboard; Vis-3 added the icon
        // resolver; both surface through the React adapter and components
        // packages, but `keyboard` and `react` are themselves valid scopes.
        'keyboard',
        'react',
        'data-resolvers',
        'capability-resolver',
        'vault-server',
        'vault-client',
        'marketing',
      ],
    ],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'header-max-length': [2, 'always', 100],
  },
};
