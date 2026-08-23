import test from "node:test";
import assert from "node:assert/strict";

import { AccountIdentifier, AuthenticationService, CredentialService, SessionService, UserService } from "../Alex/auth/index.js";
import { InMemoryDatabaseService } from "../Alex/database/memory.js";
import { ProductRegistry } from "../Alex/registry/index.js";
import { createRouter } from "../Alex/routing/index.js";
import { ConnectionService } from "../products/alex-studio/connections.js";
import { SecretService } from "../products/alex-studio/secrets.js";
import manifest from "../products/alex-studio/manifest.js";
import handler from "../products/alex-studio/handler.js";

test("Studio delegates runtime sessions and commands to the selected compute provider", async () => {
  const database = new InMemoryDatabaseService();
  const users = new UserService(database);
  const credentials = new CredentialService(database);
  const sessions = new SessionService(database);
  const user = await users.create({ id: "runtime-owner" });
  await credentials.setPassword(user.id, "correct horse battery staple");
  const context = {
    database,
    providerConnectionsKey: "connection-key",
    projectSecretsKey: "project-key",
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
    method: "POST", ...auth, body: JSON.stringify({ name: "Runtime" }),
  }))).json();
  const connection = await new ConnectionService(database, context.providerConnectionsKey)
    .create(user.id, "compute", "e2b", { apiKey: "compute-key" });
  await new SecretService(database, context.projectSecretsKey).create(project.project.id, "TOKEN", "runtime-secret");
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (options.body?.includes("printf hello")) return new Response(JSON.stringify({ id: "command-1", status: "completed", stdout: "runtime-secret hello", stderr: "", exitCode: 0 }), { status: 200 });
    if (options.body?.includes("start app")) return new Response(JSON.stringify({ id: "command-2", status: "completed", stdout: "started", stderr: "", exitCode: 0 }), { status: 200 });
    if (url.endsWith("/provider-runtime/3000")) return new Response(JSON.stringify({ id: "preview-1", url: "https://preview.example.test", status: "running" }), { status: 200 });
    if (url.endsWith("/provider-runtime/preview-1/logs")) return new Response(JSON.stringify({ id: "preview-logs", stdout: "runtime-secret log", stderr: "", exitCode: 0 }), { status: 200 });
    if (url.endsWith("/provider-runtime/preview-1")) return new Response(JSON.stringify({ id: "preview-1", url: "https://preview.example.test", status: "running" }), { status: 200 });
    return new Response(JSON.stringify({ id: "provider-runtime", status: "running", stdout: "hello", stderr: "", exitCode: 0 }), { status: 200 });
  };
  try {
    const create = await router.fetch(new Request(`https://example.test/studio/projects/${project.project.id}/runtimes`, {
      method: "POST", ...auth, body: JSON.stringify({ connectionId: connection.id, options: { image: "base" } }),
    }));
    const runtime = (await create.json()).runtime;
    assert.equal(create.status, 201);
    assert.equal(runtime.providerRuntimeId, "provider-runtime");
    assert.doesNotMatch(JSON.stringify(runtime), /compute-key/);

    const command = await router.fetch(new Request(`https://example.test/studio/runtimes/${runtime.id}/commands`, {
      method: "POST", ...auth, body: JSON.stringify({ command: "printf hello" }),
    }));
    assert.equal((await command.json()).result.stdout, "[REDACTED] hello");
    const preview = await router.fetch(new Request(`https://example.test/studio/runtimes/${runtime.id}/previews`, {
      method: "POST", ...auth, body: JSON.stringify({ port: 3000, command: "start app" }),
    }));
    const previewBody = await preview.json();
    assert.equal(preview.status, 201);
    assert.equal(previewBody.preview.address, "https://preview.example.test");
    assert.equal(previewBody.command.stdout, "started");
    assert.equal((await (await router.fetch(new Request(`https://example.test/studio/previews/${previewBody.preview.id}/status`, auth))).json()).preview.status, "running");
    const logs = await router.fetch(new Request(`https://example.test/studio/previews/${previewBody.preview.id}/logs`, auth));
    assert.equal((await logs.json()).logs.stdout, "[REDACTED] log");
    assert.equal((await router.fetch(new Request(`https://example.test/studio/previews/${previewBody.preview.id}/stop`, { method: "POST", ...auth }))).status, 200);
    assert.equal((await router.fetch(new Request(`https://example.test/studio/runtimes/${runtime.id}/commands/command-1/cancel`, { method: "POST", ...auth }))).status, 200);
    assert.equal((await router.fetch(new Request(`https://example.test/studio/runtimes/${runtime.id}/status`, auth))).status, 200);
    assert.equal((await router.fetch(new Request(`https://example.test/studio/runtimes/${runtime.id}/stop`, { method: "POST", ...auth }))).status, 200);
    assert.equal((await router.fetch(new Request(`https://example.test/studio/runtimes/${runtime.id}/destroy`, { method: "POST", ...auth }))).status, 200);
    assert.equal((await router.fetch(new Request(`https://example.test/studio/runtimes/${runtime.id}/status`, auth))).status, 404);
    assert.ok(calls.every(({ options }) => !JSON.stringify(options.body ?? {}).includes("compute-key")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});