# Padlock Admin: protect the API, then manage users

## Context

This is the slow, small version of Milestones 3 and 4 of `ADMIN_GUIDE.md`. It picks up where `ADMIN_AUTH_GUIDE.md` ended.

Scope:
- **Part A (Milestone 3):** an `AdminJwtGuard` and a `@CurrentAdmin()` decorator, a `GET /admin/auth/me` test route, and finally locking down the open `/admins` CRUD.
- **Part B (Milestone 4):** user management for admins: list users, disable, reactivate, delete, each audit-logged (SRS FR-13, NFR-SEC-5).

Not in this guide: password reset (Milestone 5), throttling (6), tests (7).

### Where the repo should be before you start

From `ADMIN_AUTH_GUIDE.md` you already have: all tables (`User`, `VaultItem`, `Session`, `PasswordResetToken`, `AdminAuditLog`), `AdminModule` with login/refresh/logout, `src/common/token.util.ts`, `src/common/password.util.ts`, and the access-token lifetime in `ADMIN_JWT_EXPIRES_IN` (default `1h`). Check:
```bash
docker compose up -d db
pnpm typecheck && pnpm lint      # both clean
```
Also have 2 or 3 fake `users` rows (Studio, or a seed block): Part B needs data to list and disable.

Rules of this repo: pnpm only, extensionless imports with `@/*` for cross-folder and `./` for siblings, DTOs are `*.dto.ts`, no `any`, `async` must `await`, Conventional Commits, run `pnpm typecheck && pnpm lint` before each commit. Type the code yourself so it sticks.

### Decisions already made (change them if you disagree)

| Topic | Decision |
| --- | --- |
| Guard | Class guard applied with `@UseGuards(AdminJwtGuard)` (a global guard + `@Public()` is an exercise at the end of Part A) |
| Token check | Verify JWT signature and `role === "admin"`, then **look the admin up in the DB** and require `ACTIVE` |
| Missing/bad token | One generic 401, no detail about why |
| Disabled admin | Locked out on the next request (DB check), and their sessions are revoked |
| User routes | `GET /admin/users`, `PATCH /admin/users/:id/disable`, `PATCH /admin/users/:id/reactivate`, `DELETE /admin/users/:id` |
| User responses | Explicit field allowlist: `id, email, status, createdAt`. Never `authHash`, `kdf*`, `wrapped*`, vault data |
| Audit | Every disable / reactivate / delete writes one `AdminAuditLog` row **in the same transaction** |
| Disable a user | Revokes all their active sessions immediately |
| Delete a user | Hard delete, cascades vault items, sessions, tokens; 204; unknown id is 404 |
| No-op disable/reactivate | 409 (already in that state), no audit row |

## Target structure (`apps/server`)

```
src/
  admin/
    admin.module.ts                          (edit: exports, new providers)
    auth/admin-jwt.guard.ts                  (new, Part A)
    auth/current-admin.decorator.ts          (new, Part A)
    auth/admin-auth.controller.ts            (edit: add GET me)
    users/admin-users.controller.ts          (new, Part B)
    users/admin-users.service.ts             (new, Part B)
    users/dto/list-users-query.dto.ts        (new, Part B)
    users/dto/user-summary.dto.ts            (new, Part B)
  admins/admins.module.ts                    (edit: import AdminModule)
  admins/admins.controller.ts                (edit: guard)
  admins/admins.service.ts                   (edit: revoke sessions on disable)
  common/errors/api-error-responses.decorator.ts   (edit: add 401)
```

---

# Part A: Milestone 3, guard and decorator

## A1: The guard

`src/admin/auth/admin-jwt.guard.ts`:
```ts
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

import { PrismaService } from "@/prisma/prisma.service";

export type AuthenticatedAdmin = { id: string };
export type AdminRequest = Request & { admin?: AuthenticatedAdmin };

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    const [type, token] = req.headers.authorization?.split(" ") ?? [];
    if (type !== "Bearer" || !token) throw new UnauthorizedException();

    const payload = await this.jwt
      .verifyAsync<{ sub?: unknown; role?: unknown }>(token)
      .catch(() => null);
    if (payload?.role !== "admin" || typeof payload.sub !== "string") {
      throw new UnauthorizedException();
    }

    // DB check: a disabled or deleted admin is locked out now, not when the
    // access token expires.
    const admin = await this.prisma.admin.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true },
    });
    if (admin?.status !== "ACTIVE") throw new UnauthorizedException();

    req.admin = { id: admin.id };
    return true;
  }
}
```
Why each piece:
- **`verifyAsync` throws on a bad signature or an expired token**; `.catch(() => null)` turns every failure into the same 401.
- **`role` check**: when end-user tokens exist later (a different secret, ideally), an admin route must still refuse them.
- **The DB lookup costs one query per request.** That is the price of instant lockout. A stateless JWT alone would keep a disabled admin working until `exp`. For an admin portal with a handful of users, correctness beats the saved query.
- `payload.sub` is `unknown` until you check `typeof`, which keeps the repo's no-`any` rule intact.

## A2: The decorator

`src/admin/auth/current-admin.decorator.ts`:
```ts
import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type {
  AdminRequest,
  AuthenticatedAdmin,
} from "@/admin/auth/admin-jwt.guard";

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin | undefined =>
    ctx.switchToHttp().getRequest<AdminRequest>().admin
);
```
`admin` is optional on the request type (it only exists after the guard ran), so the decorator returns `AuthenticatedAdmin | undefined`. Under `@UseGuards(AdminJwtGuard)` it is always set. If TypeScript makes your handlers awkward, narrow once in the handler or change the return type to a non-optional `AuthenticatedAdmin` with a short comment explaining the guard guarantees it. Decide and note which you chose.

## A3: Wire the module

`src/admin/admin.module.ts`: add the guard as a provider and **export** it plus `JwtModule`, so other modules can use the guard:
```ts
@Module({
  imports: [JwtModule.registerAsync({ /* unchanged */ })],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtGuard],
  exports: [JwtModule, AdminJwtGuard],
})
export class AdminModule {}
```
Why exports matter: `@UseGuards(AdminJwtGuard)` makes Nest instantiate the guard inside the module that owns the *controller*. That module must be able to resolve `JwtService` (from `JwtModule`) and `PrismaService` (global, so free). Exporting `JwtModule` from `AdminModule` and importing `AdminModule` elsewhere supplies it.

`PrismaModule` is `@Global()`, so you don't import it.

## A4: A test route

Add to `AdminAuthController` (imports: `Get`, `UseGuards` from `@nestjs/common`, `ApiBearerAuth` from `@nestjs/swagger`, the guard, the decorator, and the `AuthenticatedAdmin` type):
```ts
@Get("me")
@UseGuards(AdminJwtGuard)
@ApiBearerAuth()
me(@CurrentAdmin() admin: AuthenticatedAdmin | undefined) {
  return admin;
}
```
This sits in a controller whose other routes (`login`, `refresh`, `logout`) must stay public; that is why the guard is on the method, not the class.

Also add 401 to the shared Swagger decorator, `src/common/errors/api-error-responses.decorator.ts`: import `ApiUnauthorizedResponse` and add `ApiUnauthorizedResponse({ type: ErrorResponseDto })` to the `applyDecorators` list.

## A5: Protect the open `/admins` CRUD

`src/admins/admins.module.ts`:
```ts
@Module({
  imports: [AdminModule],
  controllers: [AdminsController],
  providers: [AdminsService],
})
export class AdminsModule {}
```
`src/admins/admins.controller.ts`: put these on the class (import `UseGuards`, `ApiBearerAuth`, the guard):
```ts
@Controller("admins")
@UseGuards(AdminJwtGuard)
@ApiBearerAuth()
export class AdminsController { /* unchanged */ }
```

### Revoke sessions when an admin is disabled

The guard already rejects a disabled admin, but their refresh cookie is still a live session row. Close that gap in `AdminsService.update`: inside the existing transaction, after the `tx.admin.update(...)`, revoke on disable. Roughly:
```ts
const updated = await tx.admin.update({ /* as today */ });
if (dto.status === "DISABLED") {
  await tx.session.updateMany({
    where: { adminId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
return updated;
```
Deleting an admin needs nothing: `Session.admin` is `onDelete: Cascade`.

Two things to decide and write down:
1. **`AdminAuditLog` has no cascade.** Once Part B writes audit rows, deleting an admin who performed an action fails with a 409 (Prisma P2003, mapped by the global filter). Keep that (an audit trail shouldn't silently disappear) or block it earlier with a clearer message?
2. **Self-service footguns.** Can an admin disable or delete *themselves*? The "last active admin" rule only stops the final one. If you want to forbid it, pass `@CurrentAdmin()` into the service and compare ids.

## A6: Checkpoint

```bash
pnpm dev:server
TOKEN=$(curl -s -H 'content-type: application/json' \
  -d '{"email":"admin@padlock.local","password":"ChangeMe-12345!"}' \
  localhost:3000/admin/auth/login | jq -r .accessToken)
```
- `curl -i localhost:3000/admin/auth/me` gives **401**.
- `curl -i -H "authorization: Bearer ${TOKEN}x" localhost:3000/admin/auth/me` (tampered) gives **401**.
- `curl -i -H "authorization: Bearer $TOKEN" localhost:3000/admin/auth/me` gives **200** with `{"id":"..."}`.
- `curl -i localhost:3000/admins` gives **401**; the same with the token gives 200. Check `POST`, `PATCH`, `DELETE` without a token too.
- `login`, `refresh`, `logout` still work without a token.
- Lockout: create a second admin, log in as them, disable them via `PATCH /admins/:id`, then call `/admin/auth/me` with their old token (401) and `refresh` with their cookie (401). Studio shows their sessions with `revoked_at` set.
- Set `ADMIN_JWT_EXPIRES_IN=10s` temporarily, log in, wait, and confirm the token expires (401). Restore it.
- `/docs`: click **Authorize**, paste the token; the protected routes now show a lock and a 401 response.

Run `pnpm typecheck && pnpm lint`. Commit: `feat(server): protect admin routes with a JWT guard`.

Then update `CLAUDE.md`: it still says "No auth (the `/admins` endpoints are open)". Ask me "update claude.md" and I'll do it from the git history.

## A7: Exercise (after the checkpoint)

Rewrite as a **global** guard so protection is the default and new routes can't forget it: register `{ provide: APP_GUARD, useClass: AdminJwtGuard }` in `AppModule`, add a `@Public()` decorator (`SetMetadata("isPublic", true)`), and have the guard read it with `Reflector.getAllAndOverride`. Mark `login`, `refresh`, `logout`, and the hello route public. Compare which version is harder to get wrong.

---

# Part B: Milestone 4, user management

## B1: DTOs

`src/admin/users/dto/list-users-query.dto.ts`:
```ts
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

import { AccountStatus } from "@/generated/prisma/enums";

export class ListUsersQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(AccountStatus)
  @IsOptional()
  status?: AccountStatus;
}
```
This duplicates `ListAdminsQueryDto`. Fine for now; extracting a shared pagination base class is a good refactor once you've felt the duplication.

`src/admin/users/dto/user-summary.dto.ts` (response shape; the Swagger plugin reads it):
```ts
import type { AccountStatus } from "@/generated/prisma/enums";

export class UserSummaryDto {
  id!: string;
  email!: string;
  status!: AccountStatus;
  createdAt!: Date;
}

export class UserListDto {
  data!: UserSummaryDto[];
  page!: number;
  limit!: number;
  total!: number;
}
```

## B2: The service

`src/admin/users/admin-users.service.ts`:
```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { ListUsersQueryDto } from "@/admin/users/dto/list-users-query.dto";
import type { AuditAction } from "@/generated/prisma/enums";
import { PrismaService } from "@/prisma/prisma.service";

// NFR-SEC-5: explicit allowlist. Never findMany() without a select, or
// authHash and the wrapped keys would be loaded into memory (and one
// careless `return` away from the response).
const SUMMARY = {
  id: true,
  email: true,
  status: true,
  createdAt: true,
} as const;

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListUsersQueryDto) {
    const where = {
      ...(q.status && { status: q.status }),
      ...(q.search && { email: { contains: q.search.toLowerCase() } }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: SUMMARY,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, page: q.page, limit: q.limit, total };
  }

  setStatus(adminId: string, userId: string, to: "ACTIVE" | "DISABLED") {
    const action: AuditAction = to === "DISABLED" ? "DISABLE" : "REACTIVATE";
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { status: true },
      });
      if (!user) throw new NotFoundException("User not found");
      if (user.status === to) {
        throw new ConflictException(`User is already ${to.toLowerCase()}`);
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: { status: to },
        select: SUMMARY,
      });
      if (to === "DISABLED") {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() }, // takes effect immediately
        });
      }
      await tx.adminAuditLog.create({
        data: { adminId, targetUserId: userId, action },
      });
      return updated;
    });
  }

  async remove(adminId: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      // delete() throws P2025 for an unknown id; AllExceptionsFilter maps it to 404.
      await tx.user.delete({ where: { id: userId } }); // cascades vault, sessions, tokens
      await tx.adminAuditLog.create({
        data: { adminId, targetUserId: userId, action: "DELETE" },
      });
    });
  }
}
```
Why:
- **One transaction per change.** The status change, the session revoke, and the audit row all succeed or all roll back. Without that you could disable a user and lose the record of who did it (NFR-REL-2).
- **`setStatus` reads first** because it needs to tell "not found" (404) from "already in that state" (409). `remove` doesn't need to: the filter already turns Prisma's P2025 into a 404, per the repo rule that services don't catch Prisma errors. Compare it with `AdminsService.remove`, which does a manual lookup, and decide which style you prefer.
- **Revoking sessions on disable** matters because a disabled user would otherwise keep refreshing. When the end-user auth flow exists, its guard must also check `status` in the DB, same as `AdminJwtGuard`.
- **`targetUserId` has no foreign key** (see Part A of the previous guide), so the `DELETE` audit row stays after the user is gone.

## B3: The controller

`src/admin/users/admin-users.controller.ts`:
```ts
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";

import { AdminJwtGuard } from "@/admin/auth/admin-jwt.guard";
import type { AuthenticatedAdmin } from "@/admin/auth/admin-jwt.guard";
import { CurrentAdmin } from "@/admin/auth/current-admin.decorator";
import { AdminUsersService } from "@/admin/users/admin-users.service";
import { ListUsersQueryDto } from "@/admin/users/dto/list-users-query.dto";
import { ApiErrorResponses } from "@/common/errors/api-error-responses.decorator";

@Controller("admin/users")
@UseGuards(AdminJwtGuard)
@ApiBearerAuth()
@ApiErrorResponses()
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@Query() q: ListUsersQueryDto) {
    return this.users.list(q);
  }

  @Patch(":id/disable")
  disable(
    @CurrentAdmin() admin: AuthenticatedAdmin | undefined,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.users.setStatus(admin?.id ?? "", id, "DISABLED");
  }

  @Patch(":id/reactivate")
  reactivate(
    @CurrentAdmin() admin: AuthenticatedAdmin | undefined,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.users.setStatus(admin?.id ?? "", id, "ACTIVE");
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentAdmin() admin: AuthenticatedAdmin | undefined,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.users.remove(admin?.id ?? "", id);
  }
}
```
The `admin?.id ?? ""` is ugly on purpose: it shows what the optional type from A2 costs you. An empty string would fail the audit foreign key, so a missing admin can never silently succeed. If it bothers you, make `CurrentAdmin` return a non-optional `AuthenticatedAdmin` (the guard guarantees it) and delete the `?.`/`?? ""` everywhere. That's the cleaner end state; do it if you agree.

Import order: Biome may want the two `admin-jwt.guard` imports merged or reordered. Run `pnpm format`.

## B4: Register

`src/admin/admin.module.ts`:
```ts
controllers: [AdminAuthController, AdminUsersController],
providers: [AdminAuthService, AdminJwtGuard, AdminUsersService],
```
Both routes already live in `AdminModule`, which has `JwtModule` and the guard, so no new imports are needed.

## B5: Checkpoint

Use `$TOKEN` from A6 (tokens last 1 hour by default; log in again if it expired).
```bash
H="authorization: Bearer $TOKEN"
curl -s -H "$H" 'localhost:3000/admin/users?limit=5'
curl -s -H "$H" 'localhost:3000/admin/users?search=ali&status=ACTIVE'
curl -i -X PATCH -H "$H" localhost:3000/admin/users/<USER_ID>/disable
curl -i -X PATCH -H "$H" localhost:3000/admin/users/<USER_ID>/disable      # second time: 409
curl -i -X PATCH -H "$H" localhost:3000/admin/users/<USER_ID>/reactivate
curl -i -X DELETE -H "$H" localhost:3000/admin/users/<USER_ID>             # 204
curl -i -X DELETE -H "$H" localhost:3000/admin/users/<USER_ID>             # 404
```
Verify:
- **No key material leaks.** The list response must not contain `authHash`, `kdf`, or `wrapped`. Quick check: `curl -s -H "$H" localhost:3000/admin/users | grep -ciE 'authHash|kdf|wrapped'` prints `0`.
- No token on any `/admin/users` route is 401.
- A bad id (`/admin/users/not-a-uuid/disable`) is 400; an unknown valid UUID is 404; `limit=0` is 400.
- In Studio, `admin_audit_logs` has one row per successful action with the right `admin_id`, `target_user_id`, and `action`. The failed 409 and 404 calls added **no** rows.
- Give a fake user a `sessions` row (or log in as them once end-user auth exists), disable them, and confirm `revoked_at` is set on all their active sessions.
- After deleting a user, their `DELETE` audit row is still there.
- Optional rollback proof: temporarily make `adminId` invalid (for example pass a random UUID) and confirm that the user's status does **not** change when the audit insert fails.

Run `pnpm typecheck && pnpm lint`. Commit: `feat(server): add admin user management with audit log`.

## Things to decide and note down

- Delete: 404 for an unknown user (as written) or an idempotent 204?
- Should delete require a confirmation (for example the user's email in the body), since it is irreversible?
- Should there be a read endpoint for the audit log (`GET /admin/audit-logs`, paginated, filterable by `targetUserId`)? The data is written but nothing shows it yet.
- Should `search` be case-insensitive via `mode: "insensitive"` instead of lowercasing the input? Emails are stored lowercased, so both work.

## What's next

1. **Milestone 5:** admin password reset (mail abstraction behind a DI token, single-use expiring token).
2. **Milestone 6:** rate limiting with `@nestjs/throttler`.
3. **Milestone 7:** tests. By now there is a lot worth covering: the guard, the transactional audit writes, and a regression test that user responses never contain `authHash`.

When you get stuck or finish a part, ask me to explain a concept or review your diff.
