# Contributing

Mail Bin is a single-package Cloudflare Workers app. Keep changes small, explicit, and clone-safe.

## Setup

1. Install Bun `1.3.8`.
2. Run `bun install`.
3. Run `cp .dev.vars.example .dev.vars`.
4. Run `bun run db:migrate:local`.
5. Run `bun run dev`.

Use `bun run setup:cloudflare` only when you are ready to create or connect a real Cloudflare D1 database.

## Quality Gates

Run the full gate before opening a PR:

```sh
bun run verify
```

Useful focused checks:

```sh
bun x ultracite fix
bun x ultracite check
bun run typecheck
bun run test
bun run build
```

## Commit Style

Commit subjects use Conventional Commits:

```text
feat: add alias search
fix(api): reject disabled aliases
docs: clarify Cloudflare setup
```

Allowed types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`.

Install local hooks with:

```sh
bun run prepare
```

The `commit-msg` hook checks commit subjects, `pre-commit` runs Ultracite fixes on staged source files, and `pre-push` runs typecheck, tests, and type-aware linting.

## Pull Requests

- Keep PRs focused.
- Include tests for routing, persistence, API, or sync behavior changes.
- Check the dashboard in a browser for UI changes.
- Do not commit `.dev.vars`, `.env`, `wrangler.local.jsonc`, Cloudflare IDs, API tokens, or destination inbox addresses.

## Releases

This repo ships as source plus a deployable Worker, not as an npm package.

1. Merge changes through `main` after CI passes.
2. Run the manual `Release` workflow from GitHub Actions.
3. Enter a semver version, for example `0.1.0` or `1.0.0-beta.1`.
4. The workflow verifies the selected branch, creates the `v*.*.*` tag, and creates GitHub release notes.

Deployments are separate from releases. The `Deploy` workflow deploys `main` when Cloudflare repository secrets are configured.
