# Remaining APIs

Gap between the SRS (`padlock_srs.md`) and DB design (`padlock_database_design.md`) and what the server implements (`swagger.json`), as of 2026-11-16.

The SRS describes features, not routes, so the paths below are proposals. They follow the existing `/admin/auth/*` naming.

## Already implemented (admin side)

| Area | Routes |
| --- | --- |
| FR-12 admin auth | `POST /admin/auth/login`, `refresh`, `logout`, `forgot-password`, `reset-password`; `GET /admin/auth/me` |
| FR-13 user management | `GET /admin/users`, `PATCH /admin/users/:id/disable`, `PATCH /admin/users/:id/reactivate`, `DELETE /admin/users/:id` |
| Audit log | `GET /admin/audit-logs` |
| Admins CRUD | `POST/GET /admins`, `GET/PATCH/DELETE /admins/:id` |

## To implement (end-user API)

### Auth (FR-1, NFR-SEC-2/9/10/11)

| Route | Purpose |
| --- | --- |
| `POST /auth/register` | Create the account and its default settings. The client sends `authKey`, `kdfSalt`, `kdfParams`, both wrapped vault keys and their IVs. |
| `POST /auth/prelogin` | Return `kdfSalt` and `kdfParams` for an email so the client can derive the auth key. Unknown emails get a fake but stable response so it doesn't reveal who is registered. |
| `POST /auth/login` | Check the auth hash and that the account is `ACTIVE`, create a session, return the access token and wrapped keys. Sets the refresh cookie. |
| `POST /auth/refresh` | Rotate the session. |
| `POST /auth/logout` | Revoke the session. |
| `POST /auth/forgot-password` | Email a reset link (FR-1.4). Same response whether or not the email exists. |
| `POST /auth/reset-password/verify` | Check the token and return `wrappedVaultKeyRecovery` and its IV so the client can unwrap with the recovery key. |
| `POST /auth/reset-password` | Use up the token. Store the new auth hash, the new master wrap and a new recovery wrap (FR-1.5, 1.6), and revoke sessions. |
| `POST /auth/reset-account` | Reset when both the master password and recovery key are lost: delete all vault items, replace the keys, revoke sessions (FR-1.7). Needs a valid token plus an explicit confirm flag. |

### Profile (FR-11)

| Route | Purpose |
| --- | --- |
| `GET /me` | Profile (email, status, created date). |
| `PATCH /me/master-password` | Re-wrap only: new auth hash, salt, KDF params and master wrap. Vault items are left alone. |
| `GET /me/sessions`, `DELETE /me/sessions/:id` | Optional. The DB design mentions letting users revoke sessions per client. |

### Settings (FR-7, FR-4.4)

| Route | Purpose |
| --- | --- |
| `GET /me/settings` | Read `autoLockMinutes`, `clipboardClearSeconds`, `generatorDefaults`. |
| `PATCH /me/settings` | Update them. |

### Vault sync (FR-2, encrypted blobs only)

| Route | Purpose |
| --- | --- |
| `GET /vault/items?since=` | List the user's items. `since` uses `updatedAt` for incremental sync. |
| `POST /vault/items` | Add an item (`ciphertext`, `iv`, `encVersion`). |
| `PUT /vault/items/:id` | Replace an item. Reject an IV the item already used. |
| `DELETE /vault/items/:id` | Delete an item. |

## Notes

- **`UserSettings` table doesn't exist yet.** The DB design defines it, but `apps/server/prisma/schema.prisma` has no such model, so the settings routes need a migration first.
- **Users need their own login guard.** `AdminJwtGuard` is global, so end-user routes have to be marked `@Public()` and then guarded by a separate user JWT guard.
- **No server routes needed** for search, scores, reuse alerts, password age, expiry reminders, the generator, autofill or clipboard. These all run on the client (SRS design decision 4).
- **Open item from `technical_debt.md`:** no scheduled job cleans up expired sessions and reset tokens (item 2).
- **Suggested order:** auth and vault sync first, since the extension currently stores its vault locally only.
