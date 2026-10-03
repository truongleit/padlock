# Padlock Admin auth: tables first, then login, refresh, logout

## Context

This is the slow, small version of Milestones 1 (rest) and 2 of `ADMIN_GUIDE.md`. It picks up where `ADMIN_CRUD_GUIDE.md` ended.

Scope:
- **Part A (Milestone 1, rest):** add the remaining tables (`User`, `VaultItem`, `Session`, `PasswordResetToken`, `AdminAuditLog`), migrate, add two CHECK constraints.
- **Part B (Milestone 2):** admin `login`, `refresh` (with token rotation), `logout`, using a short-lived JWT access token and a refresh token in an httpOnly cookie.

Not in this guide: the guard that protects routes (Milestone 3), user management (4), password reset (5), throttling (6), tests (7).

> **Warning:** until Milestone 3, `/admins` is still open. Login works, but nothing checks the token yet.

Rules of this repo: pnpm only, extensionless imports with the `@/*` alias for cross-folder imports and `./` for siblings, DTOs are `*.dto.ts`, no `any`, `async` functions must `await`, Conventional Commits, run `pnpm typecheck && pnpm lint` before each commit. Type the code yourself so it sticks.

### Decisions already made (change them if you disagree)

| Topic | Decision |
| --- | --- |
| Access token | JWT, 15 min, sent as `Authorization: Bearer`, payload `{ sub: adminId, role: "admin" }` |
| Refresh token | 32 random bytes (base64url), 7 days, httpOnly cookie `admin_refresh`, path `/admin/auth` |
| Storage | Only the SHA-256 **hash** of the refresh token is stored (`sessions.refresh_token_hash`) |
| Rotation | Every refresh revokes the old session row and issues a new one |
| Login errors | One generic 401 for unknown email, wrong password, or disabled admin |
| Routes | `POST /admin/auth/login`, `POST /admin/auth/refresh`, `POST /admin/auth/logout` |

## Target structure (`apps/server`)

```
prisma/schema.prisma                                  (edit in Part A)
src/
  common/token.util.ts                                (new)
  admin/
    admin.module.ts                                   (new; not to be confused with admins/)
    auth/admin-auth.controller.ts
    auth/admin-auth.service.ts
    auth/dto/admin-login.dto.ts
```

---

# Part A: Milestone 1 (rest), the tables

## A1: Add enums and models

Check where you are first:
```bash
docker compose up -d db
pnpm db:migrate        # should say "already in sync"
```

Edit `apps/server/prisma/schema.prisma`. Keep the generator, datasource, `AccountStatus`, and `Admin` as they are. Add two enums:
```prisma
enum ClientType {
  WEB
  EXTENSION
  ADMIN
}

enum AuditAction {
  DISABLE
  REACTIVATE
  DELETE
}
```

Add the back-relation fields to `Admin` (above `@@map`):
```prisma
  sessions    Session[]
  resetTokens PasswordResetToken[]
  auditLogs   AdminAuditLog[]
```

Add the new models. Column names follow `docs/padlock_database_design.md`; `@map` keeps Postgres in snake_case while TypeScript stays camelCase.
```prisma
model User {
  id                      String               @id @default(uuid()) @db.Uuid
  email                   String               @unique
  authHash                Bytes                @map("auth_hash")
  kdfSalt                 Bytes                @map("kdf_salt")
  kdfParams               Json                 @map("kdf_params")
  wrappedVaultKeyMaster   Bytes                @map("wrapped_vault_key_master")
  wrappedVaultKeyRecovery Bytes                @map("wrapped_vault_key_recovery")
  wrapIvMaster            Bytes                @map("wrap_iv_master")
  wrapIvRecovery          Bytes                @map("wrap_iv_recovery")
  status                  AccountStatus        @default(ACTIVE)
  createdAt               DateTime             @default(now()) @map("created_at") @db.Timestamptz
  updatedAt               DateTime             @updatedAt @map("updated_at") @db.Timestamptz
  vaultItems              VaultItem[]
  sessions                Session[]
  resetTokens             PasswordResetToken[]

  @@map("users")
}

model VaultItem {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  ciphertext Bytes
  iv         Bytes
  encVersion Int      @default(1) @map("enc_version") @db.SmallInt
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, updatedAt])
  @@map("vault_items")
}

model Session {
  id               String     @id @default(uuid()) @db.Uuid
  userId           String?    @map("user_id") @db.Uuid
  adminId          String?    @map("admin_id") @db.Uuid
  refreshTokenHash Bytes      @unique @map("refresh_token_hash")
  clientType       ClientType @map("client_type")
  expiresAt        DateTime   @map("expires_at") @db.Timestamptz
  revokedAt        DateTime?  @map("revoked_at") @db.Timestamptz
  createdAt        DateTime   @default(now()) @map("created_at") @db.Timestamptz
  user             User?      @relation(fields: [userId], references: [id], onDelete: Cascade)
  admin            Admin?     @relation(fields: [adminId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model PasswordResetToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String?   @map("user_id") @db.Uuid
  adminId   String?   @map("admin_id") @db.Uuid
  tokenHash Bytes     @unique @map("token_hash")
  expiresAt DateTime  @map("expires_at") @db.Timestamptz
  usedAt    DateTime? @map("used_at") @db.Timestamptz
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz
  user      User?     @relation(fields: [userId], references: [id], onDelete: Cascade)
  admin     Admin?    @relation(fields: [adminId], references: [id], onDelete: Cascade)

  @@map("password_reset_tokens")
}

model AdminAuditLog {
  id           String      @id @default(uuid()) @db.Uuid
  adminId      String      @map("admin_id") @db.Uuid
  targetUserId String      @map("target_user_id") @db.Uuid // no relation on purpose: the log survives user deletion
  action       AuditAction
  createdAt    DateTime    @default(now()) @map("created_at") @db.Timestamptz
  admin        Admin       @relation(fields: [adminId], references: [id])

  @@map("admin_audit_logs")
}
```

Why these choices (read before moving on):
- **`Session` and `PasswordResetToken` have two nullable owner columns** (`userId` or `adminId`): one table serves both account types. "Exactly one of the two is set" can't be expressed in Prisma, so a CHECK constraint (A2) enforces it.
- **`refreshTokenHash` is `@unique`**: it doubles as the lookup index for `findUnique` at refresh time.
- **`onDelete: Cascade`** on sessions/tokens/vault items: deleting an account removes everything it owned.
- **`AdminAuditLog.admin` has no cascade**: deleting an admin who has audit rows fails with a 409 (Prisma P2003, mapped by the global filter). That is intentional for now: an audit trail shouldn't vanish silently.
- **`targetUserId` has no relation**: after a user is deleted, the "DELETE" log row must remain.
- `UserSettings` is omitted; add it when you build the user feature.

## A2: Migrate, but don't apply yet

```bash
pnpm --filter server exec prisma migrate dev --create-only --name add_auth_and_user_tables
```

`--create-only` writes `prisma/migrations/<timestamp>_add_auth_and_user_tables/migration.sql` without running it. Open it and read it: you should see `CREATE TYPE` for the two enums, `CREATE TABLE` for five tables, unique indexes, and foreign keys. If anything looks off (for example it tries to touch `admins` columns), fix the schema and delete that migration folder before retrying.

Append these two statements at the end of that `migration.sql`:
```sql
ALTER TABLE sessions ADD CONSTRAINT sessions_one_owner
  CHECK ((user_id IS NULL) <> (admin_id IS NULL));

ALTER TABLE password_reset_tokens ADD CONSTRAINT reset_one_owner
  CHECK ((user_id IS NULL) <> (admin_id IS NULL));
```
`(a IS NULL) <> (b IS NULL)` is true only when exactly one of them is null, so a row with both owners or neither is rejected by the database itself.

Apply and regenerate:
```bash
pnpm db:migrate        # applies it
pnpm db:generate
```

## A3: Verify

```bash
pnpm db:studio
```
- Tables now: `admins`, `users`, `vault_items`, `sessions`, `password_reset_tokens`, `admin_audit_logs`.
- Prove the CHECK works. In `psql` (or any SQL client) try inserting a session with both `user_id` and `admin_id` null; it must fail with `sessions_one_owner`:
  ```bash
  docker compose exec db psql -U padlock -d padlock \
    -c "INSERT INTO sessions (id, refresh_token_hash, client_type, expires_at) VALUES (gen_random_uuid(), '\x00', 'ADMIN', now());"
  ```
- Add 2 or 3 fake users in Studio (any bytes for the `Bytes` columns, `{}` for `kdf_params`). Milestone 4 will need them. Studio's bytes input is awkward; if you prefer, add a small block to `prisma/seed.ts` that upserts fake users with `Buffer.from("x")` values instead.

Checkpoint: `pnpm typecheck && pnpm lint` pass.

Commit: `feat(server): add user, session, reset token and audit log tables`.

---

# Part B: Milestone 2, login, refresh, logout

## B1: Dependencies

```bash
pnpm --filter server add @nestjs/jwt
```
Already installed and used here: `argon2`, `class-validator`, `class-transformer`, `cookie-parser` (wired in `main.ts`), `@nestjs/config`.

## B2: Token helpers

`src/common/token.util.ts`:
```ts
import { createHash, randomBytes } from "node:crypto";

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

// Copying into a Uint8Array keeps Prisma's Bytes type happy
export function hashToken(token: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash("sha256").update(token).digest());
}
```
Why SHA-256 and not argon2 here: the refresh token is already 256 bits of randomness, so there is nothing to brute-force; a fast hash is enough and lets you look the row up by hash. Passwords are low-entropy and need a slow hash. Why hash at all: a leaked database dump can't be replayed as live sessions.

## B3: Login DTO

`src/admin/auth/dto/admin-login.dto.ts`:
```ts
import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class AdminLoginDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value
  )
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
```
Note: login does not enforce the 12-character minimum. That rule is for choosing a password; at login you only check what is stored. `MaxLength` stops someone from making you hash a megabyte string.

## B4: The service

`src/admin/auth/admin-auth.service.ts`:
```ts
import {
  Injectable,
  type OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";

import { hashToken, newToken } from "@/common/token.util";
import { PrismaService } from "@/prisma/prisma.service";

export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AdminAuthService implements OnModuleInit {
  // A real argon2 hash of a throwaway string, so an unknown email costs the
  // same time as a wrong password. Built once at startup.
  private dummyHash = "";

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async onModuleInit() {
    this.dummyHash = await argon2.hash(newToken(), { type: argon2.argon2id });
  }

  async login(email: string, password: string) {
    const admin = await this.prisma.admin.findUnique({ where: { email } });
    const ok = await argon2
      .verify(admin?.passwordHash ?? this.dummyHash, password)
      .catch(() => false);
    if (!(admin && ok) || admin.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid credentials");
    }
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });
    return this.issue(admin.id);
  }

  async refresh(rawToken: string | undefined) {
    if (!rawToken) throw new UnauthorizedException();
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(rawToken) },
      include: { admin: true },
    });
    if (
      !session?.admin ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.admin.status !== "ACTIVE"
    ) {
      throw new UnauthorizedException();
    }
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() }, // rotation: the old token is dead
    });
    return this.issue(session.admin.id);
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issue(adminId: string) {
    const refreshToken = newToken();
    await this.prisma.session.create({
      data: {
        adminId,
        refreshTokenHash: hashToken(refreshToken),
        clientType: "ADMIN",
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    const accessToken = await this.jwt.signAsync({
      sub: adminId,
      role: "admin",
    });
    return { accessToken, refreshToken };
  }
}
```

Why these details matter:
- **Same error and same cost for every login failure.** Unknown email, wrong password, and disabled admin all return the identical 401, and the dummy hash means an unknown email still pays for a full argon2 verify. Otherwise response time tells an attacker which emails exist.
- **`.catch(() => false)`** on `verify`: a malformed stored hash throws; treat it as a failed login, not a 500.
- **Rotation:** each refresh kills the old session row and creates a new one, so a stolen cookie works at most once before the legitimate client's next refresh fails (a signal something is wrong).
- **`logout` never throws** for a missing or unknown cookie: logging out twice is fine.
- `onModuleInit` is the same lifecycle hook `PrismaService` uses. Top-level `await` for the dummy hash would also work, but a provider hook keeps it testable.

Optional exercise (do after the checkpoint): detect **refresh reuse**. If a presented token belongs to an already-revoked session, someone replayed an old token; revoke every active session for that admin.

## B5: The controller

`src/admin/auth/admin-auth.controller.ts`:
```ts
import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";

import { ApiErrorResponses } from "@/common/errors/api-error-responses.decorator";

import { REFRESH_TTL_MS, AdminAuthService } from "./admin-auth.service";
import { AdminLoginDto } from "./dto/admin-login.dto";

const COOKIE = "admin_refresh";
const COOKIE_PATH = "/admin/auth";

@Controller("admin/auth")
@ApiErrorResponses()
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly config: ConfigService
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { accessToken, refreshToken } = await this.auth.login(
      dto.email,
      dto.password
    );
    this.setCookie(res, refreshToken);
    return { accessToken };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const { accessToken, refreshToken } = await this.auth.refresh(
      this.readCookie(req)
    );
    this.setCookie(res, refreshToken);
    return { accessToken };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    await this.auth.logout(this.readCookie(req));
    res.clearCookie(COOKIE, { path: COOKIE_PATH });
  }

  private readCookie(req: Request): string | undefined {
    const value: unknown = req.cookies?.[COOKIE];
    return typeof value === "string" ? value : undefined;
  }

  private setCookie(res: Response, token: string) {
    res.cookie(COOKIE, token, {
      httpOnly: true,
      secure: this.config.get("NODE_ENV") === "production",
      sameSite: "strict",
      path: COOKIE_PATH,
      maxAge: REFRESH_TTL_MS,
    });
  }
}
```
Why:
- **`passthrough: true`** lets you set cookies on the Express response while Nest still serializes your return value (without it you must call `res.json()` yourself).
- **`httpOnly`**: JavaScript on the page can't read the refresh token, so an XSS bug can't steal it.
- **`sameSite: "strict"` + narrow `path`**: the cookie is only sent to `/admin/auth/*`, never to other endpoints, which shrinks CSRF exposure.
- **`secure` only in production**: browsers drop `Secure` cookies over plain `http://localhost` otherwise.
- **`readCookie` checks `typeof`**: `req.cookies` is loosely typed, and the repo bans `any`.
- Import order: if Biome complains about `REFRESH_TTL_MS, AdminAuthService` ordering, run `pnpm format`.

## B6: The module

`src/admin/admin.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { AdminAuthController } from "./auth/admin-auth.controller";
import { AdminAuthService } from "./auth/admin-auth.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("ADMIN_JWT_SECRET"),
        signOptions: { expiresIn: "15m" },
      }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService],
})
export class AdminModule {}
```
Register it in `src/app.module.ts` next to `AdminsModule`:
```ts
imports: [
  ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
  PrismaModule,
  AdminsModule,
  AdminModule, // the portal API: auth now, users later
],
```
Naming reminder: `admins/` is CRUD over admin accounts; `admin/` is the portal API an admin uses. Keep them separate.

If TypeScript complains about `expiresIn: "15m"`'s type, check the installed `@nestjs/jwt` / `jsonwebtoken` types; some versions want a branded string or a number of seconds (`900`).

## B7: Checkpoint

```bash
pnpm dev:server
```
Use the seeded admin from `.env` (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). `-c jar` saves cookies, `-b jar` sends them.
```bash
# 1. login: 200, body has accessToken, response has Set-Cookie: admin_refresh=...; HttpOnly; Path=/admin/auth
curl -i -c jar -H 'content-type: application/json' \
  -d '{"email":"admin@padlock.local","password":"ChangeMe-12345!"}' \
  localhost:3000/admin/auth/login

# 2. refresh: 200, a NEW cookie value (compare jar before/after)
cp jar jar.old
curl -i -b jar -c jar -X POST localhost:3000/admin/auth/refresh

# 3. replay the OLD cookie: 401 (rotation worked)
curl -i -b jar.old -X POST localhost:3000/admin/auth/refresh

# 4. logout: 204, cookie cleared; refreshing with the jar afterwards is 401
curl -i -b jar -c jar -X POST localhost:3000/admin/auth/logout
curl -i -b jar -X POST localhost:3000/admin/auth/refresh
```
Negatives:
- Wrong password and unknown email return the **same** 401 body (compare them).
- `{"email":"nope","password":"x"}` returns 400 with per-field `details`; an extra field returns 400.
- No cookie on refresh returns 401.
- In Studio: `sessions` rows have `admin_id` set, `user_id` null, `client_type = ADMIN`, and the old rows have `revoked_at` filled. `admins.last_login_at` updated.
- Disable the admin (`PATCH /admins/:id {"status":"DISABLED"}` while another active admin exists), then log in: still the same generic 401. Re-enable it afterwards.
- Decode the access token at jwt.io (it is not secret): payload has `sub`, `role: "admin"`, `exp` about 15 minutes out.
- `/docs` shows the three routes with the error responses. The spec is rewritten to `docs/swagger.json` on startup.

Run `pnpm typecheck && pnpm lint`.

Commit: `feat(server): add admin login, refresh and logout`.

---

## Things to decide and note down

- Should login also revoke the admin's older sessions (single session), or allow many (current behavior)?
- Should an unknown or expired refresh cookie also clear the cookie in the response?
- Do you want a stable `ErrorCode` for refresh failures (for example `TOKEN_EXPIRED`) so the web client can tell "log in again" from "bad credentials"? Add it to `error-codes.ts` first, then throw `AppException(401, ErrorCode.X, msg)`.

## What's next

1. **Milestone 3:** `AdminJwtGuard` + `@CurrentAdmin()`, a `/admin/auth/me` test route, and finally protecting the open `/admins` CRUD.
2. Then Milestone 4 (user management and audit log), which uses the tables from Part A.

When you get stuck or finish a part, ask me to explain a concept or review your diff.
