import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";

import type { Env } from "@/config/env";
import { MailService } from "@/mail/mail.service";

@Injectable()
export class SmtpMailService extends MailService {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    const port = config.get("SMTP_PORT", { infer: true });
    const user = config.get("SMTP_USER", { infer: true });
    const pass = config.get("SMTP_PASS", { infer: true });
    this.from = config.get("MAIL_FROM", { infer: true });
    this.transport = createTransport({
      host: config.get("SMTP_HOST", { infer: true }),
      port,
      secure: port === 465, // 465 = TLS from the start; 587/1025 upgrade with STARTTLS if offered
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async sendPasswordReset(to: string, link: string) {
    await this.transport.sendMail({
      from: this.from,
      to,
      subject: "Reset your Padlock admin password",
      text: `Use this link within 30 minutes to reset your password:\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
    });
  }
}
