# Wire the extension to the end-user API, in phases

## Context

The extension (`apps/extension`) keeps a zero-knowledge vault entirely in `browser.storage` (`src/lib/vault.ts`); every "server" step is a `ponytail:` placeholder. The server now implements every end-user route (`docs/remaining_apis.md`): `/auth/*`, `/me`, `/me/settings`, `/me/sessions`, `/vault/items`. Goal: make the server the source of truth, phase by phase, each phase shippable on its own (own branch/PR, `pnpm typecheck && pnpm lint && pnpm test` green).

Decisions made:
- **Existing local-only vaults are discarded** (dev data). The authKey changes key derivation, so old accounts can't log in.
- **Offline = read-only cache.** Encrypted items stay cached in `local:vaultItems`; unlock, view and autofill work offline; writes need the server.

## Shared design (applies to all phases)

- **Key derivation** (`src/lib/crypto.ts`): PBKDF2 `deriveBits(256)` from master + `kdfSalt`, then HKDF-SHA256 into two keys: `info "enc"` → AES-GCM wrap key (replaces `masterKey`), `info "auth"` → 32 raw bytes, base64 = `authKey`. `kdfParams` gains nothing new; `DEFAULT_KDF` must keep matching the server's fake prelogin params (`auth.service.ts:24`). Extend `crypto.spec.ts`: authKey is stable for same master+salt, differs from the wrap key, and differs across masters.
- **API client** `src/lib/api.ts` (new, plain `fetch`, no new deps): base URL from `import.meta.env.WXT_API_URL` (add `apps/extension/.env.example`), `credentials: "include"`, Bearer from `session:auth` (storage.session, `{ accessToken }`), throws an `ApiError { status, code, message }` from the server's error body. On 401 (non-`/auth/` path): refresh once and retry. Refresh is single-flight across popup, app page and background via `navigator.locks.request("padlock-refresh")`, re-reading the token after acquiring the lock (the server rotates the refresh cookie, so two parallel refreshes would kill the session; mirrors `apps/web/src/lib/api/client.ts`).
- **Manifest** (`wxt.config.ts`): add `host_permissions` for the API origin (derived from `WXT_API_URL`).
- **CORS (verified):** Chrome still sends a CORS preflight from the extension page, so the API must list the extension origin. `wxt.config.ts` sets a manifest `key` that pins the ID to `chrome-extension://lmnimgnengbkccilbagddlaaahgnebop`; add that to `ADMIN_EXTRA_ORIGINS` and set `ADMIN_COOKIE_CROSS_SITE=true` (the extension origin is cross-site to the API, so a `SameSite=Strict` refresh cookie is never sent).
- **State model** (`vault.ts` / `VaultProvider.tsx`): `local:account` becomes `{ userId?, email, keys: MasterWrap, settings }` — the recovery wrap is no longer stored locally (the server returns it only via reset verify). `status: "none"` = no account on this device → signup **or** login. `"locked"` = account cached, unlock is local (unwrap the cached master wrap, no network). Auto-lock (`background.ts`) only clears `session:unlock`; the auth token survives. Explicit **Log out** = `POST /auth/logout` + clear account, items, tokens.
- Remove each `ponytail:` placeholder comment the phase replaces; update the header comment in `vault.ts` and CLAUDE.md's extension line ("no server calls yet") at the end.

## Phase 1 — Auth (register, prelogin, login, refresh, logout)

- `crypto.ts`: HKDF split above; `createAccount` returns `authKey` too.
- `api.ts` + `.env.example` + `host_permissions`.
- `vault.ts`:
  - On load, an account without `userId`/new-shape keys (old local vault) is wiped → `status: "none"`.
  - `signup(email, master)`: `createAccount` → `POST /auth/register` (409 `EMAIL_TAKEN` → field error) → then `login` so tokens exist. Returns the recovery key as today.
  - `login(email, master)` (new): `POST /auth/prelogin` → derive keys → `POST /auth/login` (`clientType: "EXTENSION"`) → store access token, account (email, master wrap from the response), start unlock session.
  - `unlock(master)`: local unwrap as today; then `ensureSession(master)`: try refresh, and if that 401s call `login` again (we hold the master right now).
  - `logout()`: `POST /auth/logout`, clear everything.
- Reset (`resetWithRecovery`, `resetAccount`) rejects with "not connected yet" until phase 4: a local-only reset would desync the server auth key.
- UI: `App.tsx` lets `status: "none"` reach `/login` and `/signup` (add links between them); `LoginPage` calls `login` when `status === "none"`, `unlock` when locked; popup `Unlock` unchanged (locked only), shows "Log in in the full app" when `none`. Settings "Log out" button next to Lock.
- Check: register + login + reload app + lock/unlock + logout against local server (`pnpm dev:server`), confirm refresh cookie is sent from the extension (network tab).

## Phase 2 — Vault sync (`/vault/items`)

- `loadVault` stays cache-first: decrypt `local:vaultItems` immediately; after unlock, `pullItems()` = `GET /vault/items` → replace the cache (server ids, `createdAt`/`updatedAt` from server). Network error → keep cache, flag `offline` in `VaultState` (popup/app show a small "Offline, read-only" note and disable save/delete buttons).
- `saveCredential`: encrypt → `POST` (new) or `PUT /vault/items/:id` (existing; fresh IV each time already) → write the returned row into the cache. Drop the client `crypto.randomUUID()` id.
- `deleteCredential`: `DELETE /vault/items/:id`, then remove from cache (404 → remove anyway).
- Pull again on popup open / app focus (`visibilitychange`), throttled like `touch()`.
- Call sites unchanged except error toasts: `CredentialFormPage`, `RotatePasswordPage`, `CredentialDetailPage`.
- Check: add/edit/delete in the app, verify rows in `pnpm db:studio`; second browser profile logs in and sees the same items; stop the server → vault still unlocks and lists items read-only.

## Phase 3 — Settings and profile (`/me`, `/me/settings`, `/me/master-password`, `/me/sessions`)

- Settings: `login`/pull fetches `GET /me/settings` into `account.settings` (auto-lock in `background.ts` keeps reading the cached copy). `saveSettings` → `PATCH /me/settings`, then cache.
- *(Done in phase 1, since a local-only change would desync the server auth key.)* `changeMaster(current, next)`: derive current authKey + new keys (`wrapMaster` with a fresh salt) → `PATCH /me/master-password` (403 → "Current password is wrong") → server revokes all sessions, so immediately `login(email, next)`; update cached master wrap.
- Sessions: new section in `SettingsPage` listing `GET /me/sessions` (client type, created, expires) with Revoke (`DELETE /me/sessions/:id`). Marking the current session needs a session id the server doesn't return; skip it (revoking your own just triggers re-login on next refresh).
- Check: change a setting in one profile, re-login elsewhere shows it; change master → old master fails, new one works, other profile is logged out; revoke a session from the list.

## Phase 4 — Forgot / reset (`/auth/forgot-password`, `reset-password/verify`, `reset-password`, `reset-account`)

- Flow per `remaining_apis.md`: the email carries a **code**, not a link. `ForgotPasswordPage` → `POST /auth/forgot-password`, then a "Enter the code from your email" step (stepper step 2 "Check inbox") → `POST /auth/reset-password/verify` returns the recovery wrap → pass code + wrap to `ResetPasswordPage` via the router state (as `navigate("/recovery-key", key)` does today).
- `resetWithRecovery(code, wrap, recoveryKey, master)`: unwrap with recovery key locally (wrong key → error, no server call) → new master wrap + new recovery wrap + authKey → `POST /auth/reset-password` → `login` → show new recovery key.
- `resetAccount(code, master)`: fresh vault key → `POST /auth/reset-account` with `confirm: true` → clear item cache → `login` → new recovery key.
- Routes `/forgot` and `/reset` must be reachable from `status: "none"` too (forgot from a fresh device).
- Check: with `SMTP_HOST` unset the code is logged by the server console; run both reset paths end to end; expired/used code shows the server's error.

## Critical files

- `apps/extension/src/lib/crypto.ts`, `crypto.spec.ts`
- `apps/extension/src/lib/vault.ts`, `src/lib/api.ts` (new)
- `apps/extension/src/components/VaultProvider.tsx`, `src/entrypoints/background.ts`
- `apps/extension/src/entrypoints/app/App.tsx` and pages `LoginPage`, `SignupPage`, `SettingsPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `CredentialFormPage`, `CredentialDetailPage`, `RotatePasswordPage`
- `apps/extension/src/entrypoints/popup/App.tsx`
- `apps/extension/wxt.config.ts`, `apps/extension/.env.example` (new)
- Reference: `apps/web/src/lib/api/client.ts` (refresh single-flight pattern), `apps/server/src/auth/*`, `docs/remaining_apis.md`, `docs/swagger.json`

## Verification (every phase)

1. `docker compose up -d db`, `pnpm db:migrate`, `pnpm dev:server`, `pnpm dev:extension` (load `.output/chrome-mv3-dev`).
2. Run the phase's "Check" list in the browser; watch requests in the extension page's devtools.
3. `pnpm typecheck && pnpm lint && pnpm test` from the root.

Each phase starts when the previous one is merged.
