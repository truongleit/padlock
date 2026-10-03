# Technical debt

Known gaps in the admin auth flow (`apps/server/src/admin/auth/admin-auth.service.ts`), found in review on 2026-10-03. Fixed already: refresh-token race and non-atomic rotation (now one transaction with a conditional revoke), shared argon2 options (`src/common/password.util.ts`), and email normalization (`src/common/email.util.ts`: `@NormalizeEmail()` on all admin DTOs, `normalizeEmail()` in the seed).

Priority: **H** = fix before real use, **M** = fix before production, **L** = nice to have.

| # | Item | Priority |
| --- | --- | --- |
| 1 | No refresh-token reuse detection | M |
| 2 | Sessions are never cleaned up | M |
| 3 | Sliding session expiry has no absolute cap | M |
| 4 | Access token outlives logout / admin disable | H |
| 5 | Minor cleanups | L |

## 1. No refresh-token reuse detection (M)

**Now:** presenting an already-revoked refresh token returns 401 and nothing else (`refresh()`).

**Risk:** a revoked token being replayed means it was stolen or leaked. The legitimate holder's newer session stays alive, so the attacker's access can continue if they hold the newer token.

**Fix:** when a session is found with `revokedAt` set (and the admin is otherwise valid), revoke all of that admin's active sessions (`updateMany` where `adminId` and `revokedAt: null`), then return 401. Consider logging the event.

**Note:** a client that retries a refresh after a network failure will also trigger this. Decide whether to allow a short grace window (for example 10 seconds after `revokedAt`) before treating it as reuse.

## 2. Sessions are never cleaned up (M)

**Now:** every login and every refresh inserts a `sessions` row. Expired and revoked rows are never deleted. The same applies to `password_reset_tokens`.

**Fix:** a scheduled job (for example `@nestjs/schedule`, daily) that deletes rows where `expiresAt < now()` or `revokedAt < now() - retention`. Keep revoked rows for a short window if reuse detection (item 1) needs them. Add an index on `expires_at` if the table grows.

## 3. Sliding session expiry has no absolute cap (M)

**Now:** each refresh creates a session with a fresh `REFRESH_TTL_MS` (7 days), so an active admin is never forced to log in again.

**Fix:** if that is not intended, store the original login time (for example `familyStartedAt` on `sessions`, copied on rotation) and reject refresh once it is older than an absolute limit (for example 30 days). Needs a schema change. If unlimited sliding sessions are intended, record that decision instead.

## 4. Access token outlives logout / admin disable (H)

**Now:** `JwtModule` and the auth guard are not implemented yet. The JWT contains only `sub` and `role`, with no session id. A logged-out or disabled admin keeps access until the access token expires.

**Fix, when wiring auth:**
- Register `JwtModule` with `signOptions: { expiresIn: "15m" }` (as `guides/ADMIN_AUTH_GUIDE.md` specifies).
- Decide whether the guard checks `admin.status === "ACTIVE"` on every request (one query, immediate effect) or accepts the 15 minute lag.
- If logout must take effect immediately, add a `sid` claim and check that the session is not revoked in the guard.

## 5. Minor cleanups (L)

- `refresh()` throws `UnauthorizedException()` with no message while `login()` uses "Invalid credentials". Make them consistent.
- `login()` updates `lastLoginAt` before the session is created. If `issue()` fails, `lastLoginAt` is still set. Harmless, but it could move into the same transaction.
- `dummyHash` is `""` until `onModuleInit` completes. The `.catch(() => false)` in `login` covers it, but initializing it eagerly would remove the special case.
- No tests exist for any of this. Rotation, concurrent refresh, reuse, expiry and disabled-admin cases are good first candidates once a test runner is added.
