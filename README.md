# Padlock

Early-stage Turborepo monorepo. Contains two apps: `apps/web`, a Vite + React 19 SPA that renders a placeholder heading, and `apps/server`, a NestJS app backed by Postgres (Prisma) with a hello route, an `admins` CRUD module, admin JWT auth (login/refresh/logout), user management, and an audit log listing. Every route requires an admin Bearer token unless marked public. There are no tests, CI, or deployment config.

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

Required env vars (see `apps/server/.env.example`): `DATABASE_URL`, `ADMIN_JWT_SECRET` (32+ chars), `ADMIN_WEB_ORIGIN`. `ADMIN_JWT_EXPIRES_IN` sets the access-token lifetime (default `1h`). `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are used by the seed script, and that seeded admin is the one you log in with at `POST /admin/auth/login`.

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
    src/admin/      Admin auth, users, and audit log modules
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

Every route requires `Authorization: Bearer <admin JWT>` unless listed as public.

Public:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | Hello route |
| `POST` | `/admin/auth/login` | Log in, returns an access token and sets the refresh cookie |
| `POST` | `/admin/auth/refresh` | Refresh the access token |
| `POST` | `/admin/auth/logout` | Log out |

Authenticated:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/admin/auth/me` | Current admin |
| `GET` | `/admin/users` | List users (`page`, `limit`, `search`, `status`) |
| `PATCH` | `/admin/users/:id/disable` | Disable a user and revoke their sessions |
| `PATCH` | `/admin/users/:id/reactivate` | Reactivate a user |
| `DELETE` | `/admin/users/:id` | Delete a user |
| `GET` | `/admin/audit-logs` | List audit logs (`page`, `limit`, `action`, `adminId`, `targetUserId`, `from`, `to`) |
| `POST` | `/admins` | Create an admin |
| `GET` | `/admins` | List admins |
| `GET` | `/admins/:id` | Get one admin |
| `PATCH` | `/admins/:id` | Update an admin |
| `DELETE` | `/admins/:id` | Delete an admin |

Passwords are stored as argon2 hashes and never returned. Full spec: Swagger UI at `/docs`.

## Docs

- `docs/padlock_srs.md`: requirements
- `docs/padlock_database_design.md`: database design
- `guides/`: admin feature walkthroughs (`ADMIN_GUIDE.md`, `ADMIN_CRUD_GUIDE.md`, `ADMIN_AUTH_GUIDE.md`, `ADMIN_GUARD_USERS_GUIDE.md`)

## Contributing

- Commits follow [Conventional Commits](https://www.conventionalcommits.org), enforced by commitlint (e.g. `feat: add vault list`).
- A pre-commit hook runs Biome on staged files. Don't bypass it with `--no-verify`.
- Before opening a PR, run `pnpm typecheck && pnpm lint`.
