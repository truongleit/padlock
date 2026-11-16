import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import argon2 from "argon2";

import { fromB64 } from "@/common/bytes.util";
import { hashPassword } from "@/common/password.util";
import type { Prisma } from "@/generated/prisma/client";
import type { ChangeMasterPasswordDto } from "@/me/dto/change-master-password.dto";
import type { UpdateSettingsDto } from "@/me/dto/update-settings.dto";
import { PrismaService } from "@/prisma/prisma.service";

const SETTINGS = {
  autoLockMinutes: true,
  clipboardClearSeconds: true,
  generatorDefaults: true,
  updatedAt: true,
} as const;

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  profile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, status: true, createdAt: true },
    });
  }

  /** FR-11.2. Logs out every session, including this one: the client logs in again with the new password. */
  async changeMasterPassword(userId: string, dto: ChangeMasterPasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { authHash: true },
    });
    const ok = await argon2
      .verify(Buffer.from(user.authHash).toString(), dto.currentAuthKey)
      .catch(() => false);
    // 403, not 401: the access token is fine, so the client must not try to refresh.
    if (!ok) throw new ForbiddenException("Current master password is wrong");

    const authHash = new Uint8Array(
      Buffer.from(await hashPassword(dto.authKey))
    );
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          authHash,
          kdfSalt: fromB64(dto.kdfSalt),
          kdfParams: dto.kdfParams as Prisma.InputJsonObject,
          wrappedVaultKeyMaster: fromB64(dto.wrappedVaultKeyMaster),
          wrapIvMaster: fromB64(dto.wrapIvMaster),
        },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  sessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, clientType: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeSession(userId: string, id: string) {
    const { count } = await this.prisma.session.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException("Session not found");
  }

  settings(userId: string) {
    return this.prisma.userSettings.findUniqueOrThrow({
      where: { userId },
      select: SETTINGS,
    });
  }

  updateSettings(userId: string, dto: UpdateSettingsDto) {
    return this.prisma.userSettings.update({
      where: { userId },
      data: {
        ...dto,
        generatorDefaults: dto.generatorDefaults && {
          ...dto.generatorDefaults,
        },
      },
      select: SETTINGS,
    });
  }
}
