// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // CIR allows these scopes; types are conventional defaults
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
      ],
    ],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'header-max-length': [2, 'always', 100],
  },
};
