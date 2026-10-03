import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  ADMIN_JWT_SECRET: z.string().min(32),
  ADMIN_WEB_ORIGIN: z.url(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof schema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return schema.parse(config);
}
