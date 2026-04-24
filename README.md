# Mail Bin

Single-admin disposable email routing for domains and subdomains you own. Mail Bin runs as one Cloudflare Worker with an HTTP API, a private React admin UI, an Email Worker handler, and D1 for state.

## What It Does

- Routes many explicit disposable aliases across many owned domains/subdomains.
- Forwards inbound mail to one or more verified primary inboxes, even if those inboxes are on unrelated providers.
- Uses one Cloudflare catch-all Email Routing rule per domain/subdomain, then resolves aliases in D1.
- Rejects unknown, disabled, or unroutable aliases instead of accepting catch-all spam.
- Logs delivery metadata and per-destination outcomes without storing raw email bodies.
- Keeps the app single-admin. There are no tenants, organizations, users, or domain security boundaries.

## Stack

- Runtime: Cloudflare Workers, Email Workers, D1, static assets
- Server: Hono, `@hono/zod-openapi`, Scalar API docs, Drizzle
- Client: React, TanStack Router, TanStack Query, TanStack Table, React Hook Form, shadcn/ui
- Tooling: Bun, Vite, Wrangler, Vitest Workers pool, Ultracite, Oxlint, Oxfmt, Tsgo, Lefthook

## Clone Setup

Install dependencies:

```sh
bun install
```

Create a local `.dev.vars` from the example:

```sh
cp .dev.vars.example .dev.vars
```

Optional Cloudflare sync variables:

```sh
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_EMAIL_WORKER_NAME=mail-bin
```

The token needs enough Email Routing access to list/create destination addresses and inspect/update catch-all routing rules for the zones you add.

## Cloudflare Config

The committed [wrangler.jsonc](./wrangler.jsonc) is intentionally clone-safe. It does not contain anyone's Cloudflare account IDs, zone IDs, or D1 database IDs.

For a real deployment, create a worktree-local config:

```sh
bunx wrangler login
bun run setup:cloudflare
bun run cf:types
bun run db:migrate:remote
bun run deploy
```

`bun run setup:cloudflare` creates a D1 database and writes `wrangler.local.jsonc`, which is gitignored. Local scripts resolve Wrangler config in this order: `WRANGLER_CONFIG`, `wrangler.local.jsonc`, then the committed `wrangler.jsonc`.

If you already have a D1 database, skip creation and write the local config from env:

```sh
MAIL_BIN_D1_DATABASE_ID=<database-id> bun run setup:cloudflare
```

For multiple git worktrees, copy `wrangler.local.jsonc` into each worktree or point a shell/session at an explicit config:

```sh
export WRANGLER_CONFIG=/absolute/path/to/mail-bin/wrangler.production.jsonc
```

Config env vars supported by `bun run cf:config:write` and `bun run setup:cloudflare`:

- `MAIL_BIN_WORKER_NAME`, default `mail-bin`
- `MAIL_BIN_D1_DATABASE_NAME`, default worker name
- `MAIL_BIN_D1_DATABASE_ID`, required for remote migrations and CI deploys
- `MAIL_BIN_D1_PREVIEW_DATABASE_ID`, optional
- `MAIL_BIN_APP_NAME`, default `Mail Bin`
- `MAIL_BIN_APP_ENV`, default `production` for generated configs
- `MAIL_BIN_WORKERS_DEV`, default `true`
- `MAIL_BIN_PREVIEW_URLS`, default `false`

## Local Development

Apply the local D1 migration:

```sh
bun run db:migrate:local
```

Start the app:

```sh
bun run dev
```

Useful local URLs:

- Admin UI: `http://127.0.0.1:5173`
- API docs: `http://127.0.0.1:5173/api/docs`
- Health check: `http://127.0.0.1:5173/health`

Replay sample inbound email fixtures after `bun run dev` is running:

```sh
bun run mail:fixture
```

The replay script posts `.eml` files from `test/fixtures/mail` into Cloudflare's local Email Worker endpoint at `/cdn-cgi/handler/email`.

## Cloudflare Onboarding

1. Run the Cloudflare config setup above.
2. Store Worker runtime sync secrets:

```sh
bun run cf secret put CLOUDFLARE_API_TOKEN
bun run cf secret put CLOUDFLARE_ACCOUNT_ID
bun run cf secret put CLOUDFLARE_EMAIL_WORKER_NAME
```

3. Put the admin UI behind Cloudflare Access. The app assumes a trusted single operator.
4. Add routed domains/subdomains in the UI with their Cloudflare zone IDs.
5. Add destination inboxes and complete Cloudflare verification.
6. Run Cloudflare sync from the UI to import verification status and reconcile catch-all Worker routing.
7. Create explicit aliases. Unknown recipients will be rejected.

Use a dedicated disposable domain or subdomain for routing. Do not point MX for a domain at Cloudflare Email Routing if another mail provider still needs to receive mail for that same exact domain.

## CI/CD

Three GitHub Actions workflows are included:

- `CI` runs PR title commit-style checks plus `bun install --frozen-lockfile` and `bun run verify` on pushes and pull requests.
- `Deploy` runs on pushes to `main` and manual dispatch, but skips safely until deploy secrets are configured.
- `Release` can be run manually with a semver input. It verifies the selected branch, creates the `v*.*.*` tag, and creates GitHub release notes. It also supports externally pushed `v*.*.*` tags.

Repository secrets for deployment:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `MAIL_BIN_D1_DATABASE_ID`

Optional repository variables:

- `MAIL_BIN_WORKER_NAME`
- `MAIL_BIN_D1_DATABASE_NAME`

The deploy workflow generates an ephemeral `.wrangler/generated/wrangler.jsonc`, runs verification, applies D1 migrations, then deploys the Worker.

## Contributing and Releases

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, pull request expectations, commit message rules, and release steps.

Commit subjects use Conventional Commits:

```text
feat: add alias search
fix(api): reject disabled aliases
docs: clarify Cloudflare setup
```

Run local hooks with:

```sh
bun run prepare
```

Releases are source releases created from semver tags such as `v0.1.0`. Use the manual `Release` workflow for the normal path: enter a version like `0.1.0`, choose the target branch, and let the workflow create the tag and GitHub Release together. Deployments are intentionally separate and happen through the `Deploy` workflow when repository secrets are configured.

## Commands

```sh
bun run dev
bun run build
bun run deploy
bun run cf -- <wrangler args>
bun run setup:cloudflare
bun run cf:config:write
bun run cf:types
bun run db:migrate:local
bun run db:migrate:remote
bun run lint
bun run lint:type-aware
bun run commitlint -- "feat: example change"
bun run format:check
bun run doctor
bun run typecheck
bun run test
bun run verify
```

`bun run verify` runs Ultracite checks, type-aware Oxlint, Tsgo typechecking, Worker tests, and production build.

## Notes

- `worker-configuration.d.ts` is generated by Wrangler and intentionally ignored by Oxlint/Oxfmt.
- `oxlint.config.ts` and `oxfmt.config.ts` extend Ultracite's Oxlint/Oxfmt presets. `bun run doctor` should pass.
- The Workers Vitest pool can print `workerd` websocket disconnect lines during shutdown while still exiting successfully.
- `wrangler.local.jsonc` is intentionally ignored. Do not commit real Cloudflare resource IDs unless you want the repo tied to one account.
