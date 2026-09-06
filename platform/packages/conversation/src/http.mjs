// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { SourceRegistry } from '../../source-forge/src/registry.mjs';
import { ConversationService } from './service.mjs';
import { projectAccess } from '../../control-plane/src/access.mjs';
import { assert } from './common.mjs';

const reply = (status, data) => ({ status, data });

export function experienceRoutes(service, { production = false, enableExamples = false } = {}) {
  const components = new SourceRegistry(service);
  const agents = new ConversationService(service);

  return {
    components,
    agents,
    async handle({ identity, t, p, resource, rid, action, method, body, headers }) {
      if (resource === 'components') {
        if (method === 'GET' && !rid) return reply(200, components.list(identity, t, p));
        if (method === 'GET' && rid) return reply(200, components.get(identity, t, p, rid));
        if (method === 'POST' && !rid)
          return reply(201, await components.import(identity, t, p, body));
        if (method === 'POST' && rid === 'generate') {
          return reply(202, components.propose(identity, t, p, body, headers['idempotency-key']));
        }
        if (method === 'POST' && action === 'certify')
          return reply(202, components.queueCertification(identity, t, p, rid));
        if (method === 'POST' && action === 'preview')
          return reply(200, components.preview(identity, t, p, rid, body));
        if (method === 'POST' && action === 'approve')
          return reply(200, components.approve(identity, t, p, rid, body));
        if (method === 'POST' && action === 'publish')
          return reply(200, components.publish(identity, t, p, rid));
        if (method === 'POST' && action === 'revoke')
          return reply(200, components.revoke(identity, t, p, rid));
      }

      if (resource === 'component-keys' && method === 'GET')
        return reply(200, components.publicKeys(identity, t, p));
      if (resource === 'component-keys' && method === 'POST' && rid === 'rotate')
        return reply(200, components.rotateKeys(identity, t, p, body));
      if (resource === 'agent-profile' && method === 'GET')
        return reply(200, agents.getProfile(identity, t, p));
      if (resource === 'agent-profile' && method === 'POST')
        return reply(201, agents.setup(identity, t, p, body));
      if (resource === 'agent-inventory' && method === 'GET')
        return reply(200, agents.inventory(identity, t, p));
      if (resource === 'api-observations' && method === 'POST')
        return reply(201, agents.observe(identity, t, p, body));

      if (resource === 'agent' && rid === 'rpc' && method === 'POST') {
        const host = body.host ?? null;
        const key = body.threadId;
        const input = body.input ?? {};
        if (production)
          assert(
            input.mode !== 'demo',
            400,
            'DEMO_DISABLED',
            'Offline mode is disabled in production',
          );
        let result;
        switch (body.action) {
          case 'list':
            result = agents.list(identity, t, p, host);
            break;
          case 'create':
            result = agents.create(identity, t, p, input, host);
            break;
          case 'read':
            result = agents.read(identity, t, p, key, host);
            break;
          case 'turn':
            result = agents.turn(identity, t, p, key, input, host);
            break;
          case 'events':
            result = agents.events(identity, t, p, key, input.after ?? 0, host);
            break;
          case 'cancel':
            result = agents.cancel(identity, t, p, key, host);
            break;
          case 'archive':
            result = agents.archive(identity, t, p, key, host);
            break;
          case 'purge':
            result = agents.purge(identity, t, p, key, host);
            break;
          case 'call':
            result = agents.call(identity, t, p, key, body.callId, host);
            break;
          case 'lease':
            result = agents.leaseTool(identity, t, p, key, body.callId, input, host);
            break;
          case 'result':
            result = agents.completeTool(identity, t, p, key, body.callId, input, host);
            break;
          case 'deny':
            result = agents.denyTool(identity, t, p, key, body.callId, host);
            break;
          case 'artifact':
            result = agents.artifact(identity, t, p, key, body.artifactId, host, {
              frameOrigin: identity.token ? body.frameOrigin : undefined,
            });
            break;
          case 'revise':
            result = agents.reviseArtifact(identity, t, p, key, body.artifactId, input, host);
            break;
          case 'pin':
            result = agents.pin(identity, t, p, key, body.artifactId, input.pinned, host);
            break;
          case 'artifact-action':
            result = agents.artifactAction(identity, t, p, key, body.artifactId, input, host);
            break;
          case 'attach':
            result = agents.attach(identity, t, p, key, input, host);
            break;
          case 'feedback':
            result = agents.feedback(identity, t, p, key, input.messageId, input.value, host);
            break;
          default:
            assert(false, 400, 'AGENT_OPERATION', 'Unsupported conversation operation');
        }
        return reply(200, result);
      }

      if (resource === 'source-examples' && method === 'GET') {
        projectAccess(service.db, identity, t, p);
        assert(enableExamples, 404, 'EXAMPLES_DISABLED', 'Examples are disabled');
        const directory = fileURLToPath(new URL('../../../examples/source-kits/', import.meta.url));
        const files = (await readdir(directory)).filter((name) => name.endsWith('.json'));
        return reply(
          200,
          await Promise.all(
            files.map(async (name) => JSON.parse(await readFile(join(directory, name), 'utf8'))),
          ),
        );
      }
      return null;
    },
  };
}
