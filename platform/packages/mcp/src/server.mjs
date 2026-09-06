// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { codingSkill, designSkill } from './skills.mjs';

const textResult = (value) => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  structuredContent: { result: value },
});

const safeTool = (work) => async (input) => {
  try {
    return textResult(await work(input));
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : 'Atelier MCP request failed',
        },
      ],
    };
  }
};

const readResource =
  (uri, loader, mimeType = 'application/json') =>
  async () => ({
    contents: [{ uri, mimeType, text: await loader() }],
  });

export function createAtelierMcpServer(client) {
  const server = new McpServer(
    { name: 'atelier-project', version: '2.3.0-rc.1' },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: 'Read-only, token-scoped access to one Atelier project.',
    },
  );
  const readOnly = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };

  server.registerTool(
    'atelier_search_project',
    {
      title: 'Search Atelier project',
      description: 'Search the current version of the configured project model.',
      inputSchema: z.object({ query: z.string().trim().min(1).max(500) }),
      annotations: readOnly,
    },
    safeTool(({ query }) => client.search(query)),
  );

  server.registerTool(
    'atelier_get_project_model',
    {
      title: 'Get Atelier project model',
      description:
        'Read the configured project model, including versioned capabilities and design genome.',
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    safeTool(() => client.model()),
  );

  server.registerTool(
    'atelier_list_components',
    {
      title: 'List published Atelier components',
      description: 'List only reviewed and published components for this project.',
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    safeTool(async () =>
      (await client.components()).filter((component) => component.status === 'published'),
    ),
  );

  server.registerTool(
    'atelier_get_component_source',
    {
      title: 'Get published Atelier component source',
      description:
        'Read the exact compiled source artifact for a published component in this project.',
      inputSchema: z.object({ componentId: z.string().trim().min(1).max(120) }),
      annotations: readOnly,
    },
    safeTool(({ componentId }) => client.publishedComponent(componentId)),
  );

  server.registerResource(
    'atelier-project-model',
    'atelier://project/model',
    {
      title: 'Atelier project model',
      description: 'The current project model.',
      mimeType: 'application/json',
    },
    readResource('atelier://project/model', async () =>
      JSON.stringify(await client.model(), null, 2),
    ),
  );
  server.registerResource(
    'atelier-project-components',
    'atelier://project/components',
    {
      title: 'Atelier published components',
      description: 'Reviewed and published project components.',
      mimeType: 'application/json',
    },
    readResource('atelier://project/components', async () =>
      JSON.stringify(
        (await client.components()).filter((item) => item.status === 'published'),
        null,
        2,
      ),
    ),
  );
  server.registerResource(
    'atelier-coding-skill',
    'atelier://project/skill/coding',
    {
      title: 'Atelier coding skill',
      description: 'Versioned coding guidance generated from current project evidence.',
      mimeType: 'text/markdown',
    },
    readResource(
      'atelier://project/skill/coding',
      async () => codingSkill(await client.model(), await client.components()),
      'text/markdown',
    ),
  );
  server.registerResource(
    'atelier-design-skill',
    'atelier://project/skill/design',
    {
      title: 'Atelier design skill',
      description: 'Versioned design guidance generated from the current design genome.',
      mimeType: 'text/markdown',
    },
    readResource(
      'atelier://project/skill/design',
      async () => designSkill(await client.model()),
      'text/markdown',
    ),
  );
  return server;
}
