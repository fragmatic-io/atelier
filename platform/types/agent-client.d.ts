import type { Json } from './common.js';

export interface AgentTransport {
  (request: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<any>;
}

export interface AgentJournal {
  get(key: string): Promise<any>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<Array<{ id: string; value: any }>>;
  clear(): Promise<void>;
  close(): Promise<void>;
}

export interface ClientTool<Input = unknown, Output = unknown> {
  name: string;
  inputSchema: object;
  outputSchema: object;
  execute(input: Input): Promise<Output>;
}

export class AgentClient {
  constructor(options: {
    transport: AgentTransport;
    journal?: AgentJournal;
    tools?: ClientTool[];
    pollIntervalMs?: number;
    onError?: (error: unknown) => void;
  });
  on(listener: (event: any) => void): () => void;
  rpc(action: string, input?: Record<string, unknown>, signal?: AbortSignal): Promise<any>;
  list(): Promise<any[]>;
  create(input?: Record<string, unknown>): Promise<{ id: string }>;
  read(threadId: string): Promise<any>;
  send(
    threadId: string,
    message: string,
    options?: {
      mode?: 'model' | 'demo';
      attachments?: string[];
      requestId?: string;
      signal?: AbortSignal;
    },
  ): Promise<any>;
  watch(threadId: string, options?: { after?: number }): { stop(): void; done: Promise<void> };
  stop(threadId: string): void;
  cancel(threadId: string): Promise<any>;
  archive(threadId: string): Promise<any>;
  purge(threadId: string): Promise<any>;
  artifact(threadId: string, artifactId: string): Promise<any>;
  pin(threadId: string, artifactId: string, pinned?: boolean): Promise<any>;
  revise(threadId: string, artifactId: string, revision: number, data: Json): Promise<any>;
  feedback(threadId: string, messageId: string, value: 1 | -1): Promise<any>;
  proposeAction(threadId: string, artifactId: string, input: unknown): Promise<any>;
  attach(threadId: string, file: File): Promise<any>;
  retryOutbox(): Promise<any[]>;
  executeClientTool(threadId: string, call: any): Promise<any>;
  close(options?: { clear?: boolean }): Promise<void>;
}

export function sameOriginTransport(
  endpoint: string,
  options?: { csrf?: () => string | null; fetcher?: typeof fetch },
): AgentTransport;

export function defineClientTool<T extends ClientTool>(tool: T): Readonly<T>;
