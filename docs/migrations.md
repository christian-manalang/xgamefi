# Database & Migration Conventions

Conventions for `packages/db` (Prisma 7.8, ESM-only, Rust-free). Read before any schema change.

## Prisma 7 specifics

- **Datasource URL is not in `schema.prisma`.** The `datasource` block declares only `provider`. Connection URLs live in `prisma.config.ts` (`datasource.url` / `datasource.shadowDatabaseUrl`) for the CLI, and the runtime `PrismaClient` is constructed with the `pg` driver adapter (`@prisma/adapter-pg`) — see `src/client.ts`.
- **Env is not auto-loaded.** `prisma.config.ts` loads the monorepo-root `.env` itself (`dotenv`). CI sets `DATABASE_URL` / `SHADOW_DATABASE_URL` directly in the job env.
- **Generated client** is emitted to `src/generated` (gitignored) via the `prisma-client` generator with `moduleFormat = "esm"` and `importFileExtension = ""` (extensionless imports) so bundlers (Next Turbopack) resolve it. Run `pnpm db:generate` after schema changes.
- `migrate` / `db push` no longer auto-generate the client or auto-seed — run `pnpm db:generate` and `pnpm db:seed` explicitly.

## Conventions

- **Money is `Decimal(38, 7)`**, never float (Stellar uses 7-decimal stroops). All ids are `uuid` (`@db.Uuid`).
- **Migration names:** descriptive snake_case (`prisma migrate dev --name <change>`); commit the generated `prisma/migrations/**` directory.
- **Relations are bidirectional** — Prisma validation requires the opposite relation field on both models.
- **Seeds are idempotent** (`upsert`) so re-running is safe.

## Drift check

CI runs `pnpm --filter @xgamefi/db db:diff`:

```
prisma migrate diff --from-migrations ./prisma/migrations --to-schema ./prisma/schema.prisma --exit-code
```

Exit code 2 (drift) fails CI. The shadow database URL comes from `prisma.config.ts`. If you change `schema.prisma`, create a migration so committed migrations match the datamodel.

## Local workflow

```bash
docker compose up -d postgres
pnpm db:generate
pnpm --filter @xgamefi/db exec prisma migrate dev --name <change>
pnpm db:seed
```
