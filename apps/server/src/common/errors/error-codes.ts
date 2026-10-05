import { HttpStatus } from "@nestjs/common";

export const ErrorCode = {
  BadRequest: "BAD_REQUEST",
  ValidationFailed: "VALIDATION_FAILED",
  Unauthorized: "UNAUTHORIZED",
  Forbidden: "FORBIDDEN",
  NotFound: "NOT_FOUND",
  Conflict: "CONFLICT",
  EmailTaken: "EMAIL_TAKEN",
  Internal: "INTERNAL_ERROR",
  TooManyRequests: "TOO_MANY_REQUESTS",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export function defaultCodeForStatus(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.BadRequest;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.Unauthorized;
    case HttpStatus.FORBIDDEN:
      return ErrorCode.Forbidden;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NotFound;
    case HttpStatus.CONFLICT:
      return ErrorCode.Conflict;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCode.TooManyRequests;
    default:
      return ErrorCode.Internal;
  }
}
