import { HttpException } from "@nestjs/common";

import type { ErrorCode } from "@/common/errors/error-codes";
import type { ErrorDetailDto } from "@/common/errors/error-response.dto";

export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetailDto[]
  ) {
    super(message, status);
  }
}
