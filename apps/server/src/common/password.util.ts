import argon2 from "argon2";

// Single source of truth for password hashing params. The login dummy hash
// must use the same params as real hashes, or timing reveals unknown emails.
const ARGON2_OPTIONS = { type: argon2.argon2id } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}
