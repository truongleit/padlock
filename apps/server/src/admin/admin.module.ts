import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, type JwtSignOptions } from "@nestjs/jwt";

import { AdminAuthController } from "@/admin/auth/admin-auth.controller";
import { AdminAuthService } from "@/admin/auth/admin-auth.service";
import { AdminJwtGuard } from "@/admin/auth/admin-jwt.guard";

@Module({
  imports: [
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
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtGuard],
  exports: [JwtModule, AdminJwtGuard],
})
export class AdminModule {}
