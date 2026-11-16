import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";

import { Public } from "@/admin/auth/public.decorator";
import {
  type AuthenticatedUser,
  UserJwtGuard,
  type UserRequest,
} from "@/auth/user-jwt.guard";

/** End-user route: skips the global admin guard and requires a user JWT instead. */
export const UserAuth = () =>
  applyDecorators(Public(), UseGuards(UserJwtGuard), ApiBearerAuth());

/** The user set by UserJwtGuard. Only use on `@UserAuth()` routes. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const user = ctx.switchToHttp().getRequest<UserRequest>().user;
    if (!user) throw new Error("CurrentUser used without @UserAuth()");
    return user;
  }
);
