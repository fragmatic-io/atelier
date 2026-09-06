export interface AtelierMcpProjectClient {
  model(): Promise<Record<string, unknown>>;
  search(query: string): Promise<unknown>;
  components(): Promise<Array<Record<string, unknown>>>;
  publishedComponent(id: string): Promise<Record<string, unknown>>;
}
export function createAtelierMcpServer(client: AtelierMcpProjectClient): unknown;
