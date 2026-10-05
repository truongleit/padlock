import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";

import {
  AdminAuthService,
  REFRESH_TTL_MS,
} from "@/admin/auth/admin-auth.service";
import type { AuthenticatedAdmin } from "@/admin/auth/admin-jwt.guard";
import { CurrentAdmin } from "@/admin/auth/current-admin.decorator";
import { AdminLoginDto } from "@/admin/auth/dto/admin-login.dto";
import type { ForgotPasswordDto } from "@/admin/auth/dto/forgot-password.dto";
import type { ResetPasswordDto } from "@/admin/auth/dto/reset-password.dto";
import { Public } from "@/admin/auth/public.decorator";
import { ApiErrorResponses } from "@/common/errors/api-error-responses.decorator";

const COOKIE = "admin_refresh";
const COOKIE_PATH = "/admin/auth";

@Controller("admin/auth")
@ApiErrorResponses()
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly config: ConfigService
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("login")
  @HttpCode(200)
  async login(
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { accessToken, refreshToken } = await this.auth.login(
      dto.email,
      dto.password
    );
    this.setCookie(res, refreshToken);
    return { accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const { accessToken, refreshToken } = await this.auth.refresh(
      this.readCookie(req)
    );
    this.setCookie(res, refreshToken);
    return { accessToken };
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(this.readCookie(req));
    res.clearCookie(COOKIE, { path: COOKIE_PATH });
  }

  @Get("me")
  @ApiBearerAuth()
  me(@CurrentAdmin() admin: AuthenticatedAdmin | undefined) {
    return admin;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("forgot-password")
  @HttpCode(202)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return { message: "If that account exists, a link was sent." };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("reset-password")
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.newPassword);
  }

  private readCookie(req: Request): string | undefined {
    const value: unknown = req.cookies?.[COOKIE];
    return typeof value === "string" ? value : undefined;
  }

  private setCookie(res: Response, token: string) {
    res.cookie(COOKIE, token, {
      httpOnly: true,
      secure: this.config.get("NODE_ENV") === "production",
      sameSite: "strict",
      path: COOKIE_PATH,
      maxAge: REFRESH_TTL_MS,
    });
  }
}
