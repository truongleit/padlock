import type { ValidationError } from "class-validator";
import { describe, expect, it } from "vitest";

import { ErrorCode } from "@/common/errors/error-codes";
import { validationExceptionFactory } from "@/common/errors/validation";

describe("validationExceptionFactory", () => {
  it("returns a 400 with per-field details, including nested paths", () => {
    const errors = [
      { property: "email", constraints: { isEmail: "bad email" } },
      {
        property: "profile",
        children: [{ property: "name", constraints: { isString: "not str" } }],
      },
    ] as ValidationError[];

    const e = validationExceptionFactory(errors);

    expect(e.getStatus()).toBe(400);
    expect(e.code).toBe(ErrorCode.ValidationFailed);
    expect(e.details).toEqual([
      { field: "email", messages: ["bad email"] },
      { field: "profile.name", messages: ["not str"] },
    ]);
  });
});
