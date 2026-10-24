import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";

import type { AuthenticatedAdmin } from "@/admin/auth/admin-jwt.guard";
import { CurrentAdmin } from "@/admin/auth/current-admin.decorator";
import { AdminsService } from "@/admins/admins.service";
import { CreateAdminDto } from "@/admins/dto/create-admin.dto";
import { ListAdminsQueryDto } from "@/admins/dto/list-admins-query.dto";
import { UpdateAdminDto } from "@/admins/dto/update-admin.dto";

@Controller("admins")
@ApiBearerAuth()
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Post()
  create(@Body() dto: CreateAdminDto) {
    return this.admins.create(dto);
  }

  @Get()
  list(@Query() q: ListAdminsQueryDto) {
    return this.admins.list(q);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.admins.findOne(id);
  }

  @Patch(":id")
  update(
    @CurrentAdmin() admin: AuthenticatedAdmin | undefined,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminDto
  ) {
    return this.admins.update(admin?.id ?? "", id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentAdmin() admin: AuthenticatedAdmin | undefined,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.admins.remove(admin?.id ?? "", id);
  }
}
