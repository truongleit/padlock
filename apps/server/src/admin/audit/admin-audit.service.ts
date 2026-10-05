import { Injectable } from "@nestjs/common";

import type { ListAuditQueryDto } from "@/admin/audit/dto/list-audit-query.dto";
import { pageArgs, paginated } from "@/common/pagination.util";
import { PrismaService } from "@/prisma/prisma.service";

// Explicit select: the response shape is an allowlist, so new columns are not exposed by accident.
const SUMMARY = {
  id: true,
  adminId: true,
  targetUserId: true,
  action: true,
  createdAt: true,
} as const;

@Injectable()
export class AdminAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListAuditQueryDto) {
    const where = {
      ...(q.action && { action: q.action }),
      ...(q.adminId && { adminId: q.adminId }),
      ...(q.targetUserId && { targetUserId: q.targetUserId }),
      ...((q.from || q.to) && { createdAt: { gte: q.from, lte: q.to } }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.findMany({
        where,
        select: SUMMARY,
        orderBy: { createdAt: "desc" },
        ...pageArgs(q),
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
    return paginated(data, q, total);
  }
}
