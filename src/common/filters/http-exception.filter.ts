import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Single source of truth for error response shape. Ensures clients (including
 * Noura in the bonus design) always see the same `{ error, message, ... }`
 * envelope whether the failure was a DTO validation error, a 404, or an
 * unexpected runtime exception.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let payload: Record<string, unknown> = {
      error: 'InternalServerError',
      message: 'Unexpected error.',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        payload = { error: exception.name, message: res };
      } else if (typeof res === 'object' && res !== null) {
        payload = { error: exception.name, ...(res as Record<string, unknown>) };
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled: ${exception.message}`, exception.stack);
      payload = { error: 'InternalServerError', message: exception.message };
    }

    response.status(status).json({
      ...payload,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
