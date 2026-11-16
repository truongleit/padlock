import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, type JwtSignOptions } from "@nestjs/jwt";

import { AuthController } from "@/auth/auth.controller";
import { AuthService } from "@/auth/auth.service";
import { UserJwtGuard } from "@/auth/user-jwt.guard";
import { MailModule } from "@/mail/mail.module";

@Module({
  imports: [
    // Same secret as admin; tokens carry role "user", which AdminJwtGuard rejects.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("ADMIN_JWT_SECRET"),
        signOptions: {
          expiresIn: config.getOrThrow<string>(
            "ADMIN_JWT_EXPIRES_IN"
          ) as JwtSignOptions["expiresIn"],
        },
      }),
    }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, UserJwtGuard],
  exports: [JwtModule, UserJwtGuard],
})
export class AuthModule {}
