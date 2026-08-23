# Next Agent Handoff

## Frozen foundation

The root Worker entry point is `Alex/index.ts`. It composes the shared registry,
routing, D1, KV, R2, Queue jobs, authentication, authorization, security, and
observability layers. Product code lives below `products/`; each product should
have its own folder, generic `manifest.js`, and optional `handler.js`.

Use the shared abstractions only:

- `Alex/registry/` validates and registers enabled products.
- `Alex/routing/` resolves requests by registry route.
- `Alex/database/` and `DataStore` provide shared persistence. D1 migrations are
  under `Alex/database/migrations/`.
- `Alex/kv/` is for cache/configuration use cases.
- `Alex/storage/` owns object storage access.
- `Alex/jobs/` owns validated background-job envelopes and Queue production.
- `Alex/auth/` owns users, credentials, sessions, API keys, and authorization.
- `Alex/security/` owns request validation, safe errors, CORS, headers,
  authentication/authorization middleware, Turnstile, and opt-in abuse limits.
- `Alex/observability/` owns correlation IDs, timing, redacted structured logs,
  error tracking, and basic metrics.

## Build and validate

```sh
npm install
npm run validate:all
npm run dev:local
```

`npm run validate:all` runs dependency, manifest, test, type, build, and
Wrangler dry-run checks. Use `npm test` for the full test suite and
`npm run check` for TypeScript.

## Building the first real product

1. Add `products/<product-id>/manifest.js` with only the existing generic
   manifest fields: `id`, `name`, `version`, `route`, `description`, `enabled`,
   and `seo`.
2. Add `products/<product-id>/handler.js` for the product's isolated request
   behavior. Do not import another product's internals.
3. Keep `enabled: false` until the product is ready for registration.
4. Use `Alex/database/`, `Alex/kv/`, `Alex/storage/`, and `Alex/jobs/` through
   their shared services. Do not access Cloudflare bindings directly.
5. Use shared auth and security middleware for protected endpoints, and shared
   observability for request tracing. Do not log credentials, tokens, secrets,
   passwords, or private payloads.
6. Add focused tests for the manifest, handler, authorization policy, and any
   service interactions. Run `npm run validate:all` before enabling the product.

## Cloudflare readiness

`wrangler.jsonc` currently has placeholder D1, KV, and R2 values and a Queue
name that has not been provisioned. No production resources have been created.
After account access is available, provision only the configured resources,
replace placeholders with real identifiers, apply migrations, verify bindings,
and deploy manually with the guarded `npm run deploy` command.

The Worker currently uses a build-time manifest list because Node filesystem
discovery is not available in the Worker runtime. A future build-time manifest
generator is needed before product addition becomes fully automatic at runtime.
