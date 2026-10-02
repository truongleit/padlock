# Padlock

Early-stage Turborepo monorepo. Contains two apps: `apps/web`, a Vite + React 19 SPA that renders a placeholder heading, and `apps/server`, a NestJS app with a single hello route. There is no database, auth, tests, CI, or deployment config yet.

## Tech stack

- [Turborepo](https://turborepo.com) + pnpm workspaces
- Web: React 19, Vite 8
- Server: [NestJS](https://nestjs.com) 12 (ESM)
- TypeScript 7 (the server pins `~6.0` until Nest supports TS 7)
- [Biome](https://biomejs.dev) for linting, formatting, and import sorting
- Husky, lint-staged, and commitlint for Git hooks

## Prerequisites

- Node 25.7.0
- pnpm 12.8.1

Both versions are pinned in `.tool-versions` and `packageManager`.

## Getting started

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # optional, sets PORT
pnpm dev
```

The server listens on `PORT` (default 3000).

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

## Project structure

```
apps/
  web/              Vite + React app (entry: src/main.tsx, root: src/App.tsx)
  server/           NestJS app (entry: src/main.ts, root: src/app.module.ts)
tsconfig.base.json  Shared strict TypeScript config
turbo.json          Turbo task definitions
biome.json          Lint and format config
```

## Contributing

- Commits follow [Conventional Commits](https://www.conventionalcommits.org), enforced by commitlint (e.g. `feat: add vault list`).
- A pre-commit hook runs Biome on staged files. Don't bypass it with `--no-verify`.
- Before opening a PR, run `pnpm typecheck && pnpm lint`.
