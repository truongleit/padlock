import { HttpStatus } from "@nestjs/common";
import type { ValidationError } from "class-validator";

import { AppException } from "@/common/errors/app-exception";
import { ErrorCode } from "@/common/errors/error-codes";
import type { ErrorDetailDto } from "@/common/errors/error-response.dto";

function flatten(errors: ValidationError[], parent = ""): ErrorDetailDto[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints
      ? [{ field, messages: Object.values(e.constraints) }]
      : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

export function validationExceptionFactory(errors: ValidationError[]) {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.ValidationFailed,
    "Validation failed",
    flatten(errors)
  );
}
