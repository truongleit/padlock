import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "@/config/env";
import { ConsoleMailService } from "@/mail/console-mail.service";
import { MailService } from "@/mail/mail.service";
import { SmtpMailService } from "@/mail/smtp-mail.service";

@Module({
  providers: [
    {
      provide: MailService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get("SMTP_HOST")
          ? new SmtpMailService(config)
          : new ConsoleMailService(),
    },
  ],
  exports: [MailService],
})
export class MailModule {}
