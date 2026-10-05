# Padlock

Early-stage Turborepo monorepo. Two apps: `apps/web` (Vite + React 19 SPA, placeholder heading) and `apps/server` (NestJS 12, Postgres via Prisma 7, a hello route, an `admins` CRUD module, and admin auth + user management). The only Docker file is `docker-compose.yml` (local Postgres). No tests, CI, or deployment config exists yet. Don't assume any of them; add them deliberately.

Specs and guides: `docs/padlock_srs.md`, `docs/padlock_database_design.md`, `guides/ADMIN_GUIDE.md` (big picture for the admin feature), `guides/ADMIN_CRUD_GUIDE.md` (step-by-step `admins` CRUD), `guides/ADMIN_AUTH_GUIDE.md` (tables + admin login/refresh/logout), `guides/ADMIN_GUARD_USERS_GUIDE.md` (JWT guard + admin users listing/disable/delete).

@AGENTS.md

## Toolchain

- Node 25.7.0, pnpm 12.8.1 (pinned in `.tool-versions` and `packageManager`). Use pnpm only.
- Turborepo `^2.11` (see AGENTS.md: read the installed package's bundled docs before changing `turbo.json` or turbo commands).
- TypeScript 7 (except `apps/server`, which pins TS `~6.0` because Nest doesn't support TS 7 yet; bump when it does), Vite 8, React 19, Biome 2 (lint + format + import sorting).
- `pnpm-workspace.yaml` includes only `apps/*`. Add `packages/*` there when creating shared packages. Biome's `files.includes` in `biome.json` already covers `packages/**/src`.
- `pnpm-workspace.yaml` has `minimumReleaseAgeExclude` entries for pinned `turbo` and `vite` versions. Update them when bumping those.

## Commands (run from repo root)

| Command | Purpose |
| --- | --- |
| `pnpm dev` / `pnpm dev:web` / `pnpm dev:server` | Start dev server(s) via turbo |
| `pnpm build` | `turbo run build` (web: `tsc && vite build`, output `dist/`) |
| `pnpm typecheck` | `turbo run typecheck` (`tsc` per workspace, `noEmit`) |
| `pnpm lint` | `biome check .` (read-only) |
| `pnpm format` | `biome check --write .` (fix lint, format, sort imports) |
| `pnpm db:generate` / `db:migrate` / `db:deploy` / `db:seed` / `db:reset` / `db:studio` | Prisma commands, forwarded to `apps/server` (`prisma` is only installed there, so bare `pnpm prisma ...` fails from root) |

There is no test runner configured. If you add one, add a turbo `test` task and update this file.

## Local setup

`docker compose up -d db` starts Postgres 17 (user/password/db all `padlock`, port 5432). Copy `apps/server/.env.example` to `apps/server/.env`; `src/config/env.ts` validates it with zod at startup (required: `DATABASE_URL`, `ADMIN_JWT_SECRET` of 32+ chars, `ADMIN_WEB_ORIGIN`; `PORT` defaults to 3000; `ADMIN_JWT_EXPIRES_IN` is the access-token lifetime, default `1h`; `SEED_ADMIN_*` are read by `prisma/seed.ts`). Then `pnpm db:migrate` and `pnpm db:seed`.

## Layout

- `apps/web/`: Vite React app. Entry `src/main.tsx` (StrictMode, throws if `#root` is missing), root component `src/App.tsx`.
- `apps/server/`: NestJS app (ESM, `moduleResolution: bundler`, decorators + `emitDecoratorMetadata`). Entry `src/main.ts` (PORT env, default 3000). Imports are extensionless; `tsc-alias --resolve-full-paths` adds `.js` and resolves the `@/*` alias (maps to `src/*`) in `dist/` after build and before `dev` starts node, e.g. `@/app.module`. Biome `useImportType` is off there, since DI constructor types must be value imports. Built with `nest build` to `dist/`. Swagger UI at `/docs` (JSON at `/docs-json`), set up in `main.ts`, which also writes the spec to `docs/swagger.json` on every startup (skipped when `NODE_ENV=production`); the `@nestjs/swagger` CLI plugin in `nest-cli.json` infers DTO/response schemas, so `@ApiProperty` is rarely needed (only applies to `nest build`/`nest start`, not plain `tsc`/`tsx`). Name DTOs `*.dto.ts` and entities `*.entity.ts`.
- Server errors are centralized in `apps/server/src/common/errors/`. A global `AllExceptionsFilter` (`APP_FILTER`) returns `{ statusCode, code, message, details?, path, timestamp }` and maps Prisma P2002/P2025/P2003 to 409/404/409, so services don't catch Prisma errors. Throw `AppException(status, ErrorCode.X, msg)` for a specific code; plain Nest exceptions get a default code. Validation errors come from `validationExceptionFactory` with per-field `details`. Add `@ApiErrorResponses()` to controllers for Swagger.
- Server data layer: `prisma/` (`schema.prisma`, `migrations/`, `seed.ts`), `src/prisma/` (`PrismaModule`/`PrismaService`, `@prisma/adapter-pg`), and the generated client in `src/generated/prisma` (gitignored; run `pnpm db:generate`). Feature modules sit beside it, e.g. `src/admins/` (controller, service, `dto/`: `POST/GET /admins`, `GET/PATCH/DELETE /admins/:id`, argon2 password hashes never returned).
- Server auth: `src/admin/` holds `auth/` (`/admin/auth/login|refresh|logout` public, `GET /admin/auth/me`) and `users/` (`GET /admin/users`, `PATCH /admin/users/:id/disable|reactivate`, `DELETE /admin/users/:id`), and `audit/` (`GET /admin/audit-logs`, filters `action`, `adminId`, `targetUserId`, `from`, `to`). `AdminJwtGuard` is registered globally (`APP_GUARD` in `app.module.ts`): every route requires a Bearer admin JWT (`role: "admin"`, and the admin must be `ACTIVE` in the DB) unless marked `@Public()` (e.g. the hello route, auth endpoints). That includes `/admins`. `@CurrentAdmin()` injects the authenticated admin; disabling a user revokes their sessions.
- Pagination: `common/dto/pagination-query.dto.ts` holds `page` and `limit` (max 100). List endpoints extend `common/dto/list-query.dto.ts` (adds `search`, `status`) or, like the audit log, extend `PaginationQueryDto` directly with their own filters. They build Prisma args with `pageArgs()` and return `paginated()` (`{ data, page, limit, total }`) from `common/pagination.util.ts`.
- Tooling files: `apps/server` `postinstall` runs `prisma skills sync`; the dirs it writes (`apps/server/.agents|.claude|.cursor|.devin`) are gitignored. `graphify-out/` is gitignored; `.claude/settings.json` holds graphify PreToolUse hooks. `.vscode/settings.json` makes Biome the formatter and points TS at the server's `typescript`.
- `tsconfig.base.json`: shared strict config. Workspaces extend it (see `apps/web/tsconfig.json`).
- `turbo.json`: tasks `build` (depends on `^build`, outputs `dist/**`), `typecheck` (depends on `^typecheck`), `dev` (persistent, uncached).

## Conventions

- **Strict TS**: `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax`. Use `import type` for type-only imports (Biome `useExportType` also enforced). Target ES2023, `moduleResolution: bundler`.
- **Formatting** (Biome): 2-space indent, double quotes, semicolons, ES5 trailing commas. Biome only checks `apps/**/src`, `packages/**/src`, and `apps/**/vite.config.*`. Files outside that (root configs, `index.html`) are not linted by `pnpm lint`.
- **Import order**: packages, blank line, aliases, blank line, relative (`./`). Biome organizes these automatically.
- **Lint rules that bite**: no `any`, no unused imports/variables, `useAwait` (async functions must await), no `console` (warn), no `debugger`, `useExhaustiveDependencies` (warn), sorted Tailwind classes in `cn`/`clsx`/`twMerge`/`cva` calls.
- **Components**: named function exports (`export function App()`), not default exports.
- **Env files**: `.env*` is gitignored except `.env.example`.

## Git workflow

- Conventional Commits enforced by commitlint (`commit-msg` hook), e.g. `feat: add vault list`.
- Husky `pre-commit` runs lint-staged: `biome check --write` on staged js/ts/json/css/html files. Don't bypass hooks with `--no-verify`.
- Before finishing a change, run `pnpm typecheck && pnpm lint`.

## Updating this file

When the user says "update claude.md", find the latest commit that touched this file (`git log -1 --format=%H -- CLAUDE.md`, or the latest commit whose message mentions updating claude.md). Review everything that changed in the repo since that commit (`git diff <sha>..HEAD`, `git log <sha>..HEAD`), then update CLAUDE.md to reflect only what's new or stale.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`CONTEXT.md` + `docs/adr/` at repo root). See `docs/agents/domain.md`.

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
