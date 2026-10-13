import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  ADMIN_JWT_SECRET: z.string().min(32),
  ADMIN_JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+(ms|s|m|h|d)$/)
    .default("1h"),
  ADMIN_WEB_ORIGIN: z.url(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default("development"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Padlock <no-reply@padlock.local>"),
});

export type Env = z.infer<typeof schema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return schema.parse(config);
}
