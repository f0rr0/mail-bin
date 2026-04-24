# Cloudflare Workers

# Ultracite

This project uses Ultracite with Oxlint and Oxfmt. Prefer these commands for quality gates:

- `bun x ultracite fix`
- `bun x ultracite check`
- `bun x ultracite doctor`

Run `bun run typecheck` for native TypeScript checking through `tsgo`.

## Repo Workflow

- Keep the repo clone-safe and self-contained. Do not depend on files in `~/.config` or other machine-local paths.
- Use `bun run cf -- <wrangler args>` or the existing package scripts when Wrangler needs the project config. These resolve `WRANGLER_CONFIG`, `wrangler.local.jsonc`, then `wrangler.jsonc`.
- Do not commit `.dev.vars`, `.env`, `wrangler.local.jsonc`, Cloudflare IDs, Cloudflare API tokens, or real destination inbox addresses.
- Run `bun run cf:types` after changing Wrangler bindings.
- Run `bun run verify` before handing off broad repo changes.
- Commit subjects use Conventional Commits. Check manually with `bun run commitlint -- "feat: short summary"`.

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands

| Command            | Purpose                   |
| ------------------ | ------------------------- |
| `bun run dev`      | Local development         |
| `bun run deploy`   | Deploy to Cloudflare      |
| `bun run cf:types` | Generate TypeScript types |

Run `bun run cf:types` after changing bindings in Wrangler config.

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

## Best Practices (conditional)

If the application uses Durable Objects or Workflows, refer to the relevant best practices:

- Durable Objects: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Workflows: https://developers.cloudflare.com/workflows/build/rules-of-workflows/
