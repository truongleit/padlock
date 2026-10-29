import { describe, expect, it } from "vitest";

import { hashToken, newToken } from "@/common/token.util";

describe("token.util", () => {
  it("newToken is unique and url-safe", () => {
    const a = newToken();
    expect(a).not.toBe(newToken());
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashToken is deterministic, 32 bytes, and differs per input", () => {
    expect(hashToken("x")).toEqual(hashToken("x"));
    expect(hashToken("x")).not.toEqual(hashToken("y"));
    expect(hashToken("x")).toHaveLength(32);
  });
});
