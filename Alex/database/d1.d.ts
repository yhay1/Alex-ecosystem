interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
}

export class D1DatabaseService {
  constructor(database: D1Database);
  health(): Promise<boolean>;
  get(collection: string, id: string): Promise<unknown>;
  put(collection: string, id: string, value: unknown): Promise<unknown>;
  delete(collection: string, id: string): Promise<boolean>;
  list(collection: string): Promise<unknown[]>;
}