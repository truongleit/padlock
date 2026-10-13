# Padlock Admin: password reset, then rate limiting

## Context

This is the slow, small version of Milestones 5 and 6 of `ADMIN_GUIDE.md`. It picks up where `ADMIN_GUARD_USERS_GUIDE.md` ended.

Scope:
- **Part A (Milestone 5):** forgot-password and reset-password for admins by an emailed, single-use, expiring link (SRS FR-12, NFR-SEC-10/11). Email is a console log by default, with an optional real SMTP sender (A6) behind the same swappable provider.
- **Part B (Milestone 6):** rate limiting with `@nestjs/throttler`, tighter on the auth routes.

Not in this guide: the web reset page, HTML email templates, tests (Milestone 7), a cleanup job for old tokens.

### Where the repo should be before you start

You have: tables including `PasswordResetToken`, `AdminAuthService` (login/refresh/logout), `AdminJwtGuard` registered **globally** (`APP_GUARD`) with `@Public()` for open routes, `common/password.util.ts` (`hashPassword`), `common/token.util.ts` (`newToken`, `hashToken`), `common/email.util.ts` (`@NormalizeEmail()`), and `ADMIN_WEB_ORIGIN` in the env. Check:
```bash
docker compose up -d db
pnpm typecheck && pnpm lint      # both clean
```

Rules of this repo: pnpm only, extensionless imports with `@/*` for cross-folder and `./` for siblings, DTOs are `*.dto.ts`, no `any`, `async` must `await`, no `console` (use Nest's `Logger`), Conventional Commits, run `pnpm typecheck && pnpm lint` before each commit. Type the code yourself so it sticks.

### Decisions already made (change them if you disagree)

| Topic | Decision |
| --- | --- |
| Routes | `POST /admin/auth/forgot-password` (202), `POST /admin/auth/reset-password` (204), both `@Public()` |
| Token | 32 random bytes (`newToken()`), only its SHA-256 hash stored, valid 30 minutes, single use |
| Link | `${ADMIN_WEB_ORIGIN}/reset-password#token=<token>`. The `#fragment` is never sent to a server or written to access logs |
| No enumeration | `forgot-password` returns the same 202 body for real, unknown, and disabled emails |
| Mail | An abstract class `MailService` is both the type and the DI token; `ConsoleMailService` logs the link. No separate interface or `Symbol`. `SmtpMailService` (nodemailer) is used only when `SMTP_HOST` is set (A6) |
| After reset | New password hash saved, **all** of the admin's sessions revoked, their other unused reset tokens burned |
| Rate limit | 60 requests/min per IP globally; 5/min per IP on login, refresh, forgot-password, reset-password |
| Storage | Throttler's default in-memory store (single instance) |

## Target structure (`apps/server`)

```
src/
  mail/
    mail.service.ts            (new: abstract class)
    console-mail.service.ts    (new)
    mail.module.ts             (new; A6: picks Console or Smtp)
    smtp-mail.service.ts       (new, A6)
  admin/
    admin.module.ts            (edit: import MailModule)
    auth/admin-auth.service.ts (edit: forgotPassword, resetPassword)
    auth/admin-auth.controller.ts (edit: two routes, throttles)
    auth/dto/forgot-password.dto.ts   (new)
    auth/dto/reset-password.dto.ts    (new)
  config/env.ts                (edit, A6: SMTP vars)
  app.module.ts                (edit, Part B)
  common/errors/error-codes.ts (edit, Part B)
```

---

# Part A: Milestone 5, password reset

## A1: The mail provider

`src/mail/mail.service.ts`:
```ts
// Abstract class = the contract AND the injection token. Swap the provider in
// MailModule without touching callers.
export abstract class MailService {
  abstract sendPasswordReset(to: string, link: string): Promise<void>;
}
```
`src/mail/console-mail.service.ts`:
```ts
import { Injectable, Logger } from "@nestjs/common";

import { MailService } from "@/mail/mail.service";

@Injectable()
export class ConsoleMailService extends MailService {
  private readonly log = new Logger("Mail");

  sendPasswordReset(to: string, link: string) {
    this.log.log(`Reset link for ${to}: ${link}`);
    return Promise.resolve();
  }
}
```
`useAwait` forbids an `async` function without `await`, so return a resolved promise instead.

`src/mail/mail.module.ts`:
```ts
import { Module } from "@nestjs/common";

import { ConsoleMailService } from "@/mail/console-mail.service";
import { MailService } from "@/mail/mail.service";

@Module({
  providers: [{ provide: MailService, useClass: ConsoleMailService }],
  exports: [MailService],
})
export class MailModule {}
```
Add `MailModule` to `AdminModule.imports`.

Why: this is the DI lesson of the milestone. Later you write a `ResendMailService extends MailService`, change one `useClass` (or `useFactory` to pick by env), and the admin code never changes. A `Symbol` token plus a separate interface would add two things for the same effect.

## A2: DTOs

`src/admin/auth/dto/forgot-password.dto.ts`:
```ts
import { IsEmail } from "class-validator";

import { NormalizeEmail } from "@/common/email.util";

export class ForgotPasswordDto {
  @NormalizeEmail()
  @IsEmail()
  email!: string;
}
```
`src/admin/auth/dto/reset-password.dto.ts`:
```ts
import { IsString, MaxLength, MinLength } from "class-validator";

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  // Same rule as CreateAdminDto.password
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}
```
`MaxLength` on the token stops someone from making you hash a huge string; a real token is 43 characters.

## A3: Service methods

In `AdminAuthService`, inject `MailService` and `ConfigService`, add `private readonly log = new Logger(AdminAuthService.name)`, and add:
```ts
const RESET_TTL_MS = 30 * 60 * 1000; // NFR-SEC-10

async forgotPassword(email: string) {
  const admin = await this.prisma.admin.findUnique({ where: { email } });
  if (!admin || admin.status !== "ACTIVE") return; // same response either way (NFR-SEC-11)

  const token = newToken();
  await this.prisma.passwordResetToken.create({
    data: {
      adminId: admin.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  const origin = this.config.getOrThrow<string>("ADMIN_WEB_ORIGIN");
  // Not awaited on purpose: mail latency must not reveal that the account exists.
  this.mail
    .sendPasswordReset(admin.email, `${origin}/reset-password#token=${token}`)
    .catch((e: unknown) => this.log.error(e));
}

async resetPassword(token: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword); // slow; do it before the transaction
  const tokenHash = hashToken(token);

  await this.prisma.$transaction(async (tx) => {
    const row = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row?.adminId) throw new BadRequestException("Invalid or expired link");

    // updateMany + count === 1 makes "single use" race-safe: of two
    // simultaneous requests, only one can flip usedAt from null.
    const now = new Date();
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new BadRequestException("Invalid or expired link");

    await tx.admin.update({ where: { id: row.adminId }, data: { passwordHash } });
    await tx.session.updateMany({
      where: { adminId: row.adminId, revokedAt: null },
      data: { revokedAt: now },
    });
    // A new request or a leaked older email must not still work.
    await tx.passwordResetToken.updateMany({
      where: { adminId: row.adminId, usedAt: null },
      data: { usedAt: now },
    });
  });
}
```
New imports: `BadRequestException`, `Logger` from `@nestjs/common`; `ConfigService`; `MailService`; `hashPassword`. Adjust the import you already have for `hashPassword` if it is there.

Things to notice:
- **Same response for known and unknown emails**, and the mail send is fire-and-forget. The remaining timing gap (the unknown-email path skips one DB insert) is tiny next to network jitter; the throttle in Part B limits probing anyway.
- **Why look the row up and then claim it**: `updateMany` can't return the row, and you need `adminId`. The `where` on the claim repeats the validity checks, so the lookup is only for the id and never trusted for expiry.
- **Everything in one transaction**: the claim, the password change, and the session revocation commit together. A failure can't leave a burned token with the old password.
- **Revoking all sessions** means anyone holding a stolen refresh cookie is kicked out by the reset. Access tokens already issued live until their `exp` (default 1h) unless the guard's DB check rejects them, which it only does for a disabled admin. Decide whether that gap matters; shortening `ADMIN_JWT_EXPIRES_IN` is the cheap lever.
- A disabled admin who somehow holds a valid link can still reset their password, but they stay locked out because login and the guard check `status`. That is fine; no extra check needed.
- The email in the link goes through your mail provider; the token is a bearer secret, so never log it outside `ConsoleMailService` (dev only).

## A4: Routes

In `AdminAuthController` (imports: `ForgotPasswordDto`, `ResetPasswordDto`):
```ts
@Public()
@Post("forgot-password")
@HttpCode(202)
async forgotPassword(@Body() dto: ForgotPasswordDto) {
  await this.auth.forgotPassword(dto.email);
  return { message: "If that account exists, a link was sent." };
}

@Public()
@Post("reset-password")
@HttpCode(204)
async resetPassword(@Body() dto: ResetPasswordDto) {
  await this.auth.resetPassword(dto.token, dto.newPassword);
}
```
Both are `@Public()`: the global guard would otherwise demand a Bearer token from someone who can't log in.

## A5: Checkpoint

```bash
pnpm dev:server
curl -i -H 'content-type: application/json' -d '{"email":"admin@padlock.local"}' \
  localhost:3000/admin/auth/forgot-password
```
- The server log prints `Reset link for admin@padlock.local: http://localhost:5173/reset-password#token=...`. Copy the token.
- `reset-password` with that token and a new 12+ character password returns **204**:
  ```bash
  curl -i -H 'content-type: application/json' \
    -d '{"token":"<TOKEN>","newPassword":"a-brand-new-password"}' localhost:3000/admin/auth/reset-password
  ```
- Login with the old password is 401; with the new one is 200.
- Reusing the same token is **400**.
- Studio: the token row has `used_at` set; the admin's earlier `sessions` have `revoked_at`.
- A refresh cookie from before the reset now fails (401).
- An unknown email and a disabled admin's email both return the **identical** 202 body and write no token row.
- Expiry: temporarily set `RESET_TTL_MS` to `10_000`, request a link, wait 11 seconds, reset: 400. Restore it.
- Two links requested back to back: resetting with the first burns the second (400).
- Bad bodies: short token or password returns 400 with per-field `details`.
- Concurrency (optional): fire two resets with the same token at once (`curl ... & curl ... &`); exactly one gets 204.

Run `pnpm typecheck && pnpm lint`. Commit: `feat(server): add admin password reset`.

## A6: Real email over SMTP (nodemailer)

Goal: the same `forgotPassword` flow sends a real email when SMTP credentials are in `.env`, and still logs to the console when they are not. `AdminAuthService` does not change.

### 1. Install

```bash
pnpm --filter server add nodemailer
pnpm --filter server add -D @types/nodemailer
```
(`minimumReleaseAge` in `pnpm-workspace.yaml` may block a very fresh release; pick the previous version rather than excluding it.)

### 2. Get credentials

Any SMTP account works. Pick one:
- **Local, no account:** run Mailpit (`docker run -p 1025:1025 -p 8025:8025 axllent/mailpit`), use host `localhost`, port `1025`, no user/pass, and read mail at http://localhost:8025. Best for development.
- **Gmail:** enable 2-step verification, create an *App password* (Google Account > Security), use host `smtp.gmail.com`, port `465`, user = your address, pass = the 16-character app password. Your normal password will not work.
- **A provider** (Resend, Postmark, SES, ...): copy host, port, user, and password from its SMTP settings page.

### 3. Env vars

Add to `apps/server/.env` and, with placeholder values, to `.env.example`:
```
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Padlock <no-reply@padlock.local>"
```
In `src/config/env.ts` add to the schema:
```ts
SMTP_HOST: z.string().optional(),
SMTP_PORT: z.coerce.number().default(587),
SMTP_USER: z.string().optional(),
SMTP_PASS: z.string().optional(),
MAIL_FROM: z.string().default("Padlock <no-reply@padlock.local>"),
```
Empty values in `.env` arrive as `""`, not `undefined`, so treat `""` as unset when you read them (`config.get("SMTP_HOST")` is falsy for both, which is what the factory below relies on).

How the credentials get to the mailer: `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })` loads `.env`, zod validates it at startup, and any provider can inject `ConfigService` and call `get`/`getOrThrow`. That is exactly how `AdminAuthService` already reads `ADMIN_WEB_ORIGIN`. Nothing reads `process.env` directly.

### 3b. Decide: fail fast or not

If `SMTP_USER` is set without `SMTP_PASS`, you want a startup error, not a failed email at 3am. Optional: add `.refine((e) => !e.SMTP_USER === !e.SMTP_PASS, "SMTP_USER and SMTP_PASS go together")` to the schema.

### 4. The sender

`src/mail/smtp-mail.service.ts`:
```ts
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";

import type { Env } from "@/config/env";
import { MailService } from "@/mail/mail.service";

@Injectable()
export class SmtpMailService extends MailService {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    const port = config.get("SMTP_PORT", { infer: true });
    const user = config.get("SMTP_USER", { infer: true });
    const pass = config.get("SMTP_PASS", { infer: true });
    this.from = config.get("MAIL_FROM", { infer: true });
    this.transport = createTransport({
      host: config.get("SMTP_HOST", { infer: true }),
      port,
      secure: port === 465, // 465 = TLS from the start; 587/1025 upgrade with STARTTLS if offered
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async sendPasswordReset(to: string, link: string) {
    await this.transport.sendMail({
      from: this.from,
      to,
      subject: "Reset your Padlock admin password",
      text: `Use this link within 30 minutes to reset your password:\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
    });
  }
}
```
Notes:
- This `async` function does `await`, so `useAwait` is satisfied (unlike the console one).
- `import type { Env }` is fine; `ConfigService` must stay a value import because Nest reads the constructor parameter type at runtime.
- Plain text only. The link contains `#token=...`; some mail clients mangle long URLs in HTML, plain text is the safest start.
- Errors reject the promise. `forgotPassword` already catches that with `.catch((e) => this.log.error(e))`, so a bad SMTP password logs an error and the HTTP response stays the identical 202.

### 5. Choose the provider by env

Change `src/mail/mail.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { ConsoleMailService } from "@/mail/console-mail.service";
import { MailService } from "@/mail/mail.service";
import { SmtpMailService } from "@/mail/smtp-mail.service";

@Module({
  providers: [
    {
      provide: MailService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get("SMTP_HOST")
          ? new SmtpMailService(config)
          : new ConsoleMailService(),
    },
  ],
  exports: [MailService],
})
export class MailModule {}
```
`ConfigModule` is global, so `MailModule` needs no extra import. Callers still inject `MailService` and never learn which one they got.

### 6. Checkpoint

- Without `SMTP_HOST`: behavior is unchanged, the link is in the server log.
- With Mailpit (or your provider) configured, restart `pnpm dev:server`, call `forgot-password` for `admin@padlock.local`: the email arrives with a working link, and the link is **not** in the server log.
- Wrong `SMTP_PASS`: the endpoint still returns the same 202, and the server log shows an auth error from nodemailer.
- Unknown email: 202, no email, no token row.
- Never commit real SMTP credentials. `.env` is gitignored; only `.env.example` (placeholders) is tracked.

Run `pnpm typecheck && pnpm lint`. Commit: `feat(server): send password reset email over SMTP`.

Upgrade path: nodemailer's `createTransport` pool, a provider HTTP API (Resend, SES SDK) as a third `MailService` subclass, HTML templates. All are one more class plus one branch in the factory. Skipped until you need delivery tracking or branded email.

## Things to decide and note down

- Should a stable `ErrorCode` (for example `RESET_TOKEN_INVALID`) replace the plain 400, so the web page can show "request a new link"? Add it to `error-codes.ts` first, then throw `AppException(400, ErrorCode.X, msg)`.
- Should the reset email also be sent when an *unknown* email is used (a "no account" notice)? Skipped: it needs a real provider and extra copy.
- Old rows: expired and used tokens pile up. Harmless now; a scheduled delete (`@nestjs/schedule`) is the fix when the table size matters. Skipped on purpose.

---

# Part B: Milestone 6, rate limiting

## B1: Install

```bash
pnpm --filter server add @nestjs/throttler
```

## B2: Global limit

In `src/app.module.ts`:
```ts
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

imports: [
  ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
  ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]), // ttl is in milliseconds
  PrismaModule,
  AdminsModule,
  AdminModule,
],
providers: [
  AppService,
  { provide: APP_FILTER, useClass: AllExceptionsFilter },
  { provide: APP_GUARD, useClass: ThrottlerGuard }, // before the JWT guard
  { provide: APP_GUARD, useClass: AdminJwtGuard },
],
```
**Order matters.** Global guards run in registration order, so listing `ThrottlerGuard` first means an unauthenticated flood is counted and cut off before the JWT guard hits the database for each request. Confirm that by reading the order in your file.

## B3: Tighter limits on the auth routes

In `AdminAuthController`, import `Throttle` from `@nestjs/throttler` and add to `login`, `refresh`, `forgotPassword`, and `resetPassword`:
```ts
@Throttle({ default: { limit: 5, ttl: 60_000 } })
```
Why those four: they are public and each costs real work (an argon2 verify, a token claim, a mail). `logout` and `me` stay on the global limit.

## B4: A proper 429 code

`ThrottlerException` is an ordinary 429 `HttpException`, so `AllExceptionsFilter` already shapes it, but `defaultCodeForStatus` falls through to `INTERNAL_ERROR`, which is wrong. In `src/common/errors/error-codes.ts` add `TooManyRequests: "TOO_MANY_REQUESTS"` to `ErrorCode` and a case:
```ts
case HttpStatus.TOO_MANY_REQUESTS:
  return ErrorCode.TooManyRequests;
```

## B5: Checkpoint

```bash
pnpm dev:server
for i in 1 2 3 4 5 6 7; do
  curl -s -o /dev/null -w '%{http_code}\n' -H 'content-type: application/json' \
    -d '{"email":"admin@padlock.local","password":"wrong"}' localhost:3000/admin/auth/login
done
```
- Expect `401` five times, then `429`.
- The 429 body matches the shared shape with `code: "TOO_MANY_REQUESTS"`, and the response has a `Retry-After` header (`curl -i`).
- After a minute, login works again.
- `forgot-password` and `reset-password` hit 429 on the 6th call; `/admin/users` (global limit) does not.
- Each route has its own counter: exhausting `login` does not block `forgot-password`.
- Quick global check: 61 rapid `GET /admin/auth/me` calls with a token produce a `429` on the 61st.

Run `pnpm typecheck && pnpm lint`. Commit: `feat(server): add rate limiting`.

## Known limits (deliberate, with the upgrade path)

- **In-memory counters**: per process, reset on restart, not shared across instances. Add `@nest-lab/throttler-storage-redis` if you run more than one instance.
- **Per-IP only**: a botnet rotating IPs gets 5 tries each. A per-email key (override `getTracker` to hash `req.body.email`) would cap guesses against one account.
- **Behind a reverse proxy** every request shares the proxy's IP unless you set `app.set("trust proxy", ...)` in `main.ts`. Do that at deploy time, with the real hop count, not before.

## What's next

**Milestone 7: tests.** There is now plenty worth locking in: the guard, the transactional audit writes, the single-use reset token (including the double-request race), the throttle, and a regression test that user responses never contain `authHash`.

After this guide, say "update claude.md" so it lists the reset and throttling.

When you get stuck or finish a part, ask me to explain a concept or review your diff.
