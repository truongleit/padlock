import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";

import type { AuthenticatedAdmin } from "@/admin/auth/admin-jwt.guard";
import { CurrentAdmin } from "@/admin/auth/current-admin.decorator";
import { AdminUsersService } from "@/admin/users/admin-users.service";
import { ListUsersQueryDto } from "@/admin/users/dto/list-users-query.dto";
import { ApiErrorResponses } from "@/common/errors/api-error-responses.decorator";

@Controller("admin/users")
@ApiBearerAuth()
@ApiErrorResponses()
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@Query() q: ListUsersQueryDto) {
    return this.users.list(q);
  }

  @Patch(":id/disable")
  disable(
    @CurrentAdmin() admin: AuthenticatedAdmin | undefined,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.users.setStatus(admin?.id ?? "", id, "DISABLED");
  }

  @Patch(":id/reactivate")
  reactivate(
    @CurrentAdmin() admin: AuthenticatedAdmin | undefined,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.users.setStatus(admin?.id ?? "", id, "ACTIVE");
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentAdmin() admin: AuthenticatedAdmin | undefined,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.users.remove(admin?.id ?? "", id);
  }
}
