import { AIProvider, ComputeProvider } from "./interfaces.js";

async function validateRequest(url, headers, fetcher) {
  try {
    const response = await fetcher(url, { method: "GET", headers, signal: AbortSignal.timeout(10_000) });
    return response.ok;
  } catch {
    return false;
  }
}

class ApiKeyAIProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.validationUrl = config.validationUrl;
    this.headersFor = config.headersFor;
  }

  validate(credentials, fetcher = fetch) {
    return typeof credentials?.apiKey === "string" && credentials.apiKey.length > 0
      ? validateRequest(this.validationUrl, this.headersFor(credentials.apiKey), fetcher)
      : false;
  }
}

export class OpenRouterProvider extends ApiKeyAIProvider {
  constructor() {
    super({
      id: "openrouter",
      name: "OpenRouter",
      capabilities: ["models", "chat"],
      validationUrl: "https://openrouter.ai/api/v1/models",
      headersFor: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    });
  }
}

export class OpenAIProvider extends ApiKeyAIProvider {
  constructor() {
    super({
      id: "openai",
      name: "OpenAI",
      capabilities: ["models", "chat"],
      validationUrl: "https://api.openai.com/v1/models",
      headersFor: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    });
  }
}

export class AnthropicProvider extends ApiKeyAIProvider {
  constructor() {
    super({
      id: "anthropic",
      name: "Anthropic",
      capabilities: ["models", "messages"],
      validationUrl: "https://api.anthropic.com/v1/models",
      headersFor: (apiKey) => ({ "x-api-key": apiKey, "anthropic-version": "2023-06-01" }),
    });
  }
}

export class GoogleProvider extends ApiKeyAIProvider {
  constructor() {
    super({
      id: "google",
      name: "Google",
      capabilities: ["models", "generate-content"],
      validationUrl: "https://generativelanguage.googleapis.com/v1beta/models",
      headersFor: () => ({}),
    });
  }

  validate(credentials, fetcher = fetch) {
    return typeof credentials?.apiKey === "string" && credentials.apiKey.length > 0
      ? validateRequest(`${this.validationUrl}?key=${encodeURIComponent(credentials.apiKey)}`, {}, fetcher)
      : false;
  }
}

export class GroqProvider extends ApiKeyAIProvider {
  constructor() {
    super({
      id: "groq",
      name: "Groq",
      capabilities: ["models", "chat"],
      validationUrl: "https://api.groq.com/openai/v1/models",
      headersFor: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    });
  }
}

class ApiKeyComputeProvider extends ComputeProvider {
  constructor(config) {
    super(config);
    this.validationUrl = config.validationUrl;
    this.headersFor = config.headersFor;
    this.baseUrl = config.baseUrl;
    this.runtimePaths = config.runtimePaths;
  }

  validate(credentials, fetcher = fetch) {
    return typeof credentials?.apiKey === "string" && credentials.apiKey.length > 0
      ? validateRequest(this.validationUrl, this.headersFor(credentials.apiKey), fetcher)
      : false;
  }

  async request(credentials, path, options = {}, fetcher = fetch) {
    const response = await fetcher(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...this.headersFor(credentials?.apiKey), ...options.headers },
    });
    if (!response.ok) throw new Error("Compute provider request failed.");
    return response.status === 204 ? undefined : response.json();
  }

  createRuntime(credentials, options, fetcher = fetch) {
    return this.request(credentials, this.runtimePaths.create, { method: "POST", body: JSON.stringify(options ?? {}), headers: { "Content-Type": "application/json" } }, fetcher);
  }

  startRuntime(credentials, runtimeId, fetcher = fetch) {
    return this.request(credentials, `${this.runtimePaths.start}/${encodeURIComponent(runtimeId)}`, { method: "POST" }, fetcher);
  }

  stopRuntime(credentials, runtimeId, fetcher = fetch) {
    return this.request(credentials, `${this.runtimePaths.stop}/${encodeURIComponent(runtimeId)}`, { method: "POST" }, fetcher);
  }

  destroyRuntime(credentials, runtimeId, fetcher = fetch) {
    return this.request(credentials, `${this.runtimePaths.destroy}/${encodeURIComponent(runtimeId)}`, { method: "DELETE" }, fetcher);
  }

  runtimeStatus(credentials, runtimeId, fetcher = fetch) {
    return this.request(credentials, `${this.runtimePaths.status}/${encodeURIComponent(runtimeId)}`, {}, fetcher);
  }

  executeCommand(credentials, runtimeId, command, options = {}, fetcher = fetch) {
    return this.request(credentials, `${this.runtimePaths.execute}/${encodeURIComponent(runtimeId)}`, { method: "POST", body: JSON.stringify({ command, ...options }), headers: { "Content-Type": "application/json" } }, fetcher);
  }

  cancelCommand(credentials, runtimeId, commandId, fetcher = fetch) {
    return this.request(credentials, `${this.runtimePaths.cancel}/${encodeURIComponent(runtimeId)}/${encodeURIComponent(commandId)}`, { method: "POST" }, fetcher);
  }

  startPreview(credentials, runtimeId, port, options = {}, fetcher = fetch) {
    return this.request(credentials, `${this.runtimePaths.preview}/${encodeURIComponent(runtimeId)}/${encodeURIComponent(port)}`, { method: "POST", body: JSON.stringify(options), headers: { "Content-Type": "application/json" } }, fetcher);
  }

  previewStatus(credentials, runtimeId, previewId, fetcher = fetch) {
    return this.request(credentials, `${this.runtimePaths.preview}/${encodeURIComponent(runtimeId)}/${encodeURIComponent(previewId)}`, {}, fetcher);
  }

  stopPreview(credentials, runtimeId, previewId, fetcher = fetch) {
    return this.request(credentials, `${this.runtimePaths.preview}/${encodeURIComponent(runtimeId)}/${encodeURIComponent(previewId)}`, { method: "DELETE" }, fetcher);
  }

  previewLogs(credentials, runtimeId, previewId, fetcher = fetch) {
    return this.request(credentials, `${this.runtimePaths.preview}/${encodeURIComponent(runtimeId)}/${encodeURIComponent(previewId)}/logs`, {}, fetcher);
  }
}

export class E2BProvider extends ApiKeyComputeProvider {
  constructor() {
    super({
      id: "e2b",
      name: "E2B",
      capabilities: ["sandboxes"],
      validationUrl: "https://api.e2b.dev/sandboxes?limit=1",
      headersFor: (apiKey) => ({ "X-API-Key": apiKey }),
      baseUrl: "https://api.e2b.dev",
      runtimePaths: { create: "/sandboxes", start: "/sandboxes", stop: "/sandboxes", destroy: "/sandboxes", status: "/sandboxes", execute: "/sandboxes", cancel: "/sandboxes", preview: "/sandboxes" },
    });
  }
}

export class DaytonaProvider extends ApiKeyComputeProvider {
  constructor() {
    super({
      id: "daytona",
      name: "Daytona",
      capabilities: ["workspaces", "sandboxes"],
      validationUrl: "https://app.daytona.io/api/workspaces?limit=1",
      headersFor: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
      baseUrl: "https://app.daytona.io/api",
      runtimePaths: { create: "/workspace", start: "/workspace", stop: "/workspace", destroy: "/workspace", status: "/workspace", execute: "/workspace", cancel: "/workspace", preview: "/workspace" },
    });
  }
}

export function createConnectionProviderRegistry() {
  const registry = new Map();
  for (const provider of [
    new OpenRouterProvider(), new OpenAIProvider(), new AnthropicProvider(),
    new GoogleProvider(), new GroqProvider(), new E2BProvider(), new DaytonaProvider(),
  ]) registry.set(`${provider.kind}:${provider.id}`, provider);
  return registry;
}