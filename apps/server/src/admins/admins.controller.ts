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

import { AdminsService } from "@/admins/admins.service";
import { CreateAdminDto } from "@/admins/dto/create-admin.dto";
import { ListAdminsQueryDto } from "@/admins/dto/list-admins-query.dto";
import type { UpdateAdminDto } from "@/admins/dto/update-admin.dto";

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
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAdminDto) {
    return this.admins.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.admins.remove(id);
  }
}
