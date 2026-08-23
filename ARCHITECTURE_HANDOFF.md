# Alex Ecosystem Handoff

## Current architecture

`Alex/index.ts` is the thin Worker entry point. It wraps requests with shared
observability and security response handling, builds shared runtime services
from Worker bindings, and dispatches requests through the product router.

Shared modules are organized under `Alex/`: manifest validation, registry and
routing, D1-backed database access, KV, R2 storage, Queue jobs,
authentication/authorization, security, and observability. Products are kept
under `products/` and expose a manifest plus an optional handler. Tests use
in-memory or mocked services wherever a Cloudflare resource is not required.

## Resources

`wrangler.jsonc` currently describes these resources:

- Worker: `alex-ecosystem`
- D1 binding: optional; configure `DB` only after provisioning a real database
- KV binding: optional; configure `KV` only after provisioning a real namespace
- R2 binding: `BUCKET`
- Queue producer binding: `JOBS`, queue `alex-ecosystem-jobs`

The D1 ID, KV namespace ID, and R2 bucket name remain placeholders. No
production resources are provisioned. Deployment is manual and guarded by
`scripts/deploy.js`.

## Known issues

- Worker product registration is currently a build-time manifest list in
  `Alex/index.ts`; Node filesystem discovery is test/tooling-only because
  Workers do not provide the Node filesystem APIs. Adding products therefore
  requires a future build-time manifest generation step.
- The root workspace contains an untracked nested `alex-ecosystem/` Git
  repository from the original workspace state. It is separate from the root
  project and should be intentionally removed or relocated before the first
  root repository commit.
- Dependency validation reports existing extraneous packages:
  `@emnapi/runtime`, `@img/sharp-wasm32`, and `tslib`.
- Metrics and in-memory abuse protection are process-local. Distributed
  enforcement and external telemetry are not implemented.
- CI validates configuration with dry runs but does not provision resources or
  deploy automatically.

## Recommended next steps

1. Decide whether the nested repository belongs in this project, then remove or
   relocate it before committing the root repository.
2. Add a build-time product manifest generator so Worker registration remains
   dynamic without Node filesystem APIs in the Worker bundle.
3. Provision real Cloudflare resources only after account ownership and naming
   are confirmed, then replace Wrangler placeholders and apply D1 migrations.
4. Add integration tests against isolated local D1/KV/R2/Queue emulators where
   practical, and define endpoint-specific auth and abuse-protection policies.