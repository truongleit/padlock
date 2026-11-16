import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser, UserAuth } from "@/auth/user-auth.decorator";
import type { AuthenticatedUser } from "@/auth/user-jwt.guard";
import { ApiErrorResponses } from "@/common/errors/api-error-responses.decorator";
import { VaultItemInputDto } from "@/vault/dto/vault-item-input.dto";
import { VaultService } from "@/vault/vault.service";

@Controller("vault/items")
@UserAuth()
@ApiErrorResponses()
// Above the 60/min default: the first sync uploads a whole local vault one item at a time.
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.vault.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VaultItemInputDto
  ) {
    return this.vault.create(user.id, dto);
  }

  @Put(":id")
  replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: VaultItemInputDto
  ) {
    return this.vault.replace(user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    await this.vault.remove(user.id, id);
  }
}
