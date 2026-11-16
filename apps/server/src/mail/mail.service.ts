export abstract class MailService {
  abstract sendPasswordReset(to: string, link: string): Promise<void>;
  // End users reset in the extension, which an email link can't open, so they get a code to paste.
  abstract sendUserResetCode(to: string, code: string): Promise<void>;
}
