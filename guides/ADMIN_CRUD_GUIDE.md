# Padlock Admin CRUD: just the `admins` table, step by step

## Context

This is the slow, small version of `ADMIN_GUIDE.md` (which stays as the big picture). Scope: **create / read / update / delete on the `admins` table, and nothing else.**

Not in this guide: login, JWT, sessions, password reset, email, audit log, user management. Those come later (see "What's next").

> **Warning: there is no auth yet.** Every endpoint below is open to anyone who can reach the server. Dev only, never deploy this. The guard that protects `/admins` arrives with the login guide.

Rules of this repo: pnpm only, relative imports end in `.js`, DTOs are `*.dto.ts`, no `any`, `async` functions must `await`, Conventional Commits, run `pnpm typecheck && pnpm lint` before each commit. Type the code yourself so it sticks.

**Prisma version caveat:** the code below is Prisma 7 style (`prisma.config.ts`, `prisma-client` generator, `@prisma/adapter-pg`). If you end up on Prisma 6, the datasource `url` lives in `schema.prisma` and the generator is `prisma-client-js`. Fix small type errors yourself.

### Decisions already made (change them if you disagree)

| Topic | Decision |
|---|---|
| Routes | `POST /admins`, `GET /admins`, `GET /admins/:id`, `PATCH /admins/:id`, `DELETE /admins/:id` |
| Password | Sent in plain on create, stored as an argon2id hash, **never returned** |
| Update | `email` and `status` only (changing a password belongs to the reset flow later) |
| Delete | Hard delete, 204 |
| Safety rule | You cannot disable or delete the **last ACTIVE admin** (409), so you can't lock yourself out |
| Errors | duplicate email 409, unknown id 404, bad UUID 400, bad body 400 |

## Target structure (`apps/server`)

```
prisma/schema.prisma   prisma/seed.ts   prisma.config.ts
src/
  prisma/{prisma.module,prisma.service}.ts
  admins/
    admins.module.ts   admins.controller.ts   admins.service.ts
    dto/{create-admin,update-admin,list-admins-query,admin-summary}.dto.ts
```

---

## Milestone 0: Check what you already have

Your working tree already contains the foundation: `@nestjs/config`, `zod`, `class-validator`, `class-transformer`, `helmet`, `cookie-parser`, `src/config/env.ts`, the hardened `src/main.ts` (global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`), `.env.example`, and `docker-compose.yml`.

```bash
cp apps/server/.env.example apps/server/.env
docker compose up -d        # Postgres on :5432
```

Two things to know:

1. `src/app.module.ts` imports `PrismaModule` and `AdminModule`, which don't exist yet, so `pnpm typecheck` fails until Milestones 1 and 2. That's expected. You'll rename `AdminModule` to `AdminsModule`.
2. `ADMIN_JWT_SECRET`, `cookie-parser`, and the CORS origin are for the login guide. Leave them alone; they don't hurt.

Why `whitelist` + `forbidNonWhitelisted` matter here: if someone sends `{"email": "...", "passwordHash": "x"}` or `{"password": "..."}` to `PATCH`, it is rejected with 400 instead of silently reaching the database.

Checkpoint: `docker compose ps` shows `db` running.

---

## Milestone 1: Database with Prisma

```bash
# from repo root
pnpm --filter server add @prisma/client @prisma/adapter-pg pg dotenv argon2
pnpm --filter server add -D prisma tsx @types/pg
cd apps/server && pnpm prisma init     # creates prisma/ and prisma.config.ts; edit as below
```

`apps/server/prisma.config.ts`:
```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DATABASE_URL") },
});
```

`apps/server/prisma/schema.prisma` (one model; column names match `docs/padlock_database_design.md` section 3.4):
```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum AccountStatus {
  ACTIVE
  DISABLED
}

model Admin {
  id           String        @id @default(uuid()) @db.Uuid
  email        String        @unique
  passwordHash String        @map("password_hash")
  status       AccountStatus @default(ACTIVE)
  createdAt    DateTime      @default(now()) @map("created_at") @db.Timestamptz
  lastLoginAt  DateTime?     @map("last_login_at") @db.Timestamptz

  @@map("admins")
}
```
Why `lastLoginAt` now: nothing writes it until login exists, but adding it later would mean another migration. Why `@map`/`@@map`: TypeScript gets `passwordHash`, Postgres keeps `password_hash`.

```bash
pnpm prisma migrate dev --name create-admins
pnpm prisma generate
```

`.gitignore` (repo root or `apps/server`): add `apps/server/src/generated`. Then check `biome.json` `files.includes`: generated code lives under `src/`, so Biome will try to lint it. Exclude it (for example add `"!**/generated"` to `files.includes`) and confirm `pnpm lint` stays quiet.

`src/prisma/prisma.service.ts`:
```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>("DATABASE_URL"),
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```
`src/prisma/prisma.module.ts`:
```ts
import { Global, Module } from "@nestjs/common";

import { PrismaService } from "./prisma.service.js";

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```
Why `@Global()`: every feature needs the DB; this saves importing `PrismaModule` everywhere. Why lifecycle hooks: connect once at boot, disconnect on shutdown (`app.enableShutdownHooks()` in `main.ts` makes `onModuleDestroy` fire on SIGTERM).

`prisma/seed.ts` (there is no public admin signup, by design; the first admin comes from the seed):
```ts
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";

import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"] }),
});

const email = process.env["SEED_ADMIN_EMAIL"]?.toLowerCase();
const password = process.env["SEED_ADMIN_PASSWORD"];
if (!(email && password)) throw new Error("SEED_ADMIN_* env vars required");

await prisma.admin.upsert({
  where: { email },
  update: {},
  create: {
    email,
    passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
  },
});
await prisma.$disconnect();
```
```bash
pnpm prisma db seed
pnpm prisma studio     # open the admins table
```

Checkpoint: Studio shows one row in `admins`, `status = ACTIVE`, and `password_hash` starts with `$argon2id$`.

Commit: `feat(server): add prisma and admins table`.

---

## Milestone 2: Create and read

### DTOs

`src/admins/dto/create-admin.dto.ts`:
```ts
import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class CreateAdminDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value
  )
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
```
Why a class, not a type: decorators need runtime metadata, and types vanish at compile time. Why lowercase in the DTO: the unique index is case-sensitive, so `A@x.com` and `a@x.com` would otherwise be two admins. Why `MaxLength(128)`: hashing a huge string is a cheap way to burn CPU.

`src/admins/dto/list-admins-query.dto.ts`:
```ts
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

import { AccountStatus } from "../../generated/prisma/client.js";

export class ListAdminsQueryDto {
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
Why `@Type(() => Number)`: query strings are always strings; with `transform: true` this turns `"2"` into `2` before validation.

`src/admins/dto/admin-summary.dto.ts` (response shape, used for Swagger and as documentation of what is allowed out):
```ts
import type { AccountStatus } from "../../generated/prisma/client.js";

export class AdminSummaryDto {
  id!: string;
  email!: string;
  status!: AccountStatus;
  createdAt!: Date;
  lastLoginAt!: Date | null;
}

export class AdminListDto {
  data!: AdminSummaryDto[];
  page!: number;
  limit!: number;
  total!: number;
}
```
Note: the repo's `useImportType` rule is off for the server because DI constructor types must be value imports. Here `import type` is correct since `AccountStatus` is only used as a type.

### Service

`src/admins/admins.service.ts` (update/remove are added in Milestone 3):
```ts
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import argon2 from "argon2";

import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateAdminDto } from "./dto/create-admin.dto.js";
import type { ListAdminsQueryDto } from "./dto/list-admins-query.dto.js";

// Explicit allowlist. Never return a full Admin row, or passwordHash leaks.
const SUMMARY = {
  id: true,
  email: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

@Injectable()
export class AdminsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAdminDto) {
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    try {
      return await this.prisma.admin.create({
        data: { email: dto.email, passwordHash },
        select: SUMMARY,
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException("Email already in use");
      throw e;
    }
  }

  async list(q: ListAdminsQueryDto) {
    const where = {
      ...(q.status && { status: q.status }),
      ...(q.search && { email: { contains: q.search.toLowerCase() } }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.admin.findMany({
        where,
        select: SUMMARY,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.admin.count({ where }),
    ]);
    return { data, page: q.page, limit: q.limit, total };
  }

  async findOne(id: string) {
    const admin = await this.prisma.admin.findUnique({ where: { id }, select: SUMMARY });
    if (!admin) throw new NotFoundException("Admin not found");
    return admin;
  }
}
```
Why catch `P2002` instead of "find then create": two simultaneous requests can both pass a "does it exist?" check; the unique index is the real guard, so let the database decide and translate its error. (If `instanceof` fails with the pg adapter, log `e` once and check `e.code`; adapters sometimes wrap errors.) Why `$transaction([...])` for list: page and total come from one consistent snapshot.

### Controller and module

`src/admins/admins.controller.ts`:
```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";

import { AdminsService } from "./admins.service.js";
import { CreateAdminDto } from "./dto/create-admin.dto.js";
import { ListAdminsQueryDto } from "./dto/list-admins-query.dto.js";

@Controller("admins")
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Post()
  create(@Body() dto: CreateAdminDto) {
    return this.admins.create(dto);
  }

  @Get()
  list(@Query() q: ListAdminsQueryDto) {
    return this.admins.list(q);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.admins.findOne(id);
  }
}
```
`src/admins/admins.module.ts`:
```ts
import { Module } from "@nestjs/common";

import { AdminsController } from "./admins.controller.js";
import { AdminsService } from "./admins.service.js";

@Module({
  controllers: [AdminsController],
  providers: [AdminsService],
})
export class AdminsModule {}
```
In `src/app.module.ts`, replace the `AdminModule` import and entry with `AdminsModule` (from `./admins/admins.module.js`).

### Checkpoint

```bash
pnpm dev:server      # then open http://localhost:3000/docs, or use curl
curl -i -H 'content-type: application/json' \
  -d '{"email":"Second@Padlock.local","password":"another-long-password"}' localhost:3000/admins
curl -s 'localhost:3000/admins?search=second&status=ACTIVE&limit=5'
```
- Create gives 201; email comes back lowercased; **no `passwordHash` in the response**.
- Same email again gives 409; `"email":"nope"` or a short password gives 400; an extra field like `"role":"x"` gives 400.
- List shows both admins with `total: 2`; `limit=0` gives 400.
- `GET /admins/not-a-uuid` gives 400; a random valid UUID gives 404.

Commit: `feat(server): add admins create and read`.

---

## Milestone 3: Update and delete (with the "last active admin" rule)

### DTO

`src/admins/dto/update-admin.dto.ts`:
```ts
import { Transform } from "class-transformer";
import { IsEmail, IsEnum, IsOptional } from "class-validator";

import { AccountStatus } from "../../generated/prisma/client.js";

export class UpdateAdminDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value
  )
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEnum(AccountStatus)
  @IsOptional()
  status?: AccountStatus;
}
```
Why hand-written instead of `PartialType(CreateAdminDto)`: the password must NOT be updatable here, and with `forbidNonWhitelisted` a hand-written class makes that rule explicit (sending `password` returns 400). Try `PartialType(OmitType(CreateAdminDto, ["password"]))` from `@nestjs/swagger` afterwards as an exercise and compare; it also keeps Swagger in sync.

### Service additions

Add to `AdminsService` (new imports: `BadRequestException` from `@nestjs/common`, `UpdateAdminDto`):
```ts
async update(id: string, dto: UpdateAdminDto) {
  if (dto.email === undefined && dto.status === undefined) {
    throw new BadRequestException("Nothing to update");
  }
  try {
    return await this.prisma.$transaction(async (tx) => {
      const admin = await tx.admin.findUnique({ where: { id }, select: { status: true } });
      if (!admin) throw new NotFoundException("Admin not found");
      if (admin.status === "ACTIVE" && dto.status === "DISABLED") {
        await this.assertNotLastActive(tx, id);
      }
      return tx.admin.update({
        where: { id },
        data: { email: dto.email, status: dto.status },
        select: SUMMARY,
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictException("Email already in use");
    throw e;
  }
}

async remove(id: string) {
  await this.prisma.$transaction(async (tx) => {
    const admin = await tx.admin.findUnique({ where: { id }, select: { status: true } });
    if (!admin) throw new NotFoundException("Admin not found");
    if (admin.status === "ACTIVE") await this.assertNotLastActive(tx, id);
    await tx.admin.delete({ where: { id } });
  });
}

// Lockout protection: there must always be another ACTIVE admin left.
private async assertNotLastActive(tx: Prisma.TransactionClient, id: string) {
  const others = await tx.admin.count({ where: { status: "ACTIVE", id: { not: id } } });
  if (others === 0) throw new ConflictException("Cannot remove the last active admin");
}
```
Why a transaction: the check and the write must see the same state. Honest caveat: under the default isolation (READ COMMITTED), two simultaneous "disable the other admin" requests could both pass the check. For this guide that's acceptable; as an exercise, read about `isolationLevel: "Serializable"` in `$transaction` options and what retry (`P2034`) it would require.

Why check `status === "ACTIVE"` first: deleting or disabling an already-disabled admin can't reduce the active count, so it's always allowed.

### Controller additions

Add `Delete`, `HttpCode`, `Patch` to the `@nestjs/common` import, plus `UpdateAdminDto`:
```ts
@Patch(":id")
update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAdminDto) {
  return this.admins.update(id, dto);
}

@Delete(":id")
@HttpCode(204)
remove(@Param("id", ParseUUIDPipe) id: string) {
  return this.admins.remove(id);
}
```
Decide yourself and note it: should deleting an unknown id be 404 (as written) or an idempotent 204? Both are defensible.

### Checkpoint

You should have two ACTIVE admins from Milestone 2 (call them A = seed, B = second).

1. `PATCH /admins/B {"email":"renamed@padlock.local"}` gives 200 with the new email.
2. `PATCH /admins/B {"email":"<A's email>"}` gives 409.
3. `PATCH /admins/B {}` gives 400; `{"password":"x"}` gives 400.
4. `PATCH /admins/B {"status":"DISABLED"}` gives 200 (A is still active).
5. `PATCH /admins/A {"status":"DISABLED"}` gives **409** (B is disabled, so A is the last active admin).
6. `PATCH /admins/B {"status":"ACTIVE"}` back to 200; now disabling A works.
7. Re-enable A. `DELETE /admins/B` gives 204; `DELETE /admins/B` again gives 404; `DELETE /admins/A` gives 409.
8. Check Studio matches what the API says.

Commit: `feat(server): add admins update and delete`.

---

## Milestone 4 (optional, recommended): Tests

No test runner exists yet. Adding one is deliberate: add a turbo `test` task and update `CLAUDE.md` (the repo asks for this). Check Vitest vs Jest against the ESM/`NodeNext` setup first.
```bash
pnpm --filter server add -D vitest supertest @types/supertest @nestjs/testing
```
Learn `Test.createTestingModule({ providers: [AdminsService, { provide: PrismaService, useValue: mock }] })`, then unit-test `AdminsService`:
- duplicate email gives `ConflictException`
- disabling or deleting the last ACTIVE admin gives `ConflictException`; the same with two active admins succeeds
- unknown id gives `NotFoundException`
- a regression test that no result object contains `passwordHash`

---

## Final verification

1. `docker compose up -d`, `pnpm --filter server exec prisma migrate dev`, `pnpm --filter server exec prisma db seed`
2. `pnpm dev:server`, open `/docs`, run all five routes
3. Negatives: bad UUID 400, unknown id 404, duplicate email 409, extra/unknown field 400, last-active-admin 409
4. `pnpm typecheck && pnpm lint`; one commit per milestone

## What's next (separate guides, in `ADMIN_GUIDE.md` terms)

1. **Login/refresh/logout + guard** (old M2-M3): adds `sessions`, JWT, `AdminJwtGuard`; this is what finally protects `/admins`. Writes `lastLoginAt`.
2. **Password reset** (old M5): `password_reset_tokens`, mail abstraction, and a safe way to change an admin's password.
3. **Audit log + user management** (old M4): `users`, `admin_audit_logs`, and FR-13.
4. Rate limiting and tests (old M6-M7).

When you get stuck or finish a milestone, ask me to explain a concept or review your diff.
