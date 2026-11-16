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

Not done yet: default `user_settings` on register (the table doesn't exist), and a user JWT guard (comes with Profile/Vault).

## To implement (end-user API)

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
