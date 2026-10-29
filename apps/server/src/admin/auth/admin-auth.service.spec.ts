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
