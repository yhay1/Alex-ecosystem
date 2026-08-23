# Alex Ecosystem

Initial repository foundation for the Alex ecosystem.

## Development

Install dependencies, then start the local Worker with:

```sh
npm install
npm run dev
```

For explicit local D1 development, apply the version-controlled migrations and
start the Worker with local bindings:

```sh
npm run db:migrate:local
npm run dev:local
```

Then check the D1 connection at `http://localhost:8787/__db/health`. Both
commands use Wrangler's local mode; they do not access or modify production
D1 data. The local database state is persisted by Wrangler in `.wrangler/`,
which is ignored by Git.

Run the TypeScript check with:

```sh
npm run check
```

Run every local validation independently with:

```sh
npm run validate:all
```

This validates dependencies, product manifests, tests, types, the Worker build,
and Wrangler configuration. It reports every failed check before exiting with a
nonzero status.

## Deployment

Deployment is manual and guarded. Authenticate with Wrangler using `npx wrangler
login`, or provide a scoped `CLOUDFLARE_API_TOKEN` in the shell. Set
`CLOUDFLARE_ACCOUNT_ID` to the target account, replace all resource placeholders
in `wrangler.jsonc`, and configure D1, KV, R2, and Queue resources before use.

Validate deployment configuration without deploying:

```sh
npm run validate:deployment
```

Before deployment, apply D1 migrations and configure secrets such as
`TURNSTILE_SECRET_KEY` with Wrangler secrets. The guarded deployment command is:

```sh
npm run deploy
```

It refuses to run when credentials, account configuration, or resource IDs are
missing. This repository does not deploy automatically and never stores
credentials or secrets.

To provision the configured Cloudflare resources, update `wrangler.jsonc`, apply
the D1 migration, and deploy in one guarded command:

```sh
npx wrangler login
npm run setup:cloudflare
```

The setup command creates only the configured D1 database, KV namespace, R2
bucket, and Queue when their values are still placeholders. It captures the
real identifiers returned by Wrangler, updates `wrangler.jsonc`, applies the
remote D1 migration, and deploys the Worker. It never creates duplicate
resources when the configured identifiers are already real. Turnstile or other
runtime secrets remain a separate manual Wrangler secret step because their
values must never be stored in the repository.

The Worker entry point is `Alex/index.ts`. Product placeholders live under `products/`.

## D1 setup

The shared database service supports Cloudflare D1 through the `DB` binding in
`wrangler.jsonc`. To use it locally or deploy later:

1. Create a D1 database with Wrangler.
2. Replace `REPLACE_WITH_D1_DATABASE_ID` with the database ID in `wrangler.jsonc`.
3. Apply migrations with `npx wrangler d1 migrations apply alex-ecosystem`.

No D1 database is provisioned by this repository yet. The in-memory database
service remains available for tests and local code that does not use D1.
Migrations are version-controlled under `Alex/database/migrations/` and contain
only the shared generic storage table.

## KV usage

The shared KV service is optional and is not currently bound in
`wrangler.jsonc` because no production namespace ID has been provisioned. Add a
real `KV` namespace binding before deploying features that require KV. KV is
not the source of truth for persistent relational data; D1 remains the shared
relational database.

Wrangler uses a local KV namespace during `wrangler dev` by default. The
`InMemoryKVService` is available for tests without any Cloudflare resources.

## R2 storage

The shared storage service uses the `BUCKET` binding in `wrangler.jsonc` for
object storage. The configured bucket name is a valid placeholder only; replace
it with the name of a provisioned bucket before using R2. Object keys are
validated as safe relative paths before any R2 operation.

R2 is intended for object and file storage. It is not provisioned or connected
by this repository, and products should access it through `Alex/storage/`.

## Background jobs

The shared jobs foundation uses the `JOBS` producer binding in `wrangler.jsonc`
and validates job IDs, types, product IDs, payloads, timestamps, and retry
information before sending messages. The configured queue name is a placeholder
until a queue is provisioned. Products should use `Alex/jobs/`; no product jobs
or consumer trigger are defined yet.

## Security configuration

Turnstile verification is available through `Alex/security/` and requires a
runtime secret. Configure `TURNSTILE_SECRET_KEY` as a Wrangler secret later
with `npx wrangler secret put TURNSTILE_SECRET_KEY`; never commit it or place it
in `.env.example`. Pass the secret to `verifyTurnstile` from the Worker
environment only for endpoints that need challenge protection.

Rate limiting is opt-in through `protectEndpoint` and the existing configurable
in-memory limiter. Apply it to specific sensitive or public endpoints rather
than globally. Cloudflare's Rate Limiting binding can be evaluated later if
distributed enforcement is needed.