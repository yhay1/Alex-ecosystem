import test from "node:test";
import assert from "node:assert/strict";

import { AccountIdentifier, AuthenticationService, CredentialService, SessionService, UserService } from "../Alex/auth/index.js";
import { AIProvider } from "../Alex/providers/interfaces.js";
import { InMemoryDatabaseService } from "../Alex/database/memory.js";
import { ProductRegistry } from "../Alex/registry/index.js";
import { createRouter } from "../Alex/routing/index.js";
import { ConnectionService } from "../products/alex-studio/connections.js";
import { FileService } from "../products/alex-studio/files.js";
import { StudioAgent, agentTools, toolDefinitions } from "../products/alex-studio/agent.js";
import { RuntimeService } from "../products/alex-studio/runtimes.js";
import { PreviewService } from "../products/alex-studio/previews.js";
import { ChangeService } from "../products/alex-studio/changes.js";
import { buildProjectContext } from "../products/alex-studio/context.js";
import manifest from "../products/alex-studio/manifest.js";
import handler from "../products/alex-studio/handler.js";

class MockAIProvider extends AIProvider {
  constructor() {
    super({ id: "mock-agent", name: "Mock Agent", capabilities: ["tools"] });
    this.calls = [];
  }

  async generate(input, context) {
    this.calls.push({ input, context });
    return this.calls.length === 1
      ? { toolCalls: [{ id: "read-1", name: "read_file", input: { path: "src/index.js" } }] }
      : { message: "I inspected the project file." };
  }
}

test("Studio agent executes only project tools and keeps credentials out of responses", async () => {
  const database = new InMemoryDatabaseService();
  const users = new UserService(database);
  const credentials = new CredentialService(database);
  const sessions = new SessionService(database);
  const user = await users.create({ id: "agent-owner" });
  await credentials.setPassword(user.id, "correct horse battery staple");
  const mock = new MockAIProvider();
  const context = {
    database,
    providerConnectionsKey: "connection-key",
    aiProviders: new Map([["ai:mock-agent", mock]]),
    accountIdentifier: new AccountIdentifier(users, sessions),
    passwordAuthentication: new AuthenticationService(users, credentials, sessions),
    sessions,
  };
  const router = createRouter(ProductRegistry.fromManifests([{ manifest, handler }]), context);
  const signIn = await router.fetch(new Request("https://example.test/studio/auth/sign-in", {
    method: "POST", body: JSON.stringify({ userId: user.id, password: "correct horse battery staple" }),
    headers: { "content-type": "application/json" },
  }));
  const auth = { headers: { cookie: signIn.headers.get("set-cookie") } };
  const project = await (await router.fetch(new Request("https://example.test/studio/projects", {
    method: "POST", ...auth, body: JSON.stringify({ name: "Agent project" }),
  }))).json();
  await new FileService(database).create(project.project.id, "src/index.js", "file", "export default 1;");
  const connection = await new ConnectionService(database, context.providerConnectionsKey)
    .create(user.id, "ai", mock.id, { apiKey: "private-provider-key" });

  const response = await router.fetch(new Request(`https://example.test/studio/projects/${project.project.id}/agent`, {
    method: "POST", ...auth, body: JSON.stringify({ connectionId: connection.id, message: "Inspect the entry file." }),
  }));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /inspected the project file/);
  assert.doesNotMatch(body, /private-provider-key/);
  assert.deepEqual(mock.calls[0].input.tools, toolDefinitions);
  assert.equal(mock.calls[0].context.credentials.apiKey, "private-provider-key");
});

test("agent tools reject resources outside the bound project", async () => {
  const tools = agentTools({
    userId: "user-1",
    projectId: "project-1",
    files: { get: async () => undefined, search: async () => [], create: async () => undefined, update: async () => undefined, delete: async () => false, list: async () => [] },
    runtimes: { getForUser: async () => ({ projectId: "project-2" }) },
    previews: new PreviewService(new InMemoryDatabaseService()),
    connections: new ConnectionService(new InMemoryDatabaseService(), "key"),
    providers: new Map(),
    redact: async (_projectId, value) => value,
  });

  await assert.rejects(() => tools.run_command({ runtimeId: "runtime-1", command: "pwd" }), /not available/);
  await assert.rejects(() => tools.read_file({ path: "../project-2/secret" }), /File not found/);
});

test("StudioAgent stops after its bounded tool-call turns", async () => {
  const provider = { generate: async () => ({ toolCalls: [{ id: "loop", name: "missing", input: {} }] }) };
  const agent = new StudioAgent(provider, {}, { maxTurns: 2 });
  const result = await agent.run("loop");
  assert.equal(result.message, "The agent reached its tool-call limit.");
  assert.equal(result.toolResults.length, 2);
});

test("StudioAgent forwards provider streaming chunks and activity events", async () => {
  const events = [];
  const provider = {
    async *generateStream() {
      yield { content: "hello " };
      yield { content: "world" };
    },
  };
  const result = await new StudioAgent(provider, {}).run("stream", { onEvent: (event) => events.push(event) });
  assert.equal(result.message, "hello world");
  assert.deepEqual(events.map(({ type, content }) => ({ type, content })), [
    { type: "assistant.delta", content: "hello " },
    { type: "assistant.delta", content: "world" },
  ]);
});

test("agent file changes stay pending until approved", async () => {
  const database = new InMemoryDatabaseService();
  const files = new FileService(database);
  const changes = new ChangeService(database, files);
  await files.create("project-1", "app.js", "file", "before");
  const tools = agentTools({
    userId: "user-1", projectId: "project-1", files, changes,
    runtimes: {}, previews: {}, connections: {}, providers: new Map(), redact: async (_id, value) => value,
  });

  const proposed = await tools.edit_file({ path: "app.js", content: "after" });
  assert.equal(proposed.status, "pending");
  assert.equal((await files.get("project-1", "app.js")).content, "before");
  await changes.approve("user-1", "project-1", proposed.id);
  assert.equal((await files.get("project-1", "app.js")).content, "after");
});

test("project context is targeted and bounded", async () => {
  const files = new FileService(new InMemoryDatabaseService());
  await files.create("project-1", "one.js", "file", "one");
  await files.create("project-1", "two.js", "file", "two");
  const context = await buildProjectContext({
    projectId: "project-1", files, relevantPaths: ["one.js"], recentErrors: ["recent failure"],
  });

  assert.deepEqual(context.relevantFiles, [{ path: "one.js", content: "one" }]);
  assert.deepEqual(context.recentErrors, ["recent failure"]);
  assert.deepEqual(context.structure, [{ path: "one.js", type: "file" }, { path: "two.js", type: "file" }]);
});