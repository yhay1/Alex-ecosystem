import { DataStore } from "../../Alex/database/store.js";
import { randomToken } from "../../Alex/auth/crypto.js";

const stateCollection = "alex_studio_github_oauth";

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export class GitHubOAuthService {
  constructor(database, connections, config, fetcher = fetch) {
    this.states = new DataStore(database, stateCollection);
    this.connections = connections;
    this.config = config;
    this.fetcher = fetcher;
  }

  async start(userId) {
    if (!this.config.clientId || !this.config.clientSecret || !this.config.redirectUri) {
      throw new Error("GitHub OAuth is unavailable.");
    }
    const state = randomToken(32);
    const verifier = randomToken(32);
    const challenge = encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    await this.states.save(state, { userId, verifier, expiresAt: Date.now() + 600_000 });
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: "repo read:user",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    return url.toString();
  }

  async finish(userId, state, code) {
    const stored = await this.states.get(state);
    if (!stored || stored.userId !== userId || stored.expiresAt < Date.now()) throw new Error("Invalid GitHub OAuth state.");
    await this.states.delete(state);
    const response = await this.fetcher("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: this.config.clientId, client_secret: this.config.clientSecret, code, redirect_uri: this.config.redirectUri, code_verifier: stored.verifier }),
    });
    if (!response.ok) throw new Error("GitHub OAuth exchange failed.");
    const body = await response.json();
    if (typeof body.access_token !== "string") throw new Error("GitHub OAuth exchange failed.");
    const existing = await this.connections.get(userId, `${userId}:source-control:github`);
    return existing
      ? this.connections.update(userId, existing.id, { accessToken: body.access_token })
      : this.connections.create(userId, "source-control", "github", { accessToken: body.access_token });
  }
}