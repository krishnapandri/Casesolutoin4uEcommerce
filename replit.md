# CaseSolution4U

A product-catalogue storefront for CaseSolution4U phone cases and accessories, with a staff-only catalogue and content editor.

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

- Storefront app: `artifacts/casesolution4u`
- API and staff routes: `artifacts/api-server`
- Database schema: `lib/db/src/schema/store.ts`
- API contract: `lib/api-spec/openapi.yaml`; regenerate clients and validators with the command above.

## Architecture decisions

- Keep catalogue pricing, stock, compatibility, homepage policies, and support contact sourced from the database; do not add sample products or unverified store claims.
- Online checkout and payment are not enabled. Staff-recorded orders represent orders received outside this website.
- Staff operations require both Clerk sign-in and an explicit server-side staff email allowlist.

## Product

The public site supports product and collection browsing, device compatibility filtering, product search, a locally saved bag, and newsletter signup. Staff can manage products, collections, homepage copy, published policies, and externally received orders.

## User preferences

- Visual direction: youthful, clean, modern, trustworthy, and product-focused; warm white, blush, charcoal, restrained lavender and sage; readable and accessible.
- Avoid clutter, emoji decoration, intrusive popups, unnecessary motion, and claims the store has not verified.

## Gotchas

- Leave shipping and return terms, support contact, trust notes, and product catalogue empty until the store provides verified content.
- A saved bag is not an order; checkout is unavailable and the site does not collect payment.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
