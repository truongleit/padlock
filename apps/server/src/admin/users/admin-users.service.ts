import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { ListUsersQueryDto } from "@/admin/users/dto/list-users-query.dto";
import { pageArgs, paginated } from "@/common/pagination.util";
import type { AuditAction } from "@/generated/prisma/enums";
import { PrismaService } from "@/prisma/prisma.service";

// NFR-SEC-5: explicit allowlist. Never findMany() without a select, or
// authHash and the wrapped keys would be loaded into memory (and one
// careless `return` away from the response).
const SUMMARY = {
  id: true,
  email: true,
  status: true,
  createdAt: true,
} as const;

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
        ...pageArgs(q),
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(data, q, total);
  }

  setStatus(adminId: string, userId: string, to: "ACTIVE" | "DISABLED") {
    const action: AuditAction = to === "DISABLED" ? "DISABLE" : "REACTIVATE";
    const from = to === "DISABLED" ? "ACTIVE" : "DISABLED";

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: userId, status: from },
        data: { status: to },
      });
      if (count === 0) {
        const exists = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        if (!exists) throw new NotFoundException("User not found");
        throw new ConflictException(`User is already ${to.toLowerCase()}`);
      }

      if (to === "DISABLED") {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.adminAuditLog.create({
        data: { adminId, targetUserId: userId, action },
      });
      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: SUMMARY,
      });
    });
  }

  async remove(adminId: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      // delete() throws P2025 for an unknown id; AllExceptionsFilter maps it to 404.
      await tx.user.delete({ where: { id: userId } }); // cascades vault, sessions, tokens
      await tx.adminAuditLog.create({
        data: { adminId, targetUserId: userId, action: "DELETE" },
      });
    });
  }
}
