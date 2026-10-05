import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type {
  AdminRequest,
  AuthenticatedAdmin,
} from "@/admin/auth/admin-jwt.guard";

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin | undefined =>
    ctx.switchToHttp().getRequest<AdminRequest>().admin
);
