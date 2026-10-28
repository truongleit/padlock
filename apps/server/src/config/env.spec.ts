import { describe, expect, it } from "vitest";

import { validateEnv } from "@/config/env";

const base = {
  DATABASE_URL: "postgresql://padlock:padlock@localhost:5432/padlock",
  ADMIN_JWT_SECRET: "x".repeat(32),
  ADMIN_WEB_ORIGIN: "http://localhost:5173",
};

describe("validateEnv", () => {
  it("applies defaults", () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.ADMIN_JWT_EXPIRES_IN).toBe("1h");
    expect(env.ADMIN_EXTRA_ORIGINS).toEqual([]);
    expect(env.ADMIN_COOKIE_CROSS_SITE).toBe(false);
    expect(env.SMTP_HOST).toBeUndefined();
  });

  it("rejects missing required vars and a short JWT secret", () => {
    expect(() => validateEnv({})).toThrow();
    expect(() => validateEnv({ ...base, ADMIN_JWT_SECRET: "short" })).toThrow();
  });

  it("parses extra origins and the cross-site flag", () => {
    const env = validateEnv({
      ...base,
      ADMIN_EXTRA_ORIGINS: " http://a.test , http://b.test ,",
      ADMIN_COOKIE_CROSS_SITE: "true",
    });
    expect(env.ADMIN_EXTRA_ORIGINS).toEqual(["http://a.test", "http://b.test"]);
    expect(env.ADMIN_COOKIE_CROSS_SITE).toBe(true);
  });

  it("rejects bad token lifetime and non-URL origins", () => {
    expect(() =>
      validateEnv({ ...base, ADMIN_JWT_EXPIRES_IN: "soon" })
    ).toThrow();
    expect(() =>
      validateEnv({ ...base, ADMIN_EXTRA_ORIGINS: "not-a-url" })
    ).toThrow();
  });
});
