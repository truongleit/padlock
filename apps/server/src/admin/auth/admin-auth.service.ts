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

import { hashPassword } from "@/common/password.util";
import { hashToken, newToken } from "@/common/token.util";
import type { Prisma } from "@/generated/prisma/client";
import { MailService } from "@/mail/mail.service";
import { PrismaService } from "@/prisma/prisma.service";

export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const RESET_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class AdminAuthService implements OnModuleInit {
  // A real argon2 hash of a throwaway string, so an unknown email costs the
  // same time as a wrong password. Built once at startup.
  private dummyHash = "";
  private readonly log = new Logger(AdminAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService
  ) {}

  async onModuleInit() {
    this.dummyHash = await hashPassword(newToken());
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
    const adminId = session.admin.id;
    // One transaction: claim the old token (only one concurrent caller can
    // flip revokedAt from null) and create its replacement, so a failure
    // never leaves the admin logged out without a new token.
    const refreshToken = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() }, // rotation: the old token is dead
      });
      if (count === 0) throw new UnauthorizedException();
      return this.createSession(tx, adminId);
    });
    return this.tokens(adminId, refreshToken);
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issue(adminId: string) {
    const refreshToken = await this.createSession(this.prisma, adminId);
    return this.tokens(adminId, refreshToken);
  }

  async forgotPassword(email: string) {
    const admin = await this.prisma.admin.findUnique({ where: { email } });
    if (admin?.status !== "ACTIVE") return;

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
      const row = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
      });
      if (!row?.adminId)
        throw new BadRequestException("Invalid or expired link");

      // updateMany + count === 1 makes "single use" race-safe: of two
      // simultaneous requests, only one can flip usedAt from null.
      const now = new Date();
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1)
        throw new BadRequestException("Invalid or expired link");

      await tx.admin.update({
        where: { id: row.adminId },
        data: { passwordHash },
      });
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

  private async createSession(
    db: Prisma.TransactionClient | PrismaService,
    adminId: string
  ) {
    const refreshToken = newToken();
    await db.session.create({
      data: {
        adminId,
        refreshTokenHash: hashToken(refreshToken),
        clientType: "ADMIN",
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return refreshToken;
  }

  private async tokens(adminId: string, refreshToken: string) {
    const accessToken = await this.jwt.signAsync({
      sub: adminId,
      role: "admin",
    });
    return { accessToken, refreshToken };
  }
}
