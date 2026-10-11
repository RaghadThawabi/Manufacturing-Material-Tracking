# MaterialFlow

Configurable company workspaces for cutting-job material accounting and supervisor review.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- Phase 1 covers company setup, settings, roles, single-stage cutting jobs, reconciliation, review, and basic results. Phase 2 is approved: job specifications, operator assignment, pending rework and controlled resolution, and optional offcut size/location notes. AI, cutting optimization, conversions, and full offcut inventory remain later scope.
- Phase 3 covers supervisor approval checks, review attention flags, traceable corrections, and Admin-managed invitation/access lifecycles. Preserve existing sign-in, historical jobs, and read-only company configuration for non-Admins.
- Phase 4 adds Admin/Manager scrap-contributor insights and reviewer side-by-side production-job comparison. Insights use a single unit and explicit job-date/material/machine/product/status filters, default to approved non-sample records, and link to contributing jobs. Do not infer causes or savings; flag missing/different specifications and keep submitted figures distinguishable from approved results.
- Phase 5 covers setup readiness, role-specific work lists, production CSV reports, and a complete pilot guide at `docs/materialflow-pilot-guide.html`. The user wants to publish and test all roles and scenarios before moving to advanced features; do not publish or start advanced features automatically.
- Smart Waste Detective is now explicitly approved as a simple, separate MVP: explainable signals, one corrective action per investigation, and later-job comparison. Preserve all existing pages, production workflows and data; avoid advanced functionality or AI cause claims. Manual test values are in `docs/smart-waste-detective-test.md`.
- Operator screens must be simple for nontechnical factory workers: large buttons, clear labels, stepwise forms, minimal typing, and explicit outcome indicators. Supervisor screens should offer polished, professional comparisons.
- Other businesses must configure their settings and start jobs without application code changes.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
