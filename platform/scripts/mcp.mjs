#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadMcpConfig } from '../packages/mcp/src/config.mjs';
import { AtelierProjectClient } from '../packages/mcp/src/project-client.mjs';
import { createAtelierMcpServer } from '../packages/mcp/src/server.mjs';

const position = process.argv.indexOf('--config');
const config = await loadMcpConfig(position >= 0 ? process.argv[position + 1] : undefined);
serveStdio(() => createAtelierMcpServer(new AtelierProjectClient(config)), {
  legacy: 'reject',
  onerror: (error) => process.stderr.write(`${error.message}\n`),
});
