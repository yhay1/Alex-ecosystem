export type ProviderKind = "ai" | "compute" | "source-control";

export interface ProviderDescription {
  id: string;
  name: string;
  kind: ProviderKind;
  capabilities: string[];
}

export class ProviderAdapter {
  id: string;
  name: string;
  kind: ProviderKind;
  capabilities: string[];
  constructor(config: { id: string; name?: string; kind: ProviderKind; capabilities?: string[] });
  describe(): ProviderDescription;
}

export class AIProvider extends ProviderAdapter {
  constructor(config: { id: string; name?: string; capabilities?: string[] });
  generate(request: unknown, context?: unknown): Promise<unknown>;
}

export class ComputeProvider extends ProviderAdapter {
  constructor(config: { id: string; name?: string; capabilities?: string[] });
  createRuntime(credentials: unknown, options?: unknown, fetcher?: typeof fetch): Promise<unknown>;
  startRuntime(credentials: unknown, runtimeId: string, fetcher?: typeof fetch): Promise<unknown>;
  stopRuntime(credentials: unknown, runtimeId: string, fetcher?: typeof fetch): Promise<unknown>;
  destroyRuntime(credentials: unknown, runtimeId: string, fetcher?: typeof fetch): Promise<unknown>;
  runtimeStatus(credentials: unknown, runtimeId: string, fetcher?: typeof fetch): Promise<unknown>;
  executeCommand(credentials: unknown, runtimeId: string, command: string, options?: unknown, fetcher?: typeof fetch): Promise<unknown>;
  cancelCommand(credentials: unknown, runtimeId: string, commandId: string, fetcher?: typeof fetch): Promise<unknown>;
  startPreview(credentials: unknown, runtimeId: string, port: number, options?: unknown, fetcher?: typeof fetch): Promise<unknown>;
  previewStatus(credentials: unknown, runtimeId: string, previewId: string, fetcher?: typeof fetch): Promise<unknown>;
  stopPreview(credentials: unknown, runtimeId: string, previewId: string, fetcher?: typeof fetch): Promise<unknown>;
  previewLogs(credentials: unknown, runtimeId: string, previewId: string, fetcher?: typeof fetch): Promise<unknown>;
}

export class SourceControlProvider extends ProviderAdapter {
  constructor(config: { id: string; name?: string; capabilities?: string[] });
  listFiles(request: unknown, context?: unknown): Promise<unknown>;
  readFile(request: unknown, context?: unknown): Promise<unknown>;
  writeFile(request: unknown, context?: unknown): Promise<unknown>;
}

export class GitHubProvider extends SourceControlProvider {
  validate(credentials: unknown, fetcher?: typeof fetch): Promise<boolean>;
  listRepositories(accessToken: string, fetcher?: typeof fetch): Promise<unknown>;
  listBranches(accessToken: string, owner: string, repository: string, fetcher?: typeof fetch): Promise<unknown>;
  listFiles(accessToken: string, owner: string, repository: string, branch: string, fetcher?: typeof fetch): Promise<unknown>;
  readFile(accessToken: string, owner: string, repository: string, path: string, branch: string, fetcher?: typeof fetch): Promise<unknown>;
  writeFile(accessToken: string, owner: string, repository: string, path: string, branch: string, content: string, message: string, sha?: string, fetcher?: typeof fetch): Promise<unknown>;
}

export const ProviderKinds: {
  readonly AI: "ai";
  readonly COMPUTE: "compute";
  readonly SOURCE_CONTROL: "source-control";
};

export class ProviderRegistry {
  register(provider: ProviderAdapter): ProviderAdapter;
  unregister(kind: ProviderKind, id: string): boolean;
  get(kind: ProviderKind, id: string): ProviderAdapter | undefined;
  resolve(kind: ProviderKind, id?: string): ProviderAdapter | undefined;
  has(kind: ProviderKind, id: string): boolean;
  list(kind?: ProviderKind): ProviderAdapter[];
}