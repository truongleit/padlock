import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { CreateAdminDto } from "@/admins/dto/create-admin.dto";
import type { ListAdminsQueryDto } from "@/admins/dto/list-admins-query.dto";
import type { UpdateAdminDto } from "@/admins/dto/update-admin.dto";
import { hashPassword } from "@/common/password.util";
import { Prisma } from "@/generated/prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

// Explicit allowlist. Never return a full Admin row, or passwordHash leaks.
const SUMMARY = {
  id: true,
  email: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

@Injectable()
export class AdminsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAdminDto) {
    const passwordHash = await hashPassword(dto.password);

    return this.prisma.admin.create({
      data: { email: dto.email, passwordHash },
      select: SUMMARY,
    });
  }

  async list(q: ListAdminsQueryDto) {
    const where = {
      ...(q.status && { status: q.status }),
      ...(q.search && { email: { contains: q.search.toLowerCase() } }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.admin.findMany({
        where,
        select: SUMMARY,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.admin.count({ where }),
    ]);
    return { data, page: q.page, limit: q.limit, total };
  }

  async findOne(id: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id },
      select: SUMMARY,
    });
    if (!admin) throw new NotFoundException("Admin not found");
    return admin;
  }

  // Unique-email violations (P2002) are mapped to 409 by AllExceptionsFilter.
  update(id: string, dto: UpdateAdminDto) {
    if (dto.email === undefined && dto.status === undefined) {
      throw new BadRequestException("Nothing to update");
    }
    return this.prisma.$transaction(async (tx) => {
      const admin = await tx.admin.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!admin) throw new NotFoundException("Admin not found");
      if (admin.status === "ACTIVE" && dto.status === "DISABLED") {
        await this.assertNotLastActive(tx, id);
      }
      const updated = await tx.admin.update({
        where: { id },
        data: { email: dto.email, status: dto.status },
        select: SUMMARY,
      });
      if (dto.status === "DISABLED") {
        await tx.session.updateMany({
          where: { adminId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    });
  }

  async remove(id: string) {
    await this.prisma.$transaction(async (tx) => {
      const admin = await tx.admin.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!admin) throw new NotFoundException("Admin not found");
      if (admin.status === "ACTIVE") await this.assertNotLastActive(tx, id);
      await tx.admin.delete({ where: { id } });
    });
  }

  private async assertNotLastActive(tx: Prisma.TransactionClient, id: string) {
    const others = await tx.admin.count({
      where: { status: "ACTIVE", id: { not: id } },
    });
    if (others === 0)
      throw new ConflictException("Cannot remove the last active admin");
  }
}
