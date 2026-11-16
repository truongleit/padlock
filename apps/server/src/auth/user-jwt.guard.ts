import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

import { PrismaService } from "@/prisma/prisma.service";

export type AuthenticatedUser = { id: string; email: string };
export type UserRequest = Request & { user?: AuthenticatedUser };

/** Bearer user JWT (`role: "user"`) whose user is still ACTIVE. Applied with `@UserAuth()`. */
@Injectable()
export class UserJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<UserRequest>();
    const [type, token] = req.headers.authorization?.split(" ") ?? [];
    if (type !== "Bearer" || !token) throw new UnauthorizedException();

    const payload = await this.jwt
      .verifyAsync<{ sub?: unknown; role?: unknown }>(token)
      .catch(() => null);
    if (payload?.role !== "user" || typeof payload.sub !== "string") {
      throw new UnauthorizedException();
    }

    // DB check: a disabled or deleted user is locked out now, not when the token expires.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, status: true },
    });
    if (user?.status !== "ACTIVE") throw new UnauthorizedException();

    req.user = { id: user.id, email: user.email };
    return true;
  }
}
