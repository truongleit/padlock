import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";

import { AppException } from "@/common/errors/app-exception";
import { defaultCodeForStatus, ErrorCode } from "@/common/errors/error-codes";
import type {
  ErrorDetailDto,
  ErrorResponseDto,
} from "@/common/errors/error-response.dto";
import { Prisma } from "@/generated/prisma/client";

interface Normalized {
  status: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetailDto[];
}

function fromPrisma(
  e: Prisma.PrismaClientKnownRequestError
): Normalized | null {
  switch (e.code) {
    case "P2002": {
      // Which constraint tripped. Never echo the offending value.
      const emailTaken = JSON.stringify(e.meta ?? {}).includes("email");
      return emailTaken
        ? {
            status: HttpStatus.CONFLICT,
            code: ErrorCode.EmailTaken,
            message: "Email already in use",
          }
        : {
            status: HttpStatus.CONFLICT,
            code: ErrorCode.Conflict,
            message: "Resource already exists",
          };
    }
    case "P2025":
      return {
        status: HttpStatus.NOT_FOUND,
        code: ErrorCode.NotFound,
        message: "Resource not found",
      };
    case "P2003":
      return {
        status: HttpStatus.CONFLICT,
        code: ErrorCode.Conflict,
        message: "Resource is referenced by another record",
      };
    default:
      return null;
  }
}

function fromHttp(e: HttpException): Normalized {
  const status = e.getStatus();
  if (e instanceof AppException) {
    return {
      status,
      code: e.code,
      message: e.message,
      ...(e.details && { details: e.details }),
    };
  }
  const body = e.getResponse();
  const raw =
    typeof body === "object" && body !== null && "message" in body
      ? body.message
      : e.message;
  return {
    status,
    code: defaultCodeForStatus(status),
    message: Array.isArray(raw) ? raw.join("; ") : String(raw),
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const req = ctx.getRequest();

    const normalized =
      (exception instanceof Prisma.PrismaClientKnownRequestError
        ? fromPrisma(exception)
        : null) ??
      (exception instanceof HttpException ? fromHttp(exception) : null);

    if (!normalized) {
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined
      );
    }

    const { status, code, message, details } = normalized ?? {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.Internal,
      message: "Internal server error",
    };

    const body: ErrorResponseDto = {
      statusCode: status,
      code,
      message,
      ...(details && { details }),
      path: httpAdapter.getRequestUrl(req),
      timestamp: new Date().toISOString(),
    };
    httpAdapter.reply(ctx.getResponse(), body, status);
  }
}
