# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

`prisma-trpc-generator` is a [Prisma generator](https://www.prisma.io/docs/concepts/components/prisma-schema/generators) that reads a Prisma schema's DMMF and emits fully-implemented tRPC routers — one per model — plus a combined `appRouter`. It delegates Zod input schema generation to `prisma-zod-generator` and uses `ts-morph` to write the TypeScript output files.

## Commands

```bash
# Build (compile TypeScript to lib/)
npm run start        # tsc && npx prisma generate (also runs the generator against the example schema)

# Publish to npm
npm run package:publish   # ./package.sh && cd package && npm publish
```

There is no test suite. Manual testing is done by running the generator against `prisma/schema.prisma` (User/Post models, MySQL).

## Architecture

### Generation Pipeline

1. **`src/index.ts`** — registers the Prisma generator handler; entry point called by `prisma generate`
2. **`src/prisma-generator.ts`** — orchestrates the full generation:
   - Validates config via `src/config.ts`
   - Cleans and recreates the output directory
   - Calls `prisma-zod-generator` to emit Zod input schemas
   - Iterates every model × every supported operation
   - Writes individual procedure files and per-model router files
   - Writes the root `appRouter` that combines all model routers
3. **`src/helpers.ts`** — pure code-generation functions used by the generator:
   - Maps operation names → Zod input schema type names
   - Maps operation names → tRPC procedure type (`query` vs `mutation`)
   - Emits import statements and procedure implementations via `ts-morph` AST manipulation

### Generated Output Layout

```
<output>/
├── routers/
│   └── <Model>Router/
│       ├── index.ts              # model router (aggregates all procedures)
│       └── <operation>.procedure.ts
└── routers.ts                    # appRouter combining all model routers
```

### Configuration (`generator` block in schema.prisma)

| Option | Default | Description |
|---|---|---|
| `output` | `./generated` | Where to emit files |
| `withMiddleware` | — | tRPC middleware to apply to all procedures |
| `withShield` | — | `trpc-shield` permissions to apply |
| `contextPath` | `../../../../src/trpc` | Import path for the tRPC router/context export |

### Key Constraints

- Unsupported operations (omitted intentionally): `createManyAndReturn`, `updateManyAndReturn` (Prisma 5+ only)
- MongoDB-only operations (`findRaw`, `aggregateRaw`) are handled but guarded by provider checks in `helpers.ts`
- `ts-morph` is used for all file writes; do not write raw strings to disk
- Build output goes to `lib/`; the bin entry is `lib/generator.js`
