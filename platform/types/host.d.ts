import type { Buffer } from 'node:buffer';
import type {
  ActionArgs,
  CapabilityContract,
  Context,
  MaybePromise,
  Resolution,
  Subject,
} from './common.js';
export * from './common.js';
export interface ActionLedger {
  run(
    scope: string,
    key: string,
    payloadHash: string,
    execute: (operationId: string) => MaybePromise<unknown>,
  ): Promise<{ result: unknown; replayed: boolean }>;
}
export class SqliteActionLedger implements ActionLedger {
  constructor(path: string);
  run(
    scope: string,
    key: string,
    payloadHash: string,
    execute: (operationId: string) => MaybePromise<unknown>,
  ): Promise<{ result: unknown; replayed: boolean }>;
  reconcile(scope: string, key: string, result: unknown): boolean;
  close(): void;
}
export interface HostBridgeOptions {
  tenantId: string;
  projectId: string;
  environment?: 'staging' | 'production';
  origin?: string;
  token?: string;
  confirmationKey: Buffer;
  ledger: ActionLedger;
  authorize: (request: {
    subject: Subject;
    capability: CapabilityContract;
    kind: 'query' | 'command';
    context: Context;
    input: Record<string, unknown>;
  }) => MaybePromise<boolean>;
  loaders?: Record<
    string,
    (request: {
      subject: Subject;
      input: Record<string, unknown>;
      context: Context;
    }) => MaybePromise<unknown>
  >;
  executors?: Record<
    string,
    (request: {
      subject: Subject;
      input: Record<string, unknown>;
      context: Context;
      operationId: string;
    }) => MaybePromise<unknown>
  >;
  transport?: (request: Record<string, unknown>) => Promise<Resolution>;
  clock?: () => number;
  timeoutMs?: number;
}
export class HostBridge {
  constructor(options: HostBridgeOptions);
  resolve(subject: Subject, slotId: string, context?: Context): Promise<Resolution>;
  load(args: ActionArgs & { subject: Subject }): Promise<unknown>;
  confirm(
    args: ActionArgs & { subject: Subject; input: Record<string, unknown> },
  ): Promise<{ ticket: string; expiresIn: number; risk: string; confirmation: string }>;
  dispatch(
    args: ActionArgs & { subject: Subject; input: Record<string, unknown>; ticket: string },
  ): Promise<{ result: unknown; replayed: boolean }>;
}
