# Padlock Server: write the remaining unit tests

## Context

This is the slow, small version of "tests for `apps/server`". Vitest is already set up and three specs are done (`all-exceptions.filter.spec.ts`, `validation.spec.ts`, `env.spec.ts`). Six spec files are left, split into three independent parts so three people can work in parallel with no file overlap.

Scope:
- **Part A:** `common/token.util.spec.ts` and `admin/auth/admin-auth.service.spec.ts` (login, refresh, logout, forgot/reset password).
- **Part B:** `common/pagination.util.spec.ts` and `admin/auth/admin-jwt.guard.spec.ts`.
- **Part C:** `admin/audit/admin-audit.service.spec.ts` and `admin/users/admin-users.service.spec.ts`.

Not in this guide: web or extension tests, controller tests, tests against a real database (a later step).

### Where the repo should be before you start

You already have: Vitest + `unplugin-swc` in `apps/server`, `vitest.config.ts`, `src/test/prisma-mock.ts`, `src/test/setup.ts`, the `pnpm test` script, and the three finished specs. Check:
```bash
git switch main && git pull
pnpm install
pnpm db:generate                 # the specs import the generated Prisma client
pnpm test                        # green before you add anything
pnpm typecheck && pnpm lint      # both clean
```
No database is needed: every spec fakes Prisma. Read `src/common/errors/validation.spec.ts` (smallest) and `src/common/errors/all-exceptions.filter.spec.ts` (fake Nest objects, `it.each`) first; the new specs follow their style.

Rules of this repo: pnpm only, import through `@/` (never `./` or `../`, even for siblings), no `any`, `async` must `await`, Conventional Commits, run `pnpm format` then `pnpm typecheck && pnpm lint` before each commit. Type the code yourself so it sticks.

### Decisions already made (change them if you disagree)

| Topic | Decision |
| --- | --- |
| Runner | Vitest, `describe`/`it`/`expect` imported from `vitest` (no globals) |
| File location | Next to the code: `foo.service.ts` gets `foo.service.spec.ts`; Vitest runs `src/**/*.spec.ts` |
| Nest container | Not used. Build the class with `new X(...)`; cast fakes with `as never` / `as unknown as T` (no `any`) |
| Database | Never. `createPrismaMock()` from `@/test/prisma-mock` is a plain-object `PrismaService`; every method is a `vi.fn()` returning `undefined` until you set a result |
| Transactions | `$transaction(cb)` calls `cb` with the **same mock**; `$transaction([a, b])` is `Promise.all`. So assert on `prisma.session.updateMany` directly, inside a transaction or not |
| Fresh state | New `createPrismaMock()` in every `beforeEach`; nothing leaks between tests |
| What a test asserts | The result **and** the side effects (what was written, and what was *not*) |
| Time | Compare with a tolerance (`> Date.now() + TTL - 5000`), never equality |
| Logger | `src/test/setup.ts` silences Nest's logger; error-path tests stay quiet |
| Branches | Start with `feat/`. **Never `test/...`**: the remote has a branch named `test`, so a `test/...` push is rejected ("directory file conflict") |

## Target structure (`apps/server`)

```
src/
  admin/
    audit/admin-audit.service.spec.ts      (new, Part C)
    auth/admin-auth.service.spec.ts        (new, Part A)
    auth/admin-jwt.guard.spec.ts           (new, Part B)
    users/admin-users.service.spec.ts      (new, Part C)
  common/
    pagination.util.spec.ts                (new, Part B)
    token.util.spec.ts                     (new, Part A)
```
No existing file is edited, so the three parts never conflict.

| Part | Branch | Commit |
| --- | --- | --- |
| A | `feat/server-specs-auth-token` | `test(server): add specs for admin auth service and token util` |
| B | `feat/server-specs-guard-pagination` | `test(server): add specs for admin jwt guard and pagination util` |
| C | `feat/server-specs-users-audit` | `test(server): add specs for admin users and audit services` |

---

# Part A: token util and the auth service

Branch: `git switch -c feat/server-specs-auth-token`. Read `src/common/token.util.ts` and `src/admin/auth/admin-auth.service.ts` before you write.

## A1: The token util spec

`src/common/token.util.spec.ts`:
```ts
import { describe, expect, it } from "vitest";

import { hashToken, newToken } from "@/common/token.util";

describe("token.util", () => {
  it("newToken is unique and url-safe", () => {
    const a = newToken();
    expect(a).not.toBe(newToken());
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashToken is deterministic, 32 bytes, and differs per input", () => {
    expect(hashToken("x")).toEqual(hashToken("x"));
    expect(hashToken("x")).not.toEqual(hashToken("y"));
    expect(hashToken("x")).toHaveLength(32);
  });
});
```
Why each piece:
- **Uniqueness and charset**: tokens are session secrets, so two calls must differ, and base64url keeps them safe inside URLs (the reset link carries one).
- **32 bytes**: SHA-256 output length. If someone swaps the algorithm, this fails.
- `hashToken` returns a `Uint8Array`; `toEqual` compares its contents.

## A2: The auth service spec

`src/admin/auth/admin-auth.service.spec.ts`:
```ts
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AdminAuthService,
  REFRESH_TTL_MS,
  RESET_TTL_MS,
} from "@/admin/auth/admin-auth.service";
import { hashPassword } from "@/common/password.util";
import { hashToken } from "@/common/token.util";
import { createPrismaMock, type PrismaMock } from "@/test/prisma-mock";

const PASSWORD = "correct horse battery";
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

describe("AdminAuthService", () => {
  let prisma: PrismaMock;
  let jwt: { signAsync: ReturnType<typeof vi.fn> };
  let mail: { sendPasswordReset: ReturnType<typeof vi.fn> };
  let svc: AdminAuthService;

  const activeAdmin = () => ({
    id: "a1",
    email: "a@x.test",
    status: "ACTIVE",
    passwordHash,
  });

  beforeEach(async () => {
    prisma = createPrismaMock();
    jwt = { signAsync: vi.fn().mockResolvedValue("access.jwt") };
    mail = { sendPasswordReset: vi.fn().mockResolvedValue(undefined) };
    const config = {
      getOrThrow: vi.fn().mockReturnValue("https://admin.test"),
    };
    svc = new AdminAuthService(
      prisma as never,
      jwt as unknown as JwtService,
      mail as never,
      config as unknown as ConfigService
    );
    await svc.onModuleInit();
  });

  describe("login", () => {
    it("rejects an unknown email, still spending a hash verify", async () => {
      prisma.admin.findUnique.mockResolvedValue(null);
      const verify = vi.spyOn(argon2, "verify");
      await expect(svc.login("no@x.test", PASSWORD)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(verify).toHaveBeenCalledOnce();
      verify.mockRestore();
    });

    it("rejects a wrong password", async () => {
      prisma.admin.findUnique.mockResolvedValue(activeAdmin());
      await expect(svc.login("a@x.test", "nope")).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(prisma.admin.update).not.toHaveBeenCalled();
    });

    it("rejects a disabled admin even with the right password", async () => {
      prisma.admin.findUnique.mockResolvedValue({
        ...activeAdmin(),
        status: "DISABLED",
      });
      await expect(svc.login("a@x.test", PASSWORD)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    });

    it("issues tokens, stores only the refresh hash, and stamps lastLoginAt", async () => {
      prisma.admin.findUnique.mockResolvedValue(activeAdmin());
      const out = await svc.login("a@x.test", PASSWORD);

      expect(out.accessToken).toBe("access.jwt");
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: "a1", role: "admin" });
      expect(prisma.admin.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "a1" } })
      );
      const data = prisma.session.create.mock.calls[0]?.[0].data;
      expect(data.refreshTokenHash).toEqual(hashToken(out.refreshToken));
      expect(data.clientType).toBe("ADMIN");
      expect(data.expiresAt.getTime()).toBeGreaterThan(
        Date.now() + REFRESH_TTL_MS - 5000
      );
    });
  });

  describe("refresh", () => {
    const session = (over: object = {}) => ({
      id: "s1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      admin: { id: "a1", status: "ACTIVE" },
      ...over,
    });

    it("rejects a missing token", async () => {
      await expect(svc.refresh(undefined)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    });

    it.each([
      ["unknown session", null],
      ["revoked session", session({ revokedAt: new Date() })],
      ["expired session", session({ expiresAt: new Date(Date.now() - 1) })],
      ["disabled admin", session({ admin: { id: "a1", status: "DISABLED" } })],
    ])("rejects %s", async (_name, found) => {
      prisma.session.findUnique.mockResolvedValue(found);
      await expect(svc.refresh("tok")).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it("rotates: revokes the old session and creates a new one", async () => {
      prisma.session.findUnique.mockResolvedValue(session());
      prisma.session.updateMany.mockResolvedValue({ count: 1 });

      const out = await svc.refresh("old");

      expect(prisma.session.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { refreshTokenHash: hashToken("old") },
        })
      );
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: "s1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(out.refreshToken).not.toBe("old");
      expect(prisma.session.create).toHaveBeenCalledOnce();
    });

    it("loses a concurrent rotation race with 401 and creates nothing", async () => {
      prisma.session.findUnique.mockResolvedValue(session());
      prisma.session.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.refresh("old")).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(prisma.session.create).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("is a no-op without a token", async () => {
      await svc.logout(undefined);
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });

    it("revokes only a not-yet-revoked session", async () => {
      await svc.logout("tok");
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { refreshTokenHash: hashToken("tok"), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe("forgotPassword", () => {
    it("silently ignores unknown and disabled accounts", async () => {
      prisma.admin.findUnique.mockResolvedValueOnce(null);
      await svc.forgotPassword("no@x.test");
      prisma.admin.findUnique.mockResolvedValueOnce({
        ...activeAdmin(),
        status: "DISABLED",
      });
      await svc.forgotPassword("a@x.test");

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it("stores a hashed 30 min token and mails the raw one in the link", async () => {
      prisma.admin.findUnique.mockResolvedValue(activeAdmin());
      await svc.forgotPassword("a@x.test");

      const data = prisma.passwordResetToken.create.mock.calls[0]?.[0].data;
      const [to, link] = mail.sendPasswordReset.mock.calls[0] ?? [];
      const raw = String(link).split("#token=")[1] ?? "";

      expect(to).toBe("a@x.test");
      expect(link).toMatch(/^https:\/\/admin\.test\/reset-password#token=/);
      expect(data.tokenHash).toEqual(hashToken(raw));
      expect(data.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + RESET_TTL_MS
      );
      expect(data.expiresAt.getTime()).toBeGreaterThan(
        Date.now() + RESET_TTL_MS - 5000
      );
    });

    it("does not fail the request when mail sending fails", async () => {
      prisma.admin.findUnique.mockResolvedValue(activeAdmin());
      mail.sendPasswordReset.mockRejectedValue(new Error("smtp down"));
      await expect(svc.forgotPassword("a@x.test")).resolves.toBeUndefined();
    });
  });

  describe("resetPassword", () => {
    it("rejects an unknown token", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        svc.resetPassword("t", "new password!")
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.admin.update).not.toHaveBeenCalled();
    });

    it("rejects a used or expired token (claim count 0)", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "r1",
        adminId: "a1",
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        svc.resetPassword("t", "new password!")
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.admin.update).not.toHaveBeenCalled();
    });

    it("sets the new hash, revokes sessions, and burns other reset tokens", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "r1",
        adminId: "a1",
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });

      await svc.resetPassword("t", "new password!");

      const claim = prisma.passwordResetToken.updateMany.mock.calls[0]?.[0];
      expect(claim.where).toMatchObject({ id: "r1", usedAt: null });
      expect(claim.where.expiresAt).toHaveProperty("gt");

      const upd = prisma.admin.update.mock.calls[0]?.[0];
      expect(upd.where).toEqual({ id: "a1" });
      expect(upd.data.passwordHash).not.toBe("new password!");
      expect(await argon2.verify(upd.data.passwordHash, "new password!")).toBe(
        true
      );

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { adminId: "a1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledTimes(2);
    });
  });
});
```
Why each piece:
- **`beforeAll` hashes once.** argon2 is slow on purpose; hashing per test would take seconds. `activeAdmin()` is a function so each test gets a fresh object.
- **The service is built with `new`**, with plain-object fakes for `jwt`, `mail` and `config`. `await svc.onModuleInit()` matters: it builds the dummy hash the unknown-email path verifies against.
- **Unknown email still calls `argon2.verify` once.** That is the timing-equalizer: a missing account must cost the same as a wrong password, or response time reveals which emails exist. `vi.spyOn` + `mockRestore()` keeps the spy from leaking into later tests.
- **Only the hash is stored.** `session.create` receives `hashToken(refreshToken)`, never the raw token; the same holds for the reset token. A DB leak must not hand out live sessions.
- **Refresh rotation is a claim.** `updateMany({ id, revokedAt: null })` returning `count: 0` means someone else rotated first; the test proves the loser gets a 401 and creates nothing.
- **`forgotPassword` returns quietly for unknown or disabled accounts** and does not fail when mail fails, so the endpoint can't be used to discover accounts.
- **Reset is single-use**: the claim must require `usedAt: null` and a future `expiresAt`. On success the new hash must actually verify (`argon2.verify`), sessions are revoked, and other unused tokens are burned (`updateMany` called twice: claim, then burn).
- `RESET_TTL_MS` and `REFRESH_TTL_MS` are imported from the service so the test follows the real values.

## A3: Checkpoint

```bash
pnpm format
pnpm --filter server test src/common/token.util.spec.ts src/admin/auth/admin-auth.service.spec.ts
pnpm test                                   # whole suite still green
```
Prove the tests can fail (a test that can't fail is worthless). One at a time, break the source, run the specs, confirm a red test, then `git checkout` the source file:
- `src/admin/auth/admin-auth.service.ts`: delete ` || admin.status !== "ACTIVE"` in `login`. Expect "rejects a disabled admin ..." to fail.
- `src/common/token.util.ts`: change `"sha256"` to `"sha1"`. Expect the 32-byte assertion to fail.

Run `pnpm typecheck && pnpm lint`. Commit: `test(server): add specs for admin auth service and token util`. PR body: the two files, the test count, which rule you broke for the red check.

---

# Part B: pagination util and the JWT guard

Branch: `git switch -c feat/server-specs-guard-pagination`. Read `src/common/pagination.util.ts` and `src/admin/auth/admin-jwt.guard.ts` before you write.

## B1: The pagination spec

`src/common/pagination.util.spec.ts`:
```ts
import { describe, expect, it } from "vitest";

import { pageArgs, paginated } from "@/common/pagination.util";

describe("pagination.util", () => {
  it("pageArgs converts 1-based page to skip/take", () => {
    expect(pageArgs({ page: 1, limit: 20 })).toEqual({ skip: 0, take: 20 });
    expect(pageArgs({ page: 3, limit: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it("paginated wraps rows with page, limit and total", () => {
    expect(paginated(["a"], { page: 2, limit: 5 }, 11)).toEqual({
      data: ["a"],
      page: 2,
      limit: 5,
      total: 11,
    });
  });
});
```
Why each piece:
- **Two pages, not one.** Page 1 gives `skip: 0` (an off-by-one gives `skip: limit`); page 3 proves the formula `(page - 1) * limit`.
- Every list endpoint (`users`, `admins`, `audit`) goes through these two functions, so this tiny spec guards all of them.

## B2: The guard spec

`src/admin/auth/admin-jwt.guard.spec.ts`:
```ts
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminJwtGuard, type AdminRequest } from "@/admin/auth/admin-jwt.guard";
import { createPrismaMock, type PrismaMock } from "@/test/prisma-mock";

describe("AdminJwtGuard", () => {
  const jwt = new JwtService({ secret: "s".repeat(32) });
  let prisma: PrismaMock;
  let isPublic: boolean;
  let guard: AdminJwtGuard;

  const run = (authorization?: string) => {
    const req = { headers: { authorization } } as AdminRequest;
    const ctx = {
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { req, result: guard.canActivate(ctx) };
  };

  const bearer = async (payload: object) =>
    `Bearer ${await jwt.signAsync(payload)}`;

  beforeEach(() => {
    prisma = createPrismaMock();
    isPublic = false;
    const reflector = {
      getAllAndOverride: vi.fn(() => isPublic),
    } as unknown as Reflector;
    guard = new AdminJwtGuard(jwt, prisma as never, reflector);
  });

  it("lets @Public routes through without a token", async () => {
    isPublic = true;
    await expect(run().result).resolves.toBe(true);
    expect(prisma.admin.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["missing header", undefined],
    ["wrong scheme", "Basic abc"],
    ["empty bearer", "Bearer"],
    ["garbage token", "Bearer not.a.jwt"],
  ])("rejects %s", async (_n, header) => {
    await expect(run(header).result).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it("rejects a token signed with another secret", async () => {
    const other = new JwtService({ secret: "o".repeat(32) });
    const t = await other.signAsync({ sub: "a1", role: "admin" });
    await expect(run(`Bearer ${t}`).result).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it("rejects a non-admin role and a missing/non-string sub", async () => {
    for (const payload of [
      { sub: "a1", role: "user" },
      { sub: "a1" },
      { role: "admin" },
      { sub: 7, role: "admin" },
    ]) {
      await expect(run(await bearer(payload)).result).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    }
    expect(prisma.admin.findUnique).not.toHaveBeenCalled();
  });

  it("rejects when the admin is deleted or no longer ACTIVE", async () => {
    const auth = await bearer({ sub: "a1", role: "admin" });
    prisma.admin.findUnique.mockResolvedValueOnce(null);
    await expect(run(auth).result).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    prisma.admin.findUnique.mockResolvedValueOnce({
      id: "a1",
      email: "a@x.test",
      status: "DISABLED",
    });
    await expect(run(auth).result).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it("accepts an active admin and attaches it to the request", async () => {
    prisma.admin.findUnique.mockResolvedValue({
      id: "a1",
      email: "a@x.test",
      status: "ACTIVE",
    });
    const { req, result } = run(await bearer({ sub: "a1", role: "admin" }));
    await expect(result).resolves.toBe(true);
    expect(req.admin).toEqual({ id: "a1", email: "a@x.test" });
  });
});
```
Why each piece:
- **A real `JwtService`**, not a fake. Signing real tokens with the test secret is what proves a forged or foreign-secret token is refused; a mocked `verifyAsync` would test nothing.
- **`run()` builds the smallest fake `ExecutionContext`** the guard touches: `getHandler`, `getClass` (for the `@Public()` lookup) and `switchToHttp().getRequest()`. The `isPublic` flag drives the fake `Reflector`, so one variable switches a route between public and protected.
- **`canActivate` is async**: always `await expect(...).rejects` / `.resolves`. Forgetting the `await` makes a test pass while asserting nothing.
- **The invalid-payload loop** covers four different ways a token can be validly signed yet wrong (non-admin role, no `role`, no `sub`, non-string `sub`), and asserts the DB was never queried: bad tokens must be rejected before costing a query.
- **Deleted or disabled admin is a 401 even with a valid token.** That's the instant lockout the DB check exists for. `mockResolvedValueOnce` gives two different answers in a row inside one test.
- **Success sets `req.admin`** to `{ id, email }`; the `@CurrentAdmin()` decorator and the audit log rely on it.

## B3: Checkpoint

```bash
pnpm format
pnpm --filter server test src/common/pagination.util.spec.ts src/admin/auth/admin-jwt.guard.spec.ts
pnpm test
```
Break the source one at a time, confirm red, then `git checkout` the file:
- `src/admin/auth/admin-jwt.guard.ts`: change `admin?.status !== "ACTIVE"` to `false`. Expect "rejects when the admin is deleted or no longer ACTIVE" to fail.
- `src/common/pagination.util.ts`: change `(q.page - 1)` to `q.page`. Expect the `pageArgs` test to fail.

Run `pnpm typecheck && pnpm lint`. Commit: `test(server): add specs for admin jwt guard and pagination util`.

---

# Part C: audit service and users service

Branch: `git switch -c feat/server-specs-users-audit`. Read `src/admin/audit/admin-audit.service.ts` and `src/admin/users/admin-users.service.ts` before you write.

## C1: The audit service spec

`src/admin/audit/admin-audit.service.spec.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";

import { AdminAuditLogService } from "@/admin/audit/admin-audit.service";
import { createPrismaMock, type PrismaMock } from "@/test/prisma-mock";

describe("AdminAuditLogService", () => {
  let prisma: PrismaMock;
  let svc: AdminAuditLogService;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.adminAuditLog.findMany.mockResolvedValue([]);
    prisma.adminAuditLog.count.mockResolvedValue(0);
    svc = new AdminAuditLogService(prisma as never);
  });

  const whereOf = async (q: object) => {
    await svc.list({ page: 1, limit: 20, ...q } as never);
    return prisma.adminAuditLog.findMany.mock.calls[0]?.[0].where;
  };

  it("empty filters give an empty where", async () => {
    expect(await whereOf({})).toEqual({});
  });

  it("maps action, adminId, targetUserId and the from/to range", async () => {
    const from = new Date("2026-01-01");
    const to = new Date("2026-02-01");
    expect(
      await whereOf({
        action: "DELETE",
        adminId: "a1",
        targetUserId: "u1",
        from,
        to,
      })
    ).toEqual({
      action: "DELETE",
      adminId: "a1",
      targetUserId: "u1",
      createdAt: { gte: from, lte: to },
    });
  });

  it("supports a one-sided date range", async () => {
    const from = new Date("2026-01-01");
    expect(await whereOf({ from })).toEqual({
      createdAt: { gte: from, lte: undefined },
    });
  });

  it("flattens the admin email onto each row", async () => {
    prisma.adminAuditLog.findMany.mockResolvedValue([
      { id: "l1", action: "DELETE", admin: { email: "a@x.test" } },
    ]);
    prisma.adminAuditLog.count.mockResolvedValue(1);
    const out = await svc.list({ page: 1, limit: 20 } as never);
    expect(out.data).toEqual([
      { id: "l1", action: "DELETE", adminEmail: "a@x.test" },
    ]);
    expect(out.total).toBe(1);
  });
});
```
Why each piece:
- **`list` runs `findMany` and `count` in one `$transaction([...])`**, and the mock turns that into `Promise.all`, so both just need a resolved value in `beforeEach`.
- **`whereOf()` pulls the `where` the service handed to Prisma.** The service's real job is translating query params into that object, so that is what you assert.
- **The query is cast `as never`**: the DTO has decorators and more fields than a test needs; the cast keeps the test short without `any`.
- **One-sided range**: only `from` set still gives `createdAt: { gte: from, lte: undefined }`. `toEqual` ignores `undefined` properties, so this passes with or without the explicit key.
- **Flattening** turns Prisma's nested `admin: { email }` into a flat `adminEmail`, which the web audit page reads.

## C2: The users service spec

`src/admin/users/admin-users.service.spec.ts`:
```ts
import { ConflictException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";

import { AdminUsersService } from "@/admin/users/admin-users.service";
import { createPrismaMock, type PrismaMock } from "@/test/prisma-mock";

describe("AdminUsersService", () => {
  let prisma: PrismaMock;
  let svc: AdminUsersService;

  beforeEach(() => {
    prisma = createPrismaMock();
    svc = new AdminUsersService(prisma as never);
  });

  describe("list", () => {
    it("builds where from status and lower-cased search, and paginates", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "u1" }]);
      prisma.user.count.mockResolvedValue(41);

      const out = await svc.list({
        page: 3,
        limit: 10,
        status: "ACTIVE",
        search: "FOO@",
      } as never);

      const args = prisma.user.findMany.mock.calls[0]?.[0];
      expect(args.where).toEqual({
        status: "ACTIVE",
        email: { contains: "foo@" },
      });
      expect(args).toMatchObject({ skip: 20, take: 10 });
      expect(args.select).not.toHaveProperty("authHash");
      expect(out).toEqual({
        data: [{ id: "u1" }],
        page: 3,
        limit: 10,
        total: 41,
      });
    });

    it("uses an empty where with no filters", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
      await svc.list({ page: 1, limit: 20 } as never);
      expect(prisma.user.findMany.mock.calls[0]?.[0].where).toEqual({});
    });
  });

  describe("setStatus", () => {
    it("disable: flips status, revokes the user's sessions, writes a DISABLE audit row", async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "u1" });

      await svc.setStatus("a1", "u1", "DISABLED");

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: "u1", status: "ACTIVE" },
        data: { status: "DISABLED" },
      });
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: "u1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: { adminId: "a1", targetUserId: "u1", action: "DISABLE" },
      });
    });

    it("reactivate: no session revoke, writes a REACTIVATE audit row", async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "u1" });

      await svc.setStatus("a1", "u1", "ACTIVE");

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: "u1", status: "DISABLED" },
        data: { status: "ACTIVE" },
      });
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: { adminId: "a1", targetUserId: "u1", action: "REACTIVATE" },
      });
    });

    it("404 for an unknown user, 409 when already in the target state, no audit row", async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        svc.setStatus("a1", "u1", "DISABLED")
      ).rejects.toBeInstanceOf(NotFoundException);

      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1" });
      await expect(
        svc.setStatus("a1", "u1", "DISABLED")
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("deletes the user and writes a DELETE audit row in one transaction", async () => {
      await svc.remove("a1", "u1");
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: { adminId: "a1", targetUserId: "u1", action: "DELETE" },
      });
      expect(prisma.$transaction).toHaveBeenCalledOnce();
    });

    it("writes no audit row when the delete throws", async () => {
      prisma.user.delete.mockRejectedValue(new Error("P2025"));
      await expect(svc.remove("a1", "u1")).rejects.toThrow("P2025");
      expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    });
  });
});
```
Why each piece:
- **`list`**: the search term is lower-cased (emails are stored lowercase), `skip`/`take` come from `pageArgs`, and `select` is an allowlist that must never contain `authHash` (NFR-SEC-5). If someone adds it later, this test fails before it can reach a response.
- **Disable and reactivate are mirrors.** The interesting assertions are the ones about what is *not* done: reactivate must not touch sessions, and a failed or no-op change must not write an audit row.
- **`user.updateMany` returning `{ count: 0 }` is how the service detects "nothing changed"**; the follow-up `findUnique` decides 404 (no such user) or 409 (already in that state). `mockResolvedValueOnce` gives the two calls different answers.
- **`user.findUniqueOrThrow`** feeds the last line of the transaction (the returned summary); without a result it returns `undefined`, which is fine for these tests.
- **`remove`**: the audit row is written inside the same `$transaction` as the delete; `toHaveBeenCalledOnce()` proves it is one transaction. If the delete throws (a missing user is P2025), no audit row may exist, and the error propagates for `AllExceptionsFilter` to map to a 404.

## C3: Checkpoint

```bash
pnpm format
pnpm --filter server test src/admin/audit/admin-audit.service.spec.ts src/admin/users/admin-users.service.spec.ts
pnpm test
```
Break the source one at a time, confirm red, then `git checkout` the file:
- `src/admin/users/admin-users.service.ts`: remove `.toLowerCase()` from the `search` filter. Expect the `list` test to fail.
- `src/admin/users/admin-users.service.ts`: delete the `if (to === "DISABLED") { ... }` session-revoke block. Expect the disable test to fail.
- `src/admin/audit/admin-audit.service.ts`: change `gte: q.from` to `gte: q.to`. Expect the range tests to fail.

Run `pnpm typecheck && pnpm lint`. Commit: `test(server): add specs for admin users and audit services`.

---

## Things to decide and note down

- Should the audit and users specs share a tiny fixtures helper once more services need user/admin rows, or is the inline data fine at this size?
- `it.each` tables (as in the guard and refresh specs) versus separate `it` blocks: which reads better when a case fails?
- Should `pnpm test` become part of a `pre-push` hook or a CI job once all three parts are merged?
- Controller-level tests (a real Nest app via `@nestjs/testing` and `supertest`) would cover the guard wiring and DTO validation end to end. Worth it, or do real-database integration tests come first?

## What's next

1. **Merge the three parts**, then run `pnpm test` on `main`: the suite should be 9 spec files.
2. **Integration tests** against the docker Postgres for the flows a mock can't prove: session revoke on disable, the single-use reset-token claim, the transactional audit write rolling back.
3. **Web tests**: `tokenStore`, the ky refresh/401 handling in `lib/api/client.ts`, and `RequireAuth`.
4. **CI**: a workflow running `pnpm typecheck && pnpm lint && pnpm test` on every PR (this repo has no CI yet).

When you get stuck or finish a part, ask me to explain a concept or review your diff.
