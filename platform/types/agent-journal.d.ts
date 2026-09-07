import type { AgentJournal } from './agent-client.js';

export class MemoryJournal implements AgentJournal {
  constructor(options?: { maxEntries?: number });
  get(id: string): Promise<any>;
  set(id: string, value: unknown): Promise<void>;
  delete(id: string): Promise<void>;
  list(prefix?: string): Promise<Array<{ id: string; value: any }>>;
  clear(): Promise<void>;
  close(): Promise<void>;
}

export class IndexedDbJournal implements AgentJournal {
  constructor(options: { namespace: string; database?: string; maxEntries?: number });
  get(id: string): Promise<any>;
  set(id: string, value: unknown): Promise<void>;
  delete(id: string): Promise<void>;
  list(prefix?: string): Promise<Array<{ id: string; value: any }>>;
  clear(): Promise<void>;
  close(): Promise<void>;
}
