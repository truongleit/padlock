# Padlock Admin feature: NestJS walkthrough with code and commands

## Context

Scope (SRS FR-12, FR-13, UC-23..28, NFR-SEC-4/5; `docs/padlock_database_design.md`):
- Admin login, admin-only access, forgot/reset admin password by emailed link (FR-12)
- List users, disable/reactivate, delete, each audit-logged (FR-13)
- Admin endpoints never expose vault data or key material (NFR-SEC-5)

The server is currently a hello route plus Swagger. Nothing else exists (no DB, config, validation, auth). Work milestone by milestone, type the code yourself so it sticks, and read the "Why" notes. Repo rules: pnpm only, relative imports end in `.js`, DTOs are `*.dto.ts`, no `any`, async must `await`, Conventional Commits, run `pnpm typecheck && pnpm lint` before each commit.

**Version caveat:** Prisma changes setup between majors. The code below is the Prisma 7 style (`prisma.config.ts`, `prisma-client` generator, `@prisma/adapter-pg`). After installing, skim the installed Prisma docs; if it is Prisma 6, the datasource `url` stays in `schema.prisma` and the generator is `prisma-client-js`. Fix small type errors yourself; that is part of learning.

## Target structure (`apps/server`)

```
prisma/schema.prisma  prisma/seed.ts  prisma.config.ts
src/
  config/env.ts
  prisma/{prisma.module,prisma.service}.ts
  common/token.util.ts
  mail/{mail.service,console-mail.service,mail.module}.ts
  admin/
    admin.module.ts
    auth/{admin-auth.controller,admin-auth.service,admin-jwt.guard,current-admin.decorator}.ts
    auth/dto/{admin-login,forgot-password,reset-password}.dto.ts
    users/{admin-users.controller,admin-users.service}.ts
    users/dto/{list-users-query,user-summary}.dto.ts
```

---

## Milestone 0: Foundation (modules, DI, config, pipes)

```bash
# from repo root
pnpm --filter server add @nestjs/config zod class-validator class-transformer helmet cookie-parser
pnpm --filter server add -D @types/cookie-parser
```

`docker-compose.yml` (repo root; deliberate new file):
```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: padlock
      POSTGRES_PASSWORD: padlock
      POSTGRES_DB: padlock
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  pgdata:
```

`apps/server/.env.example` (copy to `.env`):
```
DATABASE_URL=postgresql://padlock:padlock@localhost:5432/padlock
ADMIN_JWT_SECRET=change-me-to-a-long-random-string-at-least-32-chars
ADMIN_WEB_ORIGIN=http://localhost:5173
SEED_ADMIN_EMAIL=admin@padlock.local
SEED_ADMIN_PASSWORD=ChangeMe-12345!
```

`src/config/env.ts`: fail fast on bad config.
```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  ADMIN_JWT_SECRET: z.string().min(32),
  ADMIN_WEB_ORIGIN: z.string().url(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof schema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return schema.parse(config);
}
```

`src/app.module.ts`:
```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```
(Add the `PrismaModule` and `AdminModule` imports after you create them in the next milestones.)

`src/main.ts`:
```ts
import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.getOrThrow<string>("ADMIN_WEB_ORIGIN"),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle("Padlock API")
    .setVersion("0.1")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, doc));

  await app.listen(config.get<number>("PORT") ?? 3000);
}

void bootstrap();
```
Why: `whitelist` strips unknown fields, `forbidNonWhitelisted` rejects them, `transform` turns query strings into numbers. DTOs must be classes so decorators have runtime metadata. If `import cookieParser from "cookie-parser"` fails under `NodeNext`, try `import * as` or check its types.

Checkpoint: `docker compose up -d`, `pnpm dev:server` boots; delete a var in `.env` and it crashes with a clear message.

---

## Milestone 1: Database with Prisma (global modules, lifecycle hooks)

```bash
pnpm --filter server add @prisma/client @prisma/adapter-pg pg dotenv argon2
pnpm --filter server add -D prisma tsx @types/pg
cd apps/server && pnpm prisma init   # creates prisma/ and prisma.config.ts; then edit as below
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

`prisma/schema.prisma` (modeled on the design doc; vault tables included so cascade works):
```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum AccountStatus { ACTIVE DISABLED }
enum ClientType    { WEB EXTENSION ADMIN }
enum AuditAction   { DISABLE REACTIVATE DELETE }

model User {
  id                      String        @id @default(uuid()) @db.Uuid
  email                   String        @unique
  authHash                Bytes         @map("auth_hash")
  kdfSalt                 Bytes         @map("kdf_salt")
  kdfParams               Json          @map("kdf_params")
  wrappedVaultKeyMaster   Bytes         @map("wrapped_vault_key_master")
  wrappedVaultKeyRecovery Bytes         @map("wrapped_vault_key_recovery")
  wrapIvMaster            Bytes         @map("wrap_iv_master")
  wrapIvRecovery          Bytes         @map("wrap_iv_recovery")
  status                  AccountStatus @default(ACTIVE)
  createdAt               DateTime      @default(now()) @map("created_at") @db.Timestamptz
  updatedAt               DateTime      @updatedAt @map("updated_at") @db.Timestamptz
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

model Admin {
  id           String        @id @default(uuid()) @db.Uuid
  email        String        @unique
  passwordHash String        @map("password_hash")
  status       AccountStatus @default(ACTIVE)
  createdAt    DateTime      @default(now()) @map("created_at") @db.Timestamptz
  lastLoginAt  DateTime?     @map("last_login_at") @db.Timestamptz
  sessions     Session[]
  resetTokens  PasswordResetToken[]
  auditLogs    AdminAuditLog[]
  @@map("admins")
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
  targetUserId String      @map("target_user_id") @db.Uuid // no relation: survives user deletion
  action       AuditAction
  createdAt    DateTime    @default(now()) @map("created_at") @db.Timestamptz
  admin        Admin       @relation(fields: [adminId], references: [id])
  @@map("admin_audit_logs")
}
```
(`UserSettings` omitted since admin doesn't need it; add it when you build the user feature.)

Migrate, then add the CHECK constraints Prisma can't express:
```bash
pnpm prisma migrate dev --create-only --name init
```
Append to the generated `migration.sql`:
```sql
ALTER TABLE sessions ADD CONSTRAINT sessions_one_owner
  CHECK ((user_id IS NULL) <> (admin_id IS NULL));
ALTER TABLE password_reset_tokens ADD CONSTRAINT reset_one_owner
  CHECK ((user_id IS NULL) <> (admin_id IS NULL));
```
```bash
pnpm prisma migrate dev     # applies it
pnpm prisma generate
```

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
Why `@Global()`: every feature needs the DB, so you avoid importing it everywhere. Add `src/generated` to `.gitignore`, and check whether Biome should ignore it (`biome.json` `files.includes`).

`prisma/seed.ts` (no public admin signup, by design):
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
  create: { email, passwordHash: await argon2.hash(password, { type: argon2.argon2id }) },
});
await prisma.$disconnect();
```
```bash
pnpm prisma db seed
pnpm prisma studio    # verify: admins row with $argon2id$ hash
```

Also seed 2-3 fake users by hand in Studio (any bytes values) so Milestone 4 has data.

---

## Milestone 2: Admin login, refresh, logout (DTOs, services, controllers, JWT, cookies)

```bash
pnpm --filter server add @nestjs/jwt
```

`src/common/token.util.ts`:
```ts
import { createHash, randomBytes } from "node:crypto";

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

// Uint8Array copy keeps Prisma's Bytes type happy
export function hashToken(token: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash("sha256").update(token).digest());
}
```

`src/admin/auth/dto/admin-login.dto.ts`:
```ts
import { Transform } from "class-transformer";
import { IsEmail, IsString, MinLength } from "class-validator";

export class AdminLoginDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
```

`src/admin/auth/admin-auth.service.ts` (login / refresh / logout first; reset is added in Milestone 5):
```ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";

import { hashToken, newToken } from "../../common/token.util.js";
import { PrismaService } from "../../prisma/prisma.service.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Used to equalize timing when the email doesn't exist
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000";

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async login(email: string, password: string) {
    const admin = await this.prisma.admin.findUnique({ where: { email } });
    const ok = await argon2
      .verify(admin?.passwordHash ?? DUMMY_HASH, password)
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
      data: { revokedAt: new Date() }, // rotation: old token is dead
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
    const accessToken = await this.jwt.signAsync({ sub: adminId, role: "admin" });
    return { accessToken, refreshToken };
  }
}
```
The `DUMMY_HASH` above is a placeholder; generate a real one once (`node -e "import('argon2').then(a=>a.hash('x').then(console.log))"`) and paste it, otherwise `verify` throws instantly and the timing trick is lost. Why: unknown email and wrong password must cost the same and return the same error.

`src/admin/auth/admin-auth.controller.ts`:
```ts
import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";

import { AdminAuthService } from "./admin-auth.service.js";
import { AdminLoginDto } from "./dto/admin-login.dto.js";

const COOKIE = "admin_refresh";

@Controller("admin/auth")
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly config: ConfigService
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: AdminLoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.auth.login(dto.email, dto.password);
    this.setCookie(res, refreshToken);
    return { accessToken };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.auth.refresh(req.cookies?.[COOKIE]);
    this.setCookie(res, refreshToken);
    return { accessToken };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: "/admin/auth" });
  }

  private setCookie(res: Response, token: string) {
    res.cookie(COOKIE, token, {
      httpOnly: true,
      secure: this.config.get("NODE_ENV") === "production",
      sameSite: "strict",
      path: "/admin/auth",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
```
Why `passthrough`: lets you set cookies on the Express response while Nest still serializes your return value.

`src/admin/admin.module.ts` (grows over milestones):
```ts
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
Checkpoint: curl login, see `Set-Cookie`; refresh rotates (reusing the old cookie fails); logout kills it.
```bash
curl -i -c jar -H 'content-type: application/json' \
  -d '{"email":"admin@padlock.local","password":"ChangeMe-12345!"}' localhost:3000/admin/auth/login
curl -i -b jar -c jar -X POST localhost:3000/admin/auth/refresh
```

---

## Milestone 3: Guard and decorator (authorization)

`src/admin/auth/admin-jwt.guard.ts`:
```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

import { PrismaService } from "../../prisma/prisma.service.js";

export type AdminRequest = Request & { admin: { id: string } };

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
      .verifyAsync<{ sub: string; role: string }>(token)
      .catch(() => null);
    if (payload?.role !== "admin") throw new UnauthorizedException();

    // DB check: a disabled admin is locked out immediately, not at token expiry
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
`src/admin/auth/current-admin.decorator.ts`:
```ts
import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import type { AdminRequest } from "./admin-jwt.guard.js";

export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AdminRequest>().admin
);
```
Add `AdminJwtGuard` to `AdminModule.providers`. Test route in the auth controller:
```ts
@Get("me")
@UseGuards(AdminJwtGuard)
@ApiBearerAuth()
me(@CurrentAdmin() admin: { id: string }) {
  return admin;
}
```
Checkpoint: 401 with no token / tampered token; 200 with a good one. Exercise afterward: rewrite as a global guard + `@Public()` decorator using `Reflector`.

---

## Milestone 4: User management (query DTOs, pipes, transactions)

`src/admin/users/dto/list-users-query.dto.ts`:
```ts
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListUsersQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @IsOptional()
  page = 1;

  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional()
  limit = 20;

  @IsString() @IsOptional()
  search?: string;

  @IsEnum(["ACTIVE", "DISABLED"]) @IsOptional()
  status?: "ACTIVE" | "DISABLED";
}
```
`src/admin/users/dto/user-summary.dto.ts`:
```ts
export class UserSummaryDto {
  id!: string;
  email!: string;
  status!: "ACTIVE" | "DISABLED";
  createdAt!: Date;
}

export class UserListDto {
  data!: UserSummaryDto[];
  page!: number;
  limit!: number;
  total!: number;
}
```
`src/admin/users/admin-users.service.ts`:
```ts
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";

import type { AuditAction } from "../../generated/prisma/client.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { ListUsersQueryDto } from "./dto/list-users-query.dto.js";

// NFR-SEC-5: explicit allowlist. Never findMany() without select,
// or authHash and wrapped keys would be loaded.
const SUMMARY = { id: true, email: true, status: true, createdAt: true } as const;

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
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user) throw new NotFoundException("User not found");
      if (user.status === to) throw new ConflictException(`User already ${to.toLowerCase()}`);

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
      await tx.adminAuditLog.create({ data: { adminId, targetUserId: userId, action } });
      return updated;
    });
  }

  async remove(adminId: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!exists) throw new NotFoundException("User not found");
      await tx.user.delete({ where: { id: userId } }); // cascades vault, sessions, tokens
      await tx.adminAuditLog.create({
        data: { adminId, targetUserId: userId, action: "DELETE" },
      });
    });
  }
}
```
Why a transaction: the change and its audit record succeed or fail together (NFR-REL-2).

`src/admin/users/admin-users.controller.ts`:
```ts
import {
  Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Query, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";

import { AdminJwtGuard } from "../auth/admin-jwt.guard.js";
import { CurrentAdmin } from "../auth/current-admin.decorator.js";
import { AdminUsersService } from "./admin-users.service.js";
import { ListUsersQueryDto } from "./dto/list-users-query.dto.js";

@Controller("admin/users")
@UseGuards(AdminJwtGuard)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@Query() q: ListUsersQueryDto) {
    return this.users.list(q);
  }

  @Patch(":id/disable")
  disable(@CurrentAdmin() admin: { id: string }, @Param("id", ParseUUIDPipe) id: string) {
    return this.users.setStatus(admin.id, id, "DISABLED");
  }

  @Patch(":id/reactivate")
  reactivate(@CurrentAdmin() admin: { id: string }, @Param("id", ParseUUIDPipe) id: string) {
    return this.users.setStatus(admin.id, id, "ACTIVE");
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentAdmin() admin: { id: string }, @Param("id", ParseUUIDPipe) id: string) {
    return this.users.remove(admin.id, id);
  }
}
```
Register both in `AdminModule` (`controllers`/`providers`). Decide yourself and note it: delete 404 vs idempotent 204; whether delete should need a confirmation parameter.

Checkpoint: list, disable (user sessions revoked, audit row), reactivate, delete; confirm the response contains no `authHash` / `wrapped*`; `Bad uuid` gives 400; unknown id gives 404.

---

## Milestone 5: Admin password reset (provider abstraction, DI tokens, security semantics)

`src/mail/mail.service.ts`:
```ts
export const MAIL_SERVICE = Symbol("MAIL_SERVICE");

export interface MailService {
  sendPasswordReset(to: string, link: string): Promise<void>;
}
```
`src/mail/console-mail.service.ts`:
```ts
import { Injectable, Logger } from "@nestjs/common";

import type { MailService } from "./mail.service.js";

@Injectable()
export class ConsoleMailService implements MailService {
  private readonly log = new Logger("Mail");

  sendPasswordReset(to: string, link: string) {
    this.log.log(`Reset link for ${to}: ${link}`);
    return Promise.resolve();
  }
}
```
`src/mail/mail.module.ts`:
```ts
@Module({
  providers: [{ provide: MAIL_SERVICE, useClass: ConsoleMailService }],
  exports: [MAIL_SERVICE],
})
export class MailModule {}
```
(Import `MailModule` in `AdminModule`. Later swap `useClass` to a Resend implementation, with no change in admin code. That is the DI lesson.)

DTOs: `forgot-password.dto.ts` is `{ email }` (same decorators as login). `reset-password.dto.ts`:
```ts
export class ResetPasswordDto {
  @IsString() @MinLength(20) token!: string;
  @IsString() @MinLength(12) @MaxLength(128) newPassword!: string;
}
```
Add to `AdminAuthService` (inject `@Inject(MAIL_SERVICE) private readonly mail: MailService` and `ConfigService`):
```ts
async forgotPassword(email: string) {
  const admin = await this.prisma.admin.findUnique({ where: { email } });
  if (!admin || admin.status !== "ACTIVE") return; // same response either way (NFR-SEC-11)
  const token = newToken();
  await this.prisma.passwordResetToken.create({
    data: {
      adminId: admin.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // NFR-SEC-10
    },
  });
  const origin = this.config.getOrThrow<string>("ADMIN_WEB_ORIGIN");
  void this.mail
    .sendPasswordReset(admin.email, `${origin}/reset-password?token=${token}`)
    .catch((e) => this.log.error(e)); // don't let mail latency reveal existence
}

async resetPassword(token: string, newPassword: string) {
  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
  await this.prisma.$transaction(async (tx) => {
    // updateMany + count === 1 makes single-use race-safe
    const claimed = await tx.passwordResetToken.updateMany({
      where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new BadRequestException("Invalid or expired link");

    const row = await tx.passwordResetToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });
    if (!row.adminId) throw new BadRequestException("Invalid or expired link");
    await tx.admin.update({ where: { id: row.adminId }, data: { passwordHash } });
    await tx.session.updateMany({
      where: { adminId: row.adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
}
```
Add a `private readonly log = new Logger(AdminAuthService.name)`. Controller routes: `POST forgot-password` (`@HttpCode(202)`, returns `{ message: "If that account exists, a link was sent." }`) and `POST reset-password` (`@HttpCode(204)`).

Checkpoint: forgot, copy link from the logs, reset; old password fails, new works; reusing the link fails; temporarily set TTL to 10s to test expiry; fake email returns the identical response.

---

## Milestone 6: Hardening (rate limiting)

```bash
pnpm --filter server add @nestjs/throttler
```
In `AppModule.imports`: `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])` and provider `{ provide: APP_GUARD, useClass: ThrottlerGuard }`. On auth routes tighten: `@Throttle({ default: { limit: 5, ttl: 60_000 } })` for `login`, `forgot-password`, `reset-password`. Optional: `@nestjs/schedule` cron to delete expired/used reset tokens and expired sessions (design note 6).

---

## Milestone 7 (recommended): Tests

No runner exists; add one deliberately (turbo `test` task + update CLAUDE.md). Check Vitest vs Jest with this ESM/NodeNext setup.
```bash
pnpm --filter server add -D vitest supertest @types/supertest @nestjs/testing
```
Learn: `Test.createTestingModule({...}).overrideProvider(PrismaService).useValue(mock)`, then unit-test `AdminUsersService` (409 on no-op, audit written), and a supertest e2e: login, guarded route, disable. Add a regression test that the list response never contains `authHash`.

---

## Final verification

1. `docker compose up -d`, `pnpm prisma migrate dev`, `pnpm prisma db seed`
2. `pnpm dev:server`, open `/docs`: login, Authorize with the token, list, disable, reactivate, delete
3. Negatives: no token / tampered token / disabled admin = 401; bad UUID = 400; unknown user = 404; forgot-password identical for real vs fake emails; reset link single-use and expires
4. `pnpm typecheck && pnpm lint` before each commit; one commit per milestone (`feat(server): add admin login`)

When you get stuck or finish a milestone, ask me to explain a concept or review your diff.
