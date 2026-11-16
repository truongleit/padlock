import { z } from "zod";

import { MIN_MASTER_LENGTH } from "@/lib/strength";

// Form schemas (react-hook-form + zodResolver). Emails are normalized here, as the server does.

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

export const masterPassword = z.string().min(1, "Enter your master password.");

/** Fields rendered by NewMasterFields; refine every schema that spreads it with `matchConfirm`. */
export const newMaster = {
  master: z
    .string()
    .min(MIN_MASTER_LENGTH, `Use at least ${MIN_MASTER_LENGTH} characters.`),
  confirm: z.string(),
};

export const matchConfirm: [
  (d: { master: string; confirm: string }) => boolean,
  { path: string[]; message: string },
] = [
  (d) => d.master === d.confirm,
  { path: ["confirm"], message: "Passwords don't match." },
];

export const loginSchema = z.object({ email, master: masterPassword });

export const unlockSchema = z.object({ master: masterPassword });

export const signupSchema = z
  .object({
    email,
    ...newMaster,
    ack: z.boolean().refine(Boolean, "Confirm that you understand."),
  })
  .refine(...matchConfirm);

export const changeMasterSchema = z
  .object({ current: masterPassword, ...newMaster })
  .refine(...matchConfirm);

export const resetPasswordSchema = z
  .object({
    recoveryKey: z.string().trim().min(1, "Enter your recovery key."),
    ...newMaster,
  })
  .refine(...matchConfirm);
