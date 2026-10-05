export abstract class MailService {
  abstract sendPasswordReset(to: string, link: string): Promise<void>;
}
