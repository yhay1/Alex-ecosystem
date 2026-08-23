import test from "node:test";
import assert from "node:assert/strict";

import {
  AccountIdentifier,
  AuthenticationService,
  CredentialService,
  SessionService,
  UserService,
} from "../Alex/auth/index.js";
import { InMemoryDatabaseService } from "../Alex/database/memory.js";
import { ProductRegistry } from "../Alex/registry/index.js";
import { createRouter } from "../Alex/routing/index.js";
import manifest from "../products/alex-studio/manifest.js";
import handler from "../products/alex-studio/handler.js";
import { metrics } from "../Alex/observability/index.js";
import { SecretService } from "../products/alex-studio/secrets.js";

function setup() {
  const database = new InMemoryDatabaseService();
  const users = new UserService(database);
  const credentials = new CredentialService(database);
  const sessions = new SessionService(database);
  const context = {
    database,
    accountIdentifier: new AccountIdentifier(users, sessions),
    passwordAuthentication: new AuthenticationService(users, credentials, sessions),
    sessions,
  };
  const registry = ProductRegistry.fromManifests([{ manifest, handler }]);
  return { context, router: createRouter(registry, context), users, credentials };
}

const request = (path, options) => new Request(`https://example.test${path}`, options);

test("Studio requires identity for its dashboard and exposes public status", async () => {
  const { router } = setup();

  assert.equal((await router.fetch(request("/studio"))).status, 401);
  const response = await router.fetch(request("/studio/status"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    product: "alex-studio",
    status: "ok",
    version: "0.1.0",
  });
});

test("Studio signs in, retrieves the profile, serves the dashboard, and signs out", async () => {
  const { context, router, users, credentials } = setup();
  const user = await users.create({ id: "studio-user", accountId: "studio-account", metadata: { role: "builder" } });
  await credentials.setPassword(user.id, "correct horse battery staple");

  const signIn = await router.fetch(request("/studio/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ userId: user.id, password: "correct horse battery staple" }),
    headers: { "content-type": "application/json" },
  }));
  assert.equal(signIn.status, 200);
  const cookie = signIn.headers.get("set-cookie");
  assert.match(cookie, /^alex_session=.+; HttpOnly/);

  const profile = await router.fetch(request("/studio/profile", {
    headers: { cookie },
  }));
  assert.deepEqual((await profile.json()).profile, {
    id: user.id,
    accountId: user.accountId,
    metadata: user.metadata,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });

  const dashboard = await router.fetch(request("/studio", { headers: { cookie } }));
  assert.equal(dashboard.status, 200);
  assert.equal((await dashboard.json()).status, "ready");

  const signOut = await router.fetch(request("/studio/auth/sign-out", {
    method: "POST",
    headers: { cookie },
  }));
  assert.equal(signOut.status, 200);
  assert.match(signOut.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await router.fetch(request("/studio", { headers: { cookie } }))).status, 401);
  assert.equal(await context.accountIdentifier.identify(cookie.split(";")[0].slice("alex_session=".length)), undefined);
});

test("Studio project operations are scoped to the authenticated owner", async () => {
  const first = setup();
  const second = setup();
  const firstUser = await first.users.create({ id: "owner" });
  const secondUser = await second.users.create({ id: "other-owner" });
  await first.credentials.setPassword(firstUser.id, "correct horse battery staple");
  await second.credentials.setPassword(secondUser.id, "correct horse battery staple");

  const signIn = async (runtime, userId) => {
    const response = await runtime.router.fetch(request("/studio/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ userId, password: "correct horse battery staple" }),
      headers: { "content-type": "application/json" },
    }));
    return response.headers.get("set-cookie");
  };
  const firstCookie = await signIn(first, firstUser.id);
  const secondCookie = await signIn(second, secondUser.id);
  const auth = (cookie) => ({ headers: { cookie } });

  const created = await first.router.fetch(request("/studio/projects", {
    method: "POST",
    ...auth(firstCookie),
    body: JSON.stringify({ name: "Personal workspace" }),
  }));
  const project = (await created.json()).project;
  assert.equal(created.status, 201);

  assert.equal((await second.router.fetch(request(`/studio/projects/${project.id}`, auth(secondCookie)))).status, 404);
  const renamed = await first.router.fetch(request(`/studio/projects/${project.id}`, {
    method: "PATCH",
    ...auth(firstCookie),
    body: JSON.stringify({ name: "Renamed workspace" }),
  }));
  assert.equal((await renamed.json()).project.name, "Renamed workspace");

  const archived = await first.router.fetch(request(`/studio/projects/${project.id}/archive`, {
    method: "POST",
    ...auth(firstCookie),
  }));
  assert.equal((await archived.json()).project.archived, true);
  assert.equal((await first.router.fetch(request(`/studio/projects/${project.id}`, {
    method: "DELETE",
    ...auth(firstCookie),
  }))).status, 200);
  assert.deepEqual((await (await first.router.fetch(request("/studio/projects", auth(firstCookie)))).json()).projects, []);
});

test("Studio file operations stay inside the owned project", async () => {
  const runtime = setup();
  const user = await runtime.users.create({ id: "file-owner" });
  await runtime.credentials.setPassword(user.id, "correct horse battery staple");
  const signIn = await runtime.router.fetch(request("/studio/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ userId: user.id, password: "correct horse battery staple" }),
    headers: { "content-type": "application/json" },
  }));
  const auth = { headers: { cookie: signIn.headers.get("set-cookie") } };
  const projectResponse = await runtime.router.fetch(request("/studio/projects", {
    method: "POST",
    ...auth,
    body: JSON.stringify({ name: "Files" }),
  }));
  const project = (await projectResponse.json()).project;
  const path = `/studio/projects/${project.id}/files`;

  assert.equal((await runtime.router.fetch(request(path, {
    method: "POST",
    ...auth,
    body: JSON.stringify({ path: "src/index.js", content: "const answer = 1;" }),
  }))).status, 201);
  const read = await runtime.router.fetch(request(`${path}/read?path=src%2Findex.js`, auth));
  assert.equal((await read.json()).content, "const answer = 1;");
  assert.equal((await runtime.router.fetch(request(`${path}?path=..%2Fsecret`, auth))).status, 400);

  const edited = await runtime.router.fetch(request(path, {
    method: "PUT",
    ...auth,
    body: JSON.stringify({ path: "src/index.js", content: "const answer = 2;" }),
  }));
  assert.equal((await edited.json()).file.content, "const answer = 2;");
  const search = await runtime.router.fetch(request(`${path}/search?q=answer`, auth));
  assert.equal((await search.json()).results.length, 1);
  const renamed = await runtime.router.fetch(request(path, {
    method: "PATCH",
    ...auth,
    body: JSON.stringify({ path: "src/index.js", newPath: "src/main.js" }),
  }));
  assert.equal((await renamed.json()).file.path, "src/main.js");
  assert.equal((await runtime.router.fetch(request(path, {
    method: "POST",
    ...auth,
    body: JSON.stringify({ path: "src", type: "folder" }),
  }))).status, 201);
  const folderRename = await runtime.router.fetch(request(path, {
    method: "PATCH",
    ...auth,
    body: JSON.stringify({ path: "src", newPath: "lib" }),
  }));
  assert.equal(folderRename.status, 200);
  assert.equal((await runtime.router.fetch(request(`${path}/read?path=lib%2Fmain.js`, auth))).status, 200);
  assert.equal((await runtime.router.fetch(request(`${path}?path=lib%2Fmain.js`, {
    method: "DELETE",
    ...auth,
  }))).status, 200);
});

test("Studio secrets return names only and remain encrypted and project-scoped", async () => {
  const runtime = setup();
  runtime.context.projectSecretsKey = "test-only-secret-key";
  const user = await runtime.users.create({ id: "secret-owner" });
  await runtime.credentials.setPassword(user.id, "correct horse battery staple");
  const signIn = await runtime.router.fetch(request("/studio/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ userId: user.id, password: "correct horse battery staple" }),
    headers: { "content-type": "application/json" },
  }));
  const auth = { headers: { cookie: signIn.headers.get("set-cookie") } };
  const projectResponse = await runtime.router.fetch(request("/studio/projects", {
    method: "POST",
    ...auth,
    body: JSON.stringify({ name: "Secrets" }),
  }));
  const project = (await projectResponse.json()).project;
  const path = `/studio/projects/${project.id}/secrets`;
  const value = "super-private-value";

  const created = await runtime.router.fetch(request(path, {
    method: "POST",
    ...auth,
    body: JSON.stringify({ name: "API_TOKEN", value }),
  }));
  const createdBody = await created.text();
  assert.equal(created.status, 201);
  assert.doesNotMatch(createdBody, /super-private-value/);
  assert.doesNotMatch(createdBody, /ciphertext/);

  const listed = await runtime.router.fetch(request(path, auth));
  assert.deepEqual((await listed.json()).secrets.map(({ name }) => name), ["API_TOKEN"]);
  const stored = (await runtime.context.database.list("alex_studio_secrets"))[0];
  assert.notEqual(stored.ciphertext, value);
  assert.equal(await new SecretService(runtime.context.database, runtime.context.projectSecretsKey)
    .decrypt(project.id, "API_TOKEN"), value);

  const updated = await runtime.router.fetch(request(`${path}/API_TOKEN`, {
    method: "PUT",
    ...auth,
    body: JSON.stringify({ value: "updated-private-value" }),
  }));
  assert.doesNotMatch(await updated.text(), /updated-private-value/);
  assert.equal((await runtime.router.fetch(request(`${path}/API_TOKEN`, { method: "DELETE", ...auth }))).status, 200);
  const invalid = await runtime.router.fetch(request(path, {
    method: "POST",
    ...auth,
    body: JSON.stringify({ name: "../leak", value }),
  }));
  assert.equal(invalid.status, 400);
  assert.doesNotMatch(await invalid.text(), /super-private-value/);
});

test("Studio provider connections validate and never return credentials", async () => {
  const runtime = setup();
  runtime.context.providerConnectionsKey = "connection-encryption-key";
  const user = await runtime.users.create({ id: "connection-owner" });
  await runtime.credentials.setPassword(user.id, "correct horse battery staple");
  const signIn = await runtime.router.fetch(request("/studio/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ userId: user.id, password: "correct horse battery staple" }),
    headers: { "content-type": "application/json" },
  }));
  const auth = { headers: { cookie: signIn.headers.get("set-cookie") } };
  const originalFetch = globalThis.fetch;
  const connectionMetric = metrics.get("studio.connections.openai");
  globalThis.fetch = async () => new Response("ok", { status: 200 });
  try {
    const credentials = { apiKey: "connection-secret" };
    const validate = await runtime.router.fetch(request("/studio/connections/validate", {
      method: "POST", ...auth, body: JSON.stringify({ kind: "ai", providerId: "openai", credentials }),
    }));
    assert.deepEqual(await validate.json(), { valid: true });

    const created = await runtime.router.fetch(request("/studio/connections", {
      method: "POST", ...auth, body: JSON.stringify({ kind: "ai", providerId: "openai", credentials }),
    }));
    const connectionBody = await created.text();
    assert.equal(created.status, 201);
    assert.equal(metrics.get("studio.connections.openai"), connectionMetric + 1);
    assert.doesNotMatch(connectionBody, /connection-secret|ciphertext/);
    const connection = JSON.parse(connectionBody).connection;

    const selected = await runtime.router.fetch(request(`/studio/connections/${encodeURIComponent(connection.id)}/select`, {
      method: "POST", ...auth,
    }));
    assert.equal((await selected.json()).connection.selected, true);
    const updated = await runtime.router.fetch(request(`/studio/connections/${encodeURIComponent(connection.id)}`, {
      method: "PUT", ...auth, body: JSON.stringify({ credentials: { apiKey: "updated-secret" } }),
    }));
    assert.doesNotMatch(await updated.text(), /updated-secret/);
    assert.equal((await runtime.router.fetch(request("/studio/connections", auth))).status, 200);
    const stored = (await runtime.context.database.list("alex_studio_connections"))[0];
    assert.doesNotMatch(JSON.stringify(stored), /connection-secret|updated-secret/);
    assert.equal((await runtime.router.fetch(request(`/studio/connections/${encodeURIComponent(connection.id)}`, {
      method: "DELETE", ...auth,
    }))).status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});