import { Injectable, Logger } from "@nestjs/common";

import { MailService } from "@/mail/mail.service";

@Injectable()
export class ConsoleMailService extends MailService {
  private readonly log = new Logger("Mail");

  sendPasswordReset(to: string, link: string) {
    this.log.log(`Reset link for ${to}: ${link}`);
    return Promise.resolve();
  }
}
