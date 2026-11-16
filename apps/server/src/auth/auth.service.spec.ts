import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "@/auth/auth.service";
import type { UserKeysDto } from "@/auth/dto/user-keys.dto";
import { hashPassword } from "@/common/password.util";
import { hashToken } from "@/common/token.util";
import { createPrismaMock, type PrismaMock } from "@/test/prisma-mock";

const AUTH_KEY = Buffer.from("client-derived-auth-key").toString("base64");
const b64 = (n: number) => Buffer.alloc(n, 1).toString("base64");
const KEYS: UserKeysDto = {
  authKey: AUTH_KEY,
  kdfSalt: b64(16),
  kdfParams: { alg: "PBKDF2-SHA256", iterations: 600_000 },
  wrappedVaultKeyMaster: b64(48),
  wrapIvMaster: b64(12),
  wrappedVaultKeyRecovery: b64(48),
  wrapIvRecovery: b64(12),
};
const TOKEN = "a".repeat(43);
let authHash: Uint8Array;

beforeAll(async () => {
  authHash = new Uint8Array(Buffer.from(await hashPassword(AUTH_KEY)));
});

describe("AuthService", () => {
  let prisma: PrismaMock;
  let mail: { sendUserResetCode: ReturnType<typeof vi.fn> };
  let svc: AuthService;

  const user = (status = "ACTIVE") => ({
    id: "u1",
    email: "u@x.test",
    status,
    authHash,
    kdfSalt: new Uint8Array(16),
    kdfParams: KEYS.kdfParams,
    wrappedVaultKeyMaster: new Uint8Array(48),
    wrapIvMaster: new Uint8Array(12),
    wrappedVaultKeyRecovery: new Uint8Array([1, 2, 3]),
    wrapIvRecovery: new Uint8Array([4, 5]),
  });
  const resetRow = (over: object = {}) => ({
    id: "t1",
    userId: "u1",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: user(),
    ...over,
  });

  beforeEach(async () => {
    prisma = createPrismaMock();
    const jwt = { signAsync: vi.fn().mockResolvedValue("access.jwt") };
    mail = { sendUserResetCode: vi.fn().mockResolvedValue(undefined) };
    const config = { getOrThrow: vi.fn().mockReturnValue("s".repeat(32)) };
    svc = new AuthService(
      prisma as never,
      jwt as unknown as JwtService,
      mail as never,
      config as unknown as ConfigService
    );
    await svc.onModuleInit();
  });

  describe("register", () => {
    it("stores an argon2 hash of the auth key, never the key itself", async () => {
      await svc.register({ email: "u@x.test", ...KEYS });
      const data = prisma.user.create.mock.calls[0]?.[0].data;
      const stored = Buffer.from(data.authHash).toString();
      expect(stored).not.toContain(AUTH_KEY);
      await expect(argon2.verify(stored, AUTH_KEY)).resolves.toBe(true);
    });
  });

  describe("prelogin", () => {
    it("returns a stable fake salt for an unknown email", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const a = await svc.prelogin("nobody@x.test");
      const b = await svc.prelogin("nobody@x.test");
      const c = await svc.prelogin("other@x.test");
      expect(a).toEqual(b);
      expect(a.kdfSalt).not.toBe(c.kdfSalt);
    });
  });

  describe("login", () => {
    it("rejects an unknown email, still spending a hash verify", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const verify = vi.spyOn(argon2, "verify");
      await expect(
        svc.login({ email: "no@x.test", authKey: AUTH_KEY, clientType: "WEB" })
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(verify).toHaveBeenCalledOnce();
      verify.mockRestore();
    });

    it("rejects a disabled user even with the right key", async () => {
      prisma.user.findUnique.mockResolvedValue(user("DISABLED"));
      await expect(
        svc.login({ email: "u@x.test", authKey: AUTH_KEY, clientType: "WEB" })
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("creates a session with the client type and returns the master wrap", async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      const res = await svc.login({
        email: "u@x.test",
        authKey: AUTH_KEY,
        clientType: "EXTENSION",
      });
      expect(prisma.session.create.mock.calls[0]?.[0].data).toMatchObject({
        userId: "u1",
        clientType: "EXTENSION",
      });
      expect(res).toMatchObject({
        accessToken: "access.jwt",
        wrapIvMaster: Buffer.alloc(12).toString("base64"),
      });
      expect(res.refreshToken).toBeTypeOf("string");
    });
  });

  describe("refresh", () => {
    it("rejects an admin session", async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: "s1",
        user: null,
        admin: { id: "a1" },
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(svc.refresh("tok")).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    });
  });

  describe("forgotPassword", () => {
    it("does nothing for an unknown email", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await svc.forgotPassword("no@x.test");
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendUserResetCode).not.toHaveBeenCalled();
    });

    it("emails a code whose hash is stored", async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      await svc.forgotPassword("u@x.test");
      const code = mail.sendUserResetCode.mock.calls[0]?.[1] as string;
      expect(
        prisma.passwordResetToken.create.mock.calls[0]?.[0].data.tokenHash
      ).toEqual(hashToken(code));
    });
  });

  describe("verifyReset", () => {
    it("returns the recovery wrap without using up the code", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRow());
      await expect(svc.verifyReset(TOKEN)).resolves.toEqual({
        wrappedVaultKeyRecovery: "AQID",
        wrapIvRecovery: "BAU=",
      });
      expect(prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
    });

    it("rejects a used code", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        resetRow({ usedAt: new Date() })
      );
      await expect(svc.verifyReset(TOKEN)).rejects.toBeInstanceOf(
        BadRequestException
      );
    });
  });

  describe("resetPassword / resetAccount", () => {
    it("rejects a code another request already claimed", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRow());
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.resetPassword(TOKEN, KEYS)).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("re-keys and revokes sessions but keeps the vault", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRow());
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      await svc.resetPassword(TOKEN, KEYS);
      expect(prisma.user.update).toHaveBeenCalledOnce();
      expect(prisma.session.updateMany).toHaveBeenCalledOnce();
      expect(prisma.vaultItem.deleteMany).not.toHaveBeenCalled();
    });

    it("reset-account also deletes every vault item", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRow());
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      await svc.resetAccount(TOKEN, KEYS);
      expect(prisma.vaultItem.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
      });
    });
  });
});
