// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { RedocStandalone } from 'redoc';

const roots = new WeakMap();

// Preserve Atelier's existing three-argument call while letting the browser
// build resolve Redoc's external dependencies from the installed lock graph.
window.Redoc = Object.freeze({
  init(spec, options, mount) {
    let root = roots.get(mount);
    if (!root) {
      root = createRoot(mount);
      roots.set(mount, root);
    }
    root.render(createElement(RedocStandalone, { spec, options }));
    return root;
  },
});
