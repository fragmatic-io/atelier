// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { defineConfig } from 'astro/config';

// GitHub Pages serves project sites from `<user>.github.io/<repo>/` unless a
// custom domain is bound. The `site` + `base` pair lets Astro emit absolute
// URLs that match. If a `CNAME` lands in `public/`, set `MARKETING_BASE=/`
// in the workflow env to flip the base back to the root.
const base = process.env.MARKETING_BASE ?? '/cir';
const site = process.env.MARKETING_SITE ?? 'https://fragmatic-io.github.io';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  // Zero JS by default. Islands are opt-in per component if/when needed.
  output: 'static',
});
