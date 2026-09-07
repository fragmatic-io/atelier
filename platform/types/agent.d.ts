import type { Buffer } from 'node:buffer';

export interface AgentSubject {
  id: string;
  role: string;
  permissions: string[];
}

export interface AgentCall {
  threadId: string;
  id: string;
  capabilityId: string;
  input: any;
  context: any;
  contract: any;
  inputHash: string;
  status: string;
  permissionHash: string;
}

export class SqliteToolReceipts {
  constructor(db: any);
  get(scope: string, key: string): any;
  claim(scope: string, key: string, fingerprint: string): boolean;
  lease(scope: string, key: string, value: unknown): void;
  result(scope: string, key: string, value: unknown): void;
  forget(scope: string, key: string): void;
}

export class AgentHostBridge {
  constructor(options: {
    tenantId: string;
    projectId: string;
    origin?: string;
    token?: string;
    transport?: (request: Record<string, unknown>) => Promise<any>;
    authorize: (args: {
      subject: AgentSubject;
      capability: any;
      kind: string;
      input: any;
      context: any;
    }) => boolean | Promise<boolean>;
    loaders?: Record<string, (args: any) => any>;
    executors?: Record<string, (args: any) => any>;
    ledger: any;
    receipts: SqliteToolReceipts;
    confirmationKey: Buffer;
    clock?: () => number;
    frameOrigin?: string;
    timeoutMs?: number;
    reconcile?: unknown;
  });
  request(subject: AgentSubject, action: string, input?: Record<string, unknown>): Promise<any>;
  call(subject: AgentSubject, threadId: string, callId: string): Promise<AgentCall>;
  confirm(input: { subject: AgentSubject; threadId: string; callId: string }): Promise<{
    ticket: string;
    capability: string;
    risk: string;
    input: any;
    expiresIn: number;
  }>;
  execute(input: {
    subject: AgentSubject;
    threadId: string;
    callId: string;
    ticket?: string;
    deny?: boolean;
  }): Promise<any>;
  clientLease(input: { subject: AgentSubject; threadId: string; callId: string }): Promise<any>;
  clientResult(input: {
    subject: AgentSubject;
    threadId: string;
    callId: string;
    leaseToken: string;
    result?: any;
    error?: boolean;
  }): Promise<any>;
}
