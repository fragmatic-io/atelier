import type { AgentClient } from './agent-client.js';

export function mountAgentChat(
  element: Element,
  options: {
    client: AgentClient;
    name?: string;
    subtitle?: string;
    mode?: 'model' | 'demo';
    context?: Record<string, unknown>;
    onTool?: (call: any) => Promise<any>;
    onError?: (error: unknown) => void;
  },
): {
  newConversation(): Promise<any>;
  showArtifact(id: string): Promise<void>;
  destroy(): void;
};

export function confirmAction(
  root: Element,
  options?: { title?: string; description?: string; input?: unknown; accept?: string },
): Promise<boolean>;
