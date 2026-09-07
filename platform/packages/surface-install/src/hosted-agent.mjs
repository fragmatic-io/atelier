// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { randomUUID } from 'node:crypto';
import { surfaceInstallScope } from '../../control-plane/src/access.mjs';
import { assert, text } from '../../control-plane/src/util.mjs';
import {
  ConversationService,
  hostedConversationIdentity,
} from '../../conversation/src/service.mjs';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SUBJECT = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ACTIONS = new Set([
  'list',
  'create',
  'read',
  'turn',
  'events',
  'cancel',
  'archive',
  'purge',
  'call',
  'client-lease',
  'client-result',
  'deny',
  'artifact',
  'pin',
  'feedback',
]);

export class HostedAgentService {
  constructor(service, installs) {
    this.service = service;
    this.installs = installs;
    this.agents = new ConversationService(service);
    this.clock = service.clock;
  }

  profile(install) {
    const scope = surfaceInstallScope(this.service.db, install);
    const row = this.service.db.get(
      'SELECT artifact_id FROM agent_profiles WHERE tenant_id=? AND project_id=?',
      install.tenant_id,
      install.project_id,
    );
    assert(row, 409, 'AGENT_SETUP_REQUIRED', 'Configure the hosted chatbot in Studio first');
    const profile = this.service.store.getArtifact(scope, row.artifact_id, 'agent-profile').content;
    const model = this.service.store.getArtifact(scope, scope.project.model_id, 'model').content;
    assert(
      profile.projectVersion === model.projectVersion,
      409,
      'AGENT_OUTDATED',
      'Review the chatbot after the capability inventory changes',
    );
    assert(
      scope.project.provider_id,
      409,
      'AGENT_PROVIDER_REQUIRED',
      'Connect a project model provider before serving the chatbot',
    );
    assert(
      profile.voice?.status === 'reviewed',
      409,
      'AGENT_REVIEW_REQUIRED',
      'Review the chatbot voice and tool allowlist first',
    );
    assert(
      profile.tools.length > 0 && profile.tools.every((tool) => tool.execution === 'client'),
      409,
      'HOSTED_AGENT_CLIENT_ONLY',
      'Hosted chat requires at least one reviewed browser tool and permits no server tools',
    );
    return { scope, profile };
  }

  start(verificationKey, origin, input = {}) {
    const install = this.installs.authorize(verificationKey, origin, 'agent-session');
    this.profile(install);
    const subject = text(input.subject, 'Browser subject', { max: 36 });
    assert(SUBJECT.test(subject), 400, 'BROWSER_SUBJECT', 'Use a random browser UUID');
    const expiresAt = this.clock() + SESSION_TTL_MS;
    const value = this.service.box.seal(
      JSON.stringify({ installId: install.id, subject, expiresAt, nonce: randomUUID() }),
      `hosted-agent:${install.id}`,
    );
    return { session: Buffer.from(value).toString('base64url'), expiresAt };
  }

  authorize(verificationKey, origin, encoded) {
    const install = this.installs.authorize(verificationKey, origin, 'agent-rpc');
    assert(
      typeof encoded === 'string' && encoded.length <= 4096,
      401,
      'AGENT_SESSION',
      'Hosted agent session is required',
    );
    let session;
    try {
      session = JSON.parse(
        this.service.box.open(
          Buffer.from(encoded, 'base64url').toString('utf8'),
          `hosted-agent:${install.id}`,
        ),
      );
    } catch {
      assert(false, 401, 'AGENT_SESSION', 'Hosted agent session is invalid');
    }
    assert(
      session.installId === install.id &&
        SUBJECT.test(session.subject) &&
        session.expiresAt > this.clock(),
      401,
      'AGENT_SESSION',
      'Hosted agent session expired or is invalid',
    );
    this.service.auth.rate(`hosted-agent-subject:${install.id}:${session.subject}`, {
      limit: 60,
      windowMs: 60000,
    });
    const { scope, profile } = this.profile(install);
    const permissions = [
      ...new Set(profile.tools.flatMap((tool) => tool.requiredPermissions ?? [])),
    ].sort();
    const identity = hostedConversationIdentity(scope, {
      id: `browser:${session.subject}`,
      role: 'browser',
      permissions,
    });
    return { install, identity };
  }

  rpc(verificationKey, origin, session, body) {
    const { install, identity } = this.authorize(verificationKey, origin, session);
    assert(
      ALLOWED_ACTIONS.has(body.action),
      400,
      'AGENT_OPERATION',
      'Unsupported hosted conversation operation',
    );
    const t = install.tenant_id;
    const p = install.project_id;
    const key = body.threadId;
    const input = body.input ?? {};
    switch (body.action) {
      case 'list': return this.agents.list(identity, t, p);
      case 'create': return this.agents.create(identity, t, p, input);
      case 'read': return this.agents.read(identity, t, p, key);
      case 'turn': return this.agents.turn(identity, t, p, key, input);
      case 'events': return this.agents.events(identity, t, p, key, input.after ?? 0);
      case 'cancel': return this.agents.cancel(identity, t, p, key);
      case 'archive': return this.agents.archive(identity, t, p, key);
      case 'purge': return this.agents.purge(identity, t, p, key);
      case 'call': return this.agents.call(identity, t, p, key, body.callId);
      case 'client-lease': return this.agents.leaseTool(identity, t, p, key, body.callId, input);
      case 'client-result': return this.agents.completeTool(identity, t, p, key, body.callId, input);
      case 'deny': return this.agents.denyTool(identity, t, p, key, body.callId);
      case 'artifact': return this.agents.artifact(identity, t, p, key, body.artifactId);
      case 'pin': return this.agents.pin(identity, t, p, key, body.artifactId, input.pinned);
      case 'feedback': return this.agents.feedback(identity, t, p, key, input.messageId, input.value);
      default: throw new Error('Unreachable hosted agent action');
    }
  }
}
