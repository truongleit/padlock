# End-user API status

Gap between the SRS (`padlock_srs.md`) and DB design (`padlock_database_design.md`) and what the server implements (`swagger.json`), as of 2026-11-16.

The SRS describes features, not routes, so the paths below are proposals. They follow the existing `/admin/auth/*` naming.

## Already implemented (admin side)

| Area | Routes |
| --- | --- |
| FR-12 admin auth | `POST /admin/auth/login`, `refresh`, `logout`, `forgot-password`, `reset-password`; `GET /admin/auth/me` |
| FR-13 user management | `GET /admin/users`, `PATCH /admin/users/:id/disable`, `PATCH /admin/users/:id/reactivate`, `DELETE /admin/users/:id` |
| Audit log | `GET /admin/audit-logs` |
| Admins CRUD | `POST/GET /admins`, `GET/PATCH/DELETE /admins/:id` |

## Implemented (end-user auth, `apps/server/src/auth/`)

FR-1, NFR-SEC-2/9/10/11. All routes are public; the refresh token lives in an HTTP-only `refresh` cookie scoped to `/auth`. Byte fields are base64.

| Route | Behaviour |
| --- | --- |
| `POST /auth/register` | Create the account from `email`, `authKey`, `kdfSalt`, `kdfParams` and both wrapped vault keys with their IVs. Stores an Argon2 hash of `authKey`. 409 `EMAIL_TAKEN` if the email exists. |
| `POST /auth/prelogin` | Return `kdfSalt` and `kdfParams` for an email. Unknown emails get a fake but stable salt so the response doesn't reveal who is registered. |
| `POST /auth/login` | `email`, `authKey`, `clientType` (`WEB` or `EXTENSION`). Returns the access token (`role: "user"`), KDF settings and master wrap; sets the refresh cookie. |
| `POST /auth/refresh` | Rotate the session. |
| `POST /auth/logout` | Revoke the session. |
| `POST /auth/forgot-password` | Email a one-time reset **code** (FR-1.4), not a link, since email links can't open the extension. Same response whether or not the email exists. |
| `POST /auth/reset-password/verify` | Check the code without using it up; return `wrappedVaultKeyRecovery` and its IV for the client to unwrap with the recovery key. |
| `POST /auth/reset-password` | Use up the code, store the new auth hash, master wrap and recovery wrap (FR-1.5, 1.6), revoke sessions. |
| `POST /auth/reset-account` | Same, plus `confirm: true`, and deletes every vault item (FR-1.7). |


## Implemented (profile, settings, vault)

All need a user access token (`Authorization: Bearer`, `role: "user"`), checked by `UserJwtGuard` via `@UserAuth()` (`apps/server/src/auth/user-auth.decorator.ts`). A disabled or deleted user is rejected on the next request.

### Profile (FR-11), `apps/server/src/me/`

| Route | Behaviour |
| --- | --- |
| `GET /me` | `id`, `email`, `status`, `createdAt`. |
| `PATCH /me/master-password` | Body: `currentAuthKey` plus the new `authKey`, `kdfSalt`, `kdfParams`, `wrappedVaultKeyMaster`, `wrapIvMaster`. 403 if `currentAuthKey` is wrong. Re-wrap only: vault items and the recovery wrap are untouched. Revokes every session, including the caller's, so the client logs in again. |
| `GET /me/sessions` | Active sessions (`id`, `clientType`, `createdAt`, `expiresAt`). |
| `DELETE /me/sessions/:id` | Revoke one of your sessions. 404 if it isn't yours or is already revoked. |

### Settings (FR-7, FR-4.4)

| Route | Behaviour |
| --- | --- |
| `GET /me/settings` | `autoLockMinutes`, `clipboardClearSeconds`, `generatorDefaults`, `updatedAt`. |
| `PATCH /me/settings` | Partial update. `autoLockMinutes` 1–60, `clipboardClearSeconds` 5–300, `generatorDefaults` is the whole `{ length (8–64), symbols, numbers }` object. |

Settings live in `user_settings` (migration `add_user_settings`, which also backfills existing users). Defaults match the extension: 5 min, 30 s, `{ length: 16, symbols: true, numbers: true }`. Register creates the row.

### Vault sync (FR-2), `apps/server/src/vault/`

| Route | Behaviour |
| --- | --- |
| `GET /vault/items` | All of the user's items: `id`, `ciphertext`, `iv` (base64), `encVersion`, `createdAt`, `updatedAt`. |
| `POST /vault/items` | `ciphertext`, `iv`, optional `encVersion` (default 1). Returns the stored item with its server `id`. |
| `PUT /vault/items/:id` | Replace an item. 400 if `iv` equals the item's current IV. |
| `DELETE /vault/items/:id` | Delete an item. 404 if it isn't yours. |

Vault routes allow 600 requests/min (the first sync uploads one item per request).

**Changed from the original proposal:** `GET /vault/items` has no `since` parameter. Items are hard-deleted, so an incremental query can't tell the client what was removed. Add `since` together with delete tombstones if vaults get large enough for a full list to matter.

## Notes

- **No server routes needed** for search, scores, reuse alerts, password age, expiry reminders, the generator, autofill or clipboard. These all run on the client (SRS design decision 4).
- **Open item from `technical_debt.md`:** no scheduled job cleans up expired sessions and reset tokens (item 2).
- **Next:** wire the extension to these routes. It needs the API host in `host_permissions` and its `chrome-extension://` origin in `ADMIN_EXTRA_ORIGINS`.
