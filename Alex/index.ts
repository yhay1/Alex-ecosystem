import { D1DatabaseService } from "./database/d1.js";
import type { D1Database } from "./database/d1.js";
import { observeRequest } from "./observability/index.js";
import { ProductRegistry } from "./registry/index.js";
import { createRouter } from "./routing/index.js";
import { CloudflareKVService } from "./kv/cloudflare.js";
import { R2StorageService } from "./storage/r2.js";
import {
  AccountIdentifier,
  ApiKeyService,
  AuthenticationService,
  AuthorizationService,
  CredentialService,
  SessionService,
  UserService,
} from "./auth/index.js";
import { withCors, withSecurityHeaders } from "./security/index.js";
import exampleManifest from "../products/example-product/manifest.js";
import exampleHandler from "../products/example-product/handler.js";

interface KVNamespace {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: unknown): Promise<unknown>;
}

interface R2Bucket {
  put(key: string, value: unknown, options?: unknown): Promise<unknown>;
  get(key: string, options?: unknown): Promise<unknown>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<unknown>;
}

interface WorkerEnv {
  DB?: D1Database;
  KV?: KVNamespace;
  BUCKET?: R2Bucket;
}

function createRuntime(env: WorkerEnv) {
  const database = env.DB ? new D1DatabaseService(env.DB) : undefined;
  const kv = env.KV ? new CloudflareKVService(env.KV) : undefined;
  const storage = env.BUCKET ? new R2StorageService(env.BUCKET) : undefined;
  const users = database ? new UserService(database) : undefined;
  const credentials = database ? new CredentialService(database) : undefined;
  const sessions = database ? new SessionService(database) : undefined;

  return {
    database,
    kv,
    storage,
    authentication: database ? new ApiKeyService(database) : undefined,
    sessions,
    accountIdentifier: users && sessions ? new AccountIdentifier(users, sessions) : undefined,
    passwordAuthentication: users && credentials && sessions
      ? new AuthenticationService(users, credentials, sessions)
      : undefined,
    authorization: new AuthorizationService(),
    security: { withCors, withSecurityHeaders },
    users,
  };
}

const registry = ProductRegistry.fromManifests([
  { manifest: exampleManifest, handler: exampleHandler },
]);

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const runtime = createRuntime(env);
    const router = createRouter(registry, runtime);
    const response = await observeRequest(request, async () => {
      if (new URL(request.url).pathname === "/__db/health") {
        if (!runtime.database) return new Response("D1 binding is unavailable.", { status: 503 });
        const healthy = await runtime.database.health();
        return new Response(healthy ? "ok" : "unhealthy", { status: healthy ? 200 : 503 });
      }

      return router.fetch(request);
    });

    return withSecurityHeaders(withCors(response, request));
  },
};
