import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";

import { REFRESH_TTL_MS } from "@/admin/auth/admin-auth.service";
import { ForgotPasswordDto } from "@/admin/auth/dto/forgot-password.dto";
import { Public } from "@/admin/auth/public.decorator";
import { AuthService } from "@/auth/auth.service";
import { LoginDto } from "@/auth/dto/login.dto";
import { PreloginDto } from "@/auth/dto/prelogin.dto";
import { RegisterDto } from "@/auth/dto/register.dto";
import { ResetAccountDto } from "@/auth/dto/reset-account.dto";
import { ResetPasswordDto } from "@/auth/dto/reset-password.dto";
import { ResetTokenDto } from "@/auth/dto/reset-token.dto";
import { ApiErrorResponses } from "@/common/errors/api-error-responses.decorator";

const COOKIE = "refresh";
const COOKIE_PATH = "/auth";
const STRICT = { default: { limit: 5, ttl: 60_000 } };

// End-user auth. Every route is public to the global AdminJwtGuard.
@Controller("auth")
@Public()
@ApiErrorResponses()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService
  ) {}

  @Throttle(STRICT)
  @Post("register")
  async register(@Body() dto: RegisterDto) {
    await this.auth.register(dto);
  }

  @Throttle(STRICT)
  @Post("prelogin")
  @HttpCode(200)
  prelogin(@Body() dto: PreloginDto) {
    return this.auth.prelogin(dto.email);
  }

  @Throttle(STRICT)
  @Post("login")
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { refreshToken, ...body } = await this.auth.login(dto);
    this.setCookie(res, refreshToken);
    return body;
  }

  @Throttle(STRICT)
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

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(this.readCookie(req));
    res.clearCookie(COOKIE, this.cookieOptions());
  }

  @Throttle(STRICT)
  @Post("forgot-password")
  @HttpCode(202)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return { message: "If that account exists, a code was sent." };
  }

  @Throttle(STRICT)
  @Post("reset-password/verify")
  @HttpCode(200)
  verifyReset(@Body() dto: ResetTokenDto) {
    return this.auth.verifyReset(dto.token);
  }

  @Throttle(STRICT)
  @Post("reset-password")
  @HttpCode(204)
  async resetPassword(@Body() { token, ...keys }: ResetPasswordDto) {
    await this.auth.resetPassword(token, keys);
  }

  @Throttle(STRICT)
  @Post("reset-account")
  @HttpCode(204)
  async resetAccount(@Body() { token, confirm: _, ...keys }: ResetAccountDto) {
    await this.auth.resetAccount(token, keys);
  }

  private readCookie(req: Request): string | undefined {
    const value: unknown = req.cookies?.[COOKIE];
    return typeof value === "string" ? value : undefined;
  }

  private setCookie(res: Response, token: string) {
    res.cookie(COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: REFRESH_TTL_MS,
    });
  }

  private cookieOptions() {
    const crossSite = this.config.get<boolean>("ADMIN_COOKIE_CROSS_SITE");
    return {
      httpOnly: true,
      // SameSite=None is rejected by browsers unless Secure.
      secure: crossSite || this.config.get("NODE_ENV") === "production",
      sameSite: crossSite ? ("none" as const) : ("strict" as const),
      path: COOKIE_PATH,
    };
  }
}
