import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";

/**
 * Ensures every error response has a consistent { success: false, error: {...} } shape and
 * that unexpected (non-HttpException) errors never leak a stack trace to the client.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const normalized =
        typeof body === "object" && body !== null
          ? body
          : { code: "ERROR", message: String(body) };

      response.status(status).json({ success: false, error: normalized });
      return;
    }

    // Known database rules, reported in plain words instead of a generic failure.
    const db = exception as { code?: string; meta?: { target?: string[] | string } };
    if (db?.code === "P2002") {
      const target = [db.meta?.target ?? []].flat().join(",");
      const message = target.includes("name")
        ? "Something with this name already exists. If you cannot see it in the list, it may be inactive or filtered out."
        : "This value is already in use. Please choose a different one.";
      response.status(HttpStatus.CONFLICT).json({ success: false, error: { code: "ALREADY_EXISTS", message } });
      return;
    }
    if (db?.code === "P2003") {
      response.status(HttpStatus.CONFLICT).json({
        success: false,
        error: { code: "IN_USE", message: "This is still used by other records. Remove or move them first." },
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
    });
  }
}
