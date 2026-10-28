import type { ArgumentsHost } from "@nestjs/common";
import {
  BadRequestException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import type { HttpAdapterHost } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AllExceptionsFilter } from "@/common/errors/all-exceptions.filter";
import { AppException } from "@/common/errors/app-exception";
import { ErrorCode } from "@/common/errors/error-codes";
import { Prisma } from "@/generated/prisma/client";

describe("AllExceptionsFilter", () => {
  const reply = vi.fn();
  let filter: AllExceptionsFilter;

  const run = (e: unknown) => {
    filter.catch(e, {
      switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
    } as unknown as ArgumentsHost);
    const [, body, status] = reply.mock.calls.at(-1) ?? [];
    return { body, status };
  };

  const prismaErr = (code: string, meta?: Record<string, unknown>) =>
    new Prisma.PrismaClientKnownRequestError("boom", {
      code,
      clientVersion: "test",
      meta,
    });

  beforeEach(() => {
    reply.mockClear();
    filter = new AllExceptionsFilter({
      httpAdapter: { reply, getRequestUrl: () => "/x" },
    } as unknown as HttpAdapterHost);
  });

  it("maps P2002 on email to 409 EMAIL_TAKEN without echoing the value", () => {
    const { body, status } = run(
      prismaErr("P2002", { target: ["email"], value: "secret@x.test" })
    );
    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body.code).toBe(ErrorCode.EmailTaken);
    expect(JSON.stringify(body)).not.toContain("secret@x.test");
  });

  it("maps other P2002 to 409 CONFLICT", () => {
    const { body, status } = run(prismaErr("P2002", { target: ["name"] }));
    expect(status).toBe(409);
    expect(body.code).toBe(ErrorCode.Conflict);
  });

  it.each([
    ["P2025", 404, ErrorCode.NotFound],
    ["P2003", 409, ErrorCode.Conflict],
  ])("maps %s", (code, expectedStatus, expectedCode) => {
    const { body, status } = run(prismaErr(code));
    expect(status).toBe(expectedStatus);
    expect(body.code).toBe(expectedCode);
  });

  it("keeps AppException code and details", () => {
    const details = [{ field: "email", messages: ["bad"] }];
    const { body, status } = run(
      new AppException(
        400,
        ErrorCode.ValidationFailed,
        "Validation failed",
        details
      )
    );
    expect(status).toBe(400);
    expect(body).toMatchObject({
      statusCode: 400,
      code: ErrorCode.ValidationFailed,
      message: "Validation failed",
      details,
      path: "/x",
    });
    expect(typeof body.timestamp).toBe("string");
  });

  it("gives plain Nest exceptions a default code", () => {
    expect(run(new NotFoundException("nope")).body.code).toBe(
      ErrorCode.NotFound
    );
    expect(run(new BadRequestException(["a", "b"])).body.message).toBe("a; b");
  });

  it("hides unknown errors behind a generic 500", () => {
    const { body, status } = run(new Error("db password leaked"));
    expect(status).toBe(500);
    expect(body.code).toBe(ErrorCode.Internal);
    expect(JSON.stringify(body)).not.toContain("leaked");
  });

  it("treats an unmapped Prisma code as a 500", () => {
    expect(run(prismaErr("P9999")).status).toBe(500);
  });
});
