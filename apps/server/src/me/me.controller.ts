import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
} from "@nestjs/common";

import { CurrentUser, UserAuth } from "@/auth/user-auth.decorator";
import type { AuthenticatedUser } from "@/auth/user-jwt.guard";
import { ApiErrorResponses } from "@/common/errors/api-error-responses.decorator";
import { ChangeMasterPasswordDto } from "@/me/dto/change-master-password.dto";
import { UpdateSettingsDto } from "@/me/dto/update-settings.dto";
import { MeService } from "@/me/me.service";

@Controller("me")
@UserAuth()
@ApiErrorResponses()
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.me.profile(user.id);
  }

  @Patch("master-password")
  @HttpCode(204)
  async changeMasterPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeMasterPasswordDto
  ) {
    await this.me.changeMasterPassword(user.id, dto);
  }

  @Get("sessions")
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.me.sessions(user.id);
  }

  @Delete("sessions/:id")
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    await this.me.revokeSession(user.id, id);
  }

  @Get("settings")
  settings(@CurrentUser() user: AuthenticatedUser) {
    return this.me.settings(user.id);
  }

  @Patch("settings")
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSettingsDto
  ) {
    return this.me.updateSettings(user.id, dto);
  }
}
