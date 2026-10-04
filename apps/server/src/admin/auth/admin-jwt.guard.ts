import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

import { IS_PUBLIC_KEY } from "@/admin/auth/public.decorator";
import { PrismaService } from "@/prisma/prisma.service";

export type AuthenticatedAdmin = { id: string };
export type AdminRequest = Request & { admin?: AuthenticatedAdmin };

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    const [type, token] = req.headers.authorization?.split(" ") ?? [];
    if (type !== "Bearer" || !token) throw new UnauthorizedException();

    const payload = await this.jwt
      .verifyAsync<{ sub?: unknown; role?: unknown }>(token)
      .catch(() => null);
    if (payload?.role !== "admin" || typeof payload.sub !== "string") {
      throw new UnauthorizedException();
    }

    // DB check: a disabled or deleted admin is locked out now, not when the
    // access token expires.
    const admin = await this.prisma.admin.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true },
    });
    if (admin?.status !== "ACTIVE") throw new UnauthorizedException();

    req.admin = { id: admin.id };
    return true;
  }
}
