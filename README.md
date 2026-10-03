# Padlock

Early-stage Turborepo monorepo. Contains two apps: `apps/web`, a Vite + React 19 SPA that renders a placeholder heading, and `apps/server`, a NestJS app backed by Postgres (Prisma) with a hello route and an `admins` CRUD module. There is no auth yet (the `/admins` endpoints are open, dev only), and no tests, CI, or deployment config.

## Tech stack

- [Turborepo](https://turborepo.com) + pnpm workspaces
- Web: React 19, Vite 8
- Server: [NestJS](https://nestjs.com) 12 (ESM)
- Database: PostgreSQL 17 (Docker) with [Prisma](https://www.prisma.io) 7
- Server extras: Swagger (`/docs`), class-validator, zod env validation, argon2
- TypeScript 7 (the server pins `~6.0` until Nest supports TS 7)
- [Biome](https://biomejs.dev) for linting, formatting, and import sorting
- Husky, lint-staged, and commitlint for Git hooks

## Prerequisites

- Node 25.7.0
- pnpm 12.8.1
- Docker (for local Postgres)

Both versions are pinned in `.tool-versions` and `packageManager`.

## Getting started

```bash
pnpm install
docker compose up -d db
cp apps/server/.env.example apps/server/.env   # required, validated at startup
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The server listens on `PORT` (default 3000). Swagger UI is at `/docs`.

Required env vars (see `apps/server/.env.example`): `DATABASE_URL`, `ADMIN_JWT_SECRET` (32+ chars), `ADMIN_WEB_ORIGIN`. `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are used by the seed script.

## Scripts

Run from the repo root.

| Command | Description |
| --- | --- |
| `pnpm dev` | Start all dev servers via Turbo |
| `pnpm dev:web` | Start only the web app |
| `pnpm dev:server` | Start only the server (NestJS, port 3000) |
| `pnpm build` | Build all workspaces (`apps/web` and `apps/server` output to `dist/`) |
| `pnpm typecheck` | Type-check all workspaces |
| `pnpm lint` | Run Biome checks (read-only) |
| `pnpm format` | Fix lint issues, format, and sort imports |
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate` | Create/apply dev migrations |
| `pnpm db:deploy` | Apply existing migrations (non-interactive) |
| `pnpm db:seed` | Seed the initial admin |
| `pnpm db:reset` | Reset the database and re-run migrations |
| `pnpm db:studio` | Open Prisma Studio |

## Project structure

```
apps/
  web/              Vite + React app (entry: src/main.tsx, root: src/App.tsx)
  server/           NestJS app (entry: src/main.ts, root: src/app.module.ts)
    prisma/         Schema, migrations, seed
    src/admins/     Admins CRUD module
    src/config/     Env validation
    src/common/     Shared error handling
    src/prisma/     Prisma module/service
docs/               SRS and database design
docker-compose.yml  Local Postgres
tsconfig.base.json  Shared strict TypeScript config
turbo.json          Turbo task definitions
biome.json          Lint and format config
```

## API

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/admins` | Create an admin |
| `GET` | `/admins` | List admins |
| `GET` | `/admins/:id` | Get one admin |
| `PATCH` | `/admins/:id` | Update an admin |
| `DELETE` | `/admins/:id` | Delete an admin |

Passwords are stored as argon2 hashes and never returned. These endpoints have no auth yet.

## Docs

- `docs/padlock_srs.md`: requirements
- `docs/padlock_database_design.md`: database design
- `ADMIN_GUIDE.md` and `ADMIN_CRUD_GUIDE.md`: admin feature walkthroughs

## Contributing

- Commits follow [Conventional Commits](https://www.conventionalcommits.org), enforced by commitlint (e.g. `feat: add vault list`).
- A pre-commit hook runs Biome on staged files. Don't bypass it with `--no-verify`.
- Before opening a PR, run `pnpm typecheck && pnpm lint`.
