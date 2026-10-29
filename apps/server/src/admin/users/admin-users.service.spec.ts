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
