import { createHmac } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  Logger,
  type OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";

import { REFRESH_TTL_MS, RESET_TTL_MS } from "@/admin/auth/admin-auth.service";
import type { LoginDto } from "@/auth/dto/login.dto";
import type { RegisterDto } from "@/auth/dto/register.dto";
import type { UserKeysDto } from "@/auth/dto/user-keys.dto";
import { fromB64, toB64 } from "@/common/bytes.util";
import { hashPassword } from "@/common/password.util";
import { hashToken, newToken } from "@/common/token.util";
import type { ClientType, Prisma } from "@/generated/prisma/client";
import { MailService } from "@/mail/mail.service";
import { PrismaService } from "@/prisma/prisma.service";

// What prelogin returns for an unknown email. Matches the extension's DEFAULT_KDF.
const DEFAULT_KDF_PARAMS = { alg: "PBKDF2-SHA256", iterations: 600_000 };
const INVALID_CODE = "Invalid or expired code";

@Injectable()
export class AuthService implements OnModuleInit {
  // Real argon2 hash of a throwaway value, so an unknown email costs the same
  // time as a wrong auth key. Built once at startup.
  private dummyHash = "";
  private readonly log = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService
  ) {}

  async onModuleInit() {
    this.dummyHash = await hashPassword(newToken());
  }

  async register(dto: RegisterDto) {
    await this.prisma.user.create({
      data: { email: dto.email, ...(await this.keyData(dto)) },
    });
  }

  async prelogin(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { kdfSalt: true, kdfParams: true },
    });
    if (user) {
      return { kdfSalt: toB64(user.kdfSalt), kdfParams: user.kdfParams };
    }
    // Stable fake salt, so repeated calls can't tell an unknown email from a real one.
    const fake = createHmac(
      "sha256",
      this.config.getOrThrow<string>("ADMIN_JWT_SECRET")
    )
      .update(`prelogin:${email}`)
      .digest()
      .subarray(0, 16);
    return { kdfSalt: toB64(fake), kdfParams: DEFAULT_KDF_PARAMS };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const hash = user ? Buffer.from(user.authHash).toString() : this.dummyHash;
    const ok = await argon2.verify(hash, dto.authKey).catch(() => false);
    if (!(user && ok) || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid credentials");
    }
    const refreshToken = await this.createSession(
      this.prisma,
      user.id,
      dto.clientType
    );
    return {
      ...(await this.tokens(user.id, refreshToken)),
      kdfSalt: toB64(user.kdfSalt),
      kdfParams: user.kdfParams,
      wrappedVaultKeyMaster: toB64(user.wrappedVaultKeyMaster),
      wrapIvMaster: toB64(user.wrapIvMaster),
    };
  }

  async refresh(rawToken: string | undefined) {
    if (!rawToken) throw new UnauthorizedException();
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (
      !session?.user ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.user.status !== "ACTIVE"
    ) {
      throw new UnauthorizedException();
    }
    const userId = session.user.id;
    // Same as admin refresh: claim the old token and create its replacement atomically.
    const refreshToken = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) throw new UnauthorizedException();
      return this.createSession(tx, userId, session.clientType);
    });
    return this.tokens(userId, refreshToken);
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user?.status !== "ACTIVE") return;

    const code = newToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(code),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    // Not awaited on purpose: mail latency must not reveal that the account exists.
    this.mail
      .sendUserResetCode(user.email, code)
      .catch((e: unknown) => this.log.error(e));
  }

  /** Checks the code without using it up and returns the recovery wrap to unwrap on the client. */
  async verifyReset(token: string) {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (
      !row?.user ||
      row.usedAt ||
      row.expiresAt <= new Date() ||
      row.user.status !== "ACTIVE"
    ) {
      throw new BadRequestException(INVALID_CODE);
    }
    return {
      wrappedVaultKeyRecovery: toB64(row.user.wrappedVaultKeyRecovery),
      wrapIvRecovery: toB64(row.user.wrapIvRecovery),
    };
  }

  /** FR-1.5/1.6: new master password and new recovery key, vault kept. */
  async resetPassword(token: string, keys: UserKeysDto) {
    await this.claimAndRekey(token, keys, false);
  }

  /** FR-1.7: both secrets lost. New keys, vault deleted. */
  async resetAccount(token: string, keys: UserKeysDto) {
    await this.claimAndRekey(token, keys, true);
  }

  private async claimAndRekey(
    token: string,
    keys: UserKeysDto,
    wipeVault: boolean
  ) {
    const data = await this.keyData(keys); // slow argon2; do it before the transaction
    const tokenHash = hashToken(token);

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: { select: { status: true } } },
      });
      if (!row?.userId || row.user?.status !== "ACTIVE") {
        throw new BadRequestException(INVALID_CODE);
      }

      // updateMany + count === 1 makes single use race-safe.
      const now = new Date();
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new BadRequestException(INVALID_CODE);

      if (wipeVault) {
        await tx.vaultItem.deleteMany({ where: { userId: row.userId } });
      }
      await tx.user.update({ where: { id: row.userId }, data });
      await tx.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      // Older codes for this user must not still work.
      await tx.passwordResetToken.updateMany({
        where: { userId: row.userId, usedAt: null },
        data: { usedAt: now },
      });
    });
  }

  private async keyData(keys: UserKeysDto) {
    return {
      authHash: new Uint8Array(Buffer.from(await hashPassword(keys.authKey))),
      kdfSalt: fromB64(keys.kdfSalt),
      kdfParams: keys.kdfParams as Prisma.InputJsonObject,
      wrappedVaultKeyMaster: fromB64(keys.wrappedVaultKeyMaster),
      wrapIvMaster: fromB64(keys.wrapIvMaster),
      wrappedVaultKeyRecovery: fromB64(keys.wrappedVaultKeyRecovery),
      wrapIvRecovery: fromB64(keys.wrapIvRecovery),
    };
  }

  private async createSession(
    db: Prisma.TransactionClient | PrismaService,
    userId: string,
    clientType: ClientType
  ) {
    const refreshToken = newToken();
    await db.session.create({
      data: {
        userId,
        refreshTokenHash: hashToken(refreshToken),
        clientType,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return refreshToken;
  }

  private async tokens(userId: string, refreshToken: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId, role: "user" });
    return { accessToken, refreshToken };
  }
}
