import { Transform } from "class-transformer";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Emails are stored and looked up lowercase; use on every email DTO field.
export const NormalizeEmail = () =>
  Transform(({ value }) =>
    typeof value === "string" ? normalizeEmail(value) : value
  );
