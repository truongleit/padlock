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
