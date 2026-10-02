# Padlock

Early-stage Turborepo monorepo. Currently one app (`apps/web`, a Vite + React 19 SPA) that renders a placeholder heading. No backend, database, auth, tests, CI, Docker, or deployment config exists yet. Don't assume any of them; add them deliberately.

@AGENTS.md

## Toolchain

- Node 25.7.0, pnpm 12.8.1 (pinned in `.tool-versions` and `packageManager`). Use pnpm only.
- Turborepo `^2.11` (see AGENTS.md: read the installed package's bundled docs before changing `turbo.json` or turbo commands).
- TypeScript 7, Vite 8, React 19, Biome 2 (lint + format + import sorting).
- `pnpm-workspace.yaml` includes only `apps/*`. Add `packages/*` there when creating shared packages. Biome's `files.includes` in `biome.json` already covers `packages/**/src`.
- `pnpm-workspace.yaml` has `minimumReleaseAgeExclude` entries for pinned `turbo` and `vite` versions. Update them when bumping those.

## Commands (run from repo root)

| Command | Purpose |
| --- | --- |
| `pnpm dev` / `pnpm dev:web` | Start dev server(s) via turbo |
| `pnpm build` | `turbo run build` (web: `tsc && vite build`, output `dist/`) |
| `pnpm typecheck` | `turbo run typecheck` (`tsc` per workspace, `noEmit`) |
| `pnpm lint` | `biome check .` (read-only) |
| `pnpm format` | `biome check --write .` (fix lint, format, sort imports) |

There is no test runner configured. If you add one, add a turbo `test` task and update this file.

## Layout

- `apps/web/`: Vite React app. Entry `src/main.tsx` (StrictMode, throws if `#root` is missing), root component `src/App.tsx`.
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