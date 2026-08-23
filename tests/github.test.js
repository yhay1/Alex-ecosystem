import test from "node:test";
import assert from "node:assert/strict";

import { GitHubProvider } from "../Alex/providers/github.js";
import { AccountIdentifier, AuthenticationService, CredentialService, SessionService, UserService } from "../Alex/auth/index.js";
import { InMemoryDatabaseService } from "../Alex/database/memory.js";
import { ConnectionService } from "../products/alex-studio/connections.js";
import { GitHubOAuthService } from "../products/alex-studio/github.js";
import { ProductRegistry } from "../Alex/registry/index.js";
import { createRouter } from "../Alex/routing/index.js";
import manifest from "../products/alex-studio/manifest.js";
import handler from "../products/alex-studio/handler.js";

test("GitHub adapter uses the documented REST version and bearer token", async () => {
  const provider = new GitHubProvider();
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ tree: [], content: "", sha: "sha" }), { status: 200 });
  };

  await provider.listRepositories("github-token", fetcher);
  await provider.listBranches("github-token", "octo", "hello", fetcher);
  await provider.listFiles("github-token", "octo", "hello", "main", fetcher);
  await provider.readFile("github-token", "octo", "hello", "src/index.js", "main", fetcher);
  await provider.writeFile("github-token", "octo", "hello", "src/index.js", "main", "hello", "save", "sha", fetcher);

  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.equal(call.options.headers.Authorization, "Bearer github-token");
    assert.equal(call.options.headers["X-GitHub-Api-Version"], "2022-11-28");
  }
  assert.match(calls[3].url, /src\/index\.js/);
  assert.doesNotMatch(calls[4].options.body, /github-token/);
});

test("GitHub OAuth uses state and PKCE and stores the exchanged token encrypted", async () => {
  const database = new InMemoryDatabaseService();
  const connections = new ConnectionService(database, "connection-key");
  const requests = [];
  const oauth = new GitHubOAuthService(database, connections, {
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "https://studio.example/github/callback",
  }, async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ access_token: "github-token" }), { status: 200 });
  });

  const authorizationUrl = await oauth.start("user-1");
  const authorization = new URL(authorizationUrl);
  assert.equal(authorization.origin, "https://github.com");
  assert.equal(authorization.searchParams.get("client_id"), "client-id");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  const connection = await oauth.finish("user-1", authorization.searchParams.get("state"), "oauth-code");

  assert.equal(connection.providerId, "github");
  assert.equal(requests[0].url, "https://github.com/login/oauth/access_token");
  assert.equal(requests[0].options.headers.Accept, "application/json");
  assert.doesNotMatch(JSON.stringify(connection), /github-token|ciphertext/);
  assert.doesNotMatch(JSON.stringify((await database.list("alex_studio_connections"))[0]), /github-token/);
  assert.equal((await connections.credentials("user-1", connection.id)).accessToken, "github-token");
});

test("Studio supports explicit GitHub repository sync and commit actions", async () => {
  const database = new InMemoryDatabaseService();
  const users = new UserService(database);
  const credentials = new CredentialService(database);
  const sessions = new SessionService(database);
  const user = await users.create({ id: "github-user" });
  await credentials.setPassword(user.id, "correct horse battery staple");
  const context = {
    database,
    providerConnectionsKey: "connection-key",
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
    method: "POST", ...auth, body: JSON.stringify({ name: "GitHub project" }),
  }))).json();
  const connection = await new ConnectionService(database, context.providerConnectionsKey)
    .create(user.id, "source-control", "github", { accessToken: "github-token" });
  const query = `connectionId=${encodeURIComponent(connection.id)}&owner=octo&repository=hello&branch=main&projectId=${project.project.id}`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith("/user/repos?per_page=100&sort=updated")) return new Response(JSON.stringify([{ id: 1, name: "hello", full_name: "octo/hello", private: false, default_branch: "main", owner: { login: "octo" } }]), { status: 200 });
    if (url.includes("/branches?per_page=100")) return new Response(JSON.stringify([{ name: "main", commit: { sha: "branch-sha" } }]), { status: 200 });
    if (url.includes("/git/trees/main?recursive=1")) return new Response(JSON.stringify({ tree: [{ path: "README.md", type: "blob", sha: "file-sha" }] }), { status: 200 });
    if (url.includes("/contents/README.md") && options.method === "PUT") return new Response(JSON.stringify({ commit: { sha: "commit-sha" } }), { status: 200 });
    if (url.includes("/contents/README.md")) return new Response(JSON.stringify({ content: "aGVsbG8=", sha: "file-sha" }), { status: 200 });
    throw new Error(`Unexpected GitHub URL: ${url}`);
  };
  try {
    assert.equal((await (await router.fetch(new Request(`https://example.test/studio/github/repositories?connectionId=${encodeURIComponent(connection.id)}`, auth))).json()).repositories[0].fullName, "octo/hello");
    assert.equal((await (await router.fetch(new Request(`https://example.test/studio/github/branches?${query}`, auth))).json()).branches[0].name, "main");
    assert.equal((await (await router.fetch(new Request("https://example.test/studio/github/import", { method: "POST", ...auth, body: JSON.stringify({ connectionId: connection.id, projectId: project.project.id, owner: "octo", repository: "hello", branch: "main" }) }))).json()).imported, 1);
    await router.fetch(new Request(`https://example.test/studio/projects/${project.project.id}/files`, {
      method: "PUT", ...auth, body: JSON.stringify({ path: "README.md", content: "local edit" }),
    }));
    assert.equal((await (await router.fetch(new Request(`https://example.test/studio/github/status?${query}`, auth))).json()).changes[0].status, "modified");
    assert.equal((await (await router.fetch(new Request(`https://example.test/studio/github/diff?${query}`, auth))).json()).changes[0].local, "local edit");
    const commit = await router.fetch(new Request("https://example.test/studio/github/push", { method: "POST", ...auth, body: JSON.stringify({ connectionId: connection.id, projectId: project.project.id, owner: "octo", repository: "hello", branch: "main", path: "README.md", message: "Sync README" }) }));
    assert.equal((await commit.json()).pushed, true);
    assert.equal((await (await router.fetch(new Request("https://example.test/studio/github/pull", { method: "POST", ...auth, body: JSON.stringify({ connectionId: connection.id, projectId: project.project.id, owner: "octo", repository: "hello", branch: "main" }) }))).json()).imported, 1);
    assert.equal((await router.fetch(new Request(`https://example.test/studio/connections/${encodeURIComponent(connection.id)}`, { method: "DELETE", ...auth }))).status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});