import test from "node:test";
import assert from "node:assert/strict";

import {
  AIProvider,
  AnthropicProvider,
  ComputeProvider,
  ProviderKinds,
  ProviderRegistry,
  SourceControlProvider,
  DaytonaProvider,
  E2BProvider,
  GoogleProvider,
  GroqProvider,
  OpenAIProvider,
  OpenRouterProvider,
} from "../Alex/providers/index.js";

test("registers and resolves providers by kind without coupling provider types", () => {
  const registry = new ProviderRegistry();
  const ai = new AIProvider({ id: "mock-ai", capabilities: ["generate"] });
  const compute = new ComputeProvider({ id: "mock-runtime" });
  const sourceControl = new SourceControlProvider({ id: "mock-source" });

  registry.register(ai);
  registry.register(compute);
  registry.register(sourceControl);

  assert.equal(registry.get(ProviderKinds.AI, "mock-ai"), ai);
  assert.equal(registry.resolve(ProviderKinds.COMPUTE), compute);
  assert.deepEqual(registry.list().map(({ kind, id }) => `${kind}/${id}`), [
    "ai/mock-ai",
    "compute/mock-runtime",
    "source-control/mock-source",
  ]);
  assert.deepEqual(ai.describe(), {
    id: "mock-ai",
    name: "mock-ai",
    kind: "ai",
    capabilities: ["generate"],
  });
});

test("requires explicit selection when a kind has multiple providers", () => {
  const registry = new ProviderRegistry();
  registry.register(new AIProvider({ id: "first" }));
  registry.register(new AIProvider({ id: "second" }));

  assert.equal(registry.resolve(ProviderKinds.AI), undefined);
  assert.equal(registry.resolve(ProviderKinds.AI, "second").id, "second");
  assert.equal(registry.has(ProviderKinds.AI, "missing"), false);
});

test("rejects invalid and duplicate providers and supports removal", () => {
  const registry = new ProviderRegistry();
  registry.register(new AIProvider({ id: "same" }));

  assert.throws(() => registry.register(new AIProvider({ id: "same" })), /Duplicate provider/);
  assert.throws(() => registry.register({ id: "bad", kind: "unknown" }), /not supported/);
  assert.equal(registry.unregister(ProviderKinds.AI, "same"), true);
  assert.equal(registry.unregister(ProviderKinds.AI, "same"), false);
});

test("documented provider adapters validate with provider-specific endpoints", async () => {
  const cases = [
    [new OpenRouterProvider(), "https://openrouter.ai/api/v1/models", ["authorization", "Bearer test-key"]],
    [new OpenAIProvider(), "https://api.openai.com/v1/models", ["authorization", "Bearer test-key"]],
    [new AnthropicProvider(), "https://api.anthropic.com/v1/models", ["x-api-key", "test-key"]],
    [new GoogleProvider(), "https://generativelanguage.googleapis.com/v1beta/models?key=test-key", undefined],
    [new GroqProvider(), "https://api.groq.com/openai/v1/models", ["authorization", "Bearer test-key"]],
    [new E2BProvider(), "https://api.e2b.dev/sandboxes?limit=1", ["x-api-key", "test-key"]],
    [new DaytonaProvider(), "https://app.daytona.io/api/workspaces?limit=1", ["authorization", "Bearer test-key"]],
  ];

  for (const [provider, expectedUrl, expectedHeader] of cases) {
    let call;
    const valid = await provider.validate({ apiKey: "test-key" }, async (url, init) => {
      call = { url, init };
      return new Response("ok", { status: 200 });
    });
    assert.equal(valid, true);
    assert.equal(call.url, expectedUrl);
    if (expectedHeader) {
      const header = Object.entries(call.init.headers)
        .find(([name]) => name.toLowerCase() === expectedHeader[0]);
      assert.equal(header?.[1], expectedHeader[1]);
    }
  }
});

test("compute adapters delegate runtime lifecycle and commands to the provider API", async () => {
  for (const provider of [new E2BProvider(), new DaytonaProvider()]) {
    const calls = [];
    const fetcher = async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ id: "runtime-1", status: "running", stdout: "ok", exitCode: 0 }), { status: 200 });
    };
    const credentials = { apiKey: "compute-key" };
    await provider.createRuntime(credentials, { image: "base" }, fetcher);
    await provider.runtimeStatus(credentials, "runtime-1", fetcher);
    await provider.executeCommand(credentials, "runtime-1", "printf ok", {}, fetcher);
    await provider.cancelCommand(credentials, "runtime-1", "command-1", fetcher);
    await provider.stopRuntime(credentials, "runtime-1", fetcher);
    await provider.destroyRuntime(credentials, "runtime-1", fetcher);

    assert.equal(calls.length, 6);
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[2].options.method, "POST");
    assert.equal(calls[5].options.method, "DELETE");
    assert.equal(provider.id === "e2b"
      ? calls[0].options.headers["X-API-Key"]
      : calls[0].options.headers.Authorization, provider.id === "e2b" ? "compute-key" : "Bearer compute-key");
  }
});