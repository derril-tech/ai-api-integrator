import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

export interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
  details?: any;
  requestId?: string;
  userId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.buildErrorResponse(exception, request);

    // Log the error
    this.logError(exception, request, errorResponse);

    // Send response
    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private buildErrorResponse(exception: unknown, request: Request): ErrorResponse {
    const timestamp = new Date().toISOString();
    const path = request.url;
    const method = request.method;
    const requestId = request.headers['x-request-id'] as string;
    const userId = (request as any).user?.id;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let details: any;

    if (exception instanceof HttpException) {
      // Handle NestJS HTTP exceptions
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || exception.message;
        error = (exceptionResponse as any).error || exception.name;
        details = (exceptionResponse as any).details;
      }
    } else if (exception instanceof QueryFailedError) {
      // Handle TypeORM database errors
      statusCode = HttpStatus.BAD_REQUEST;
      message = 'Database operation failed';
      error = 'Database Error';
      
      // Parse common database errors
      if (exception.message.includes('duplicate key')) {
        message = 'Resource already exists';
        statusCode = HttpStatus.CONFLICT;
      } else if (exception.message.includes('foreign key')) {
        message = 'Referenced resource not found';
        statusCode = HttpStatus.BAD_REQUEST;
      } else if (exception.message.includes('not null')) {
        message = 'Required field is missing';
        statusCode = HttpStatus.BAD_REQUEST;
      }

      // Include query details in development
      if (process.env.NODE_ENV === 'development') {
        details = {
          query: exception.query,
          parameters: exception.parameters,
        };
      }
    } else if (exception instanceof Error) {
      // Handle generic errors
      message = exception.message;
      error = exception.name;

      // Check for specific error types
      if (exception.name === 'ValidationError') {
        statusCode = HttpStatus.BAD_REQUEST;
        error = 'Validation Error';
      } else if (exception.name === 'UnauthorizedError') {
        statusCode = HttpStatus.UNAUTHORIZED;
        error = 'Unauthorized';
      } else if (exception.name === 'ForbiddenError') {
        statusCode = HttpStatus.FORBIDDEN;
        error = 'Forbidden';
      } else if (exception.name === 'NotFoundError') {
        statusCode = HttpStatus.NOT_FOUND;
        error = 'Not Found';
      } else if (exception.name === 'TimeoutError') {
        statusCode = HttpStatus.REQUEST_TIMEOUT;
        error = 'Request Timeout';
      }
    }

    // Sanitize error message for production
    if (process.env.NODE_ENV === 'production' && statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
      message = 'An unexpected error occurred';
      details = undefined;
    }

    return {
      statusCode,
      timestamp,
      path,
      method,
      message,
      error,
      details,
      requestId,
      userId,
    };
  }

  private logError(exception: unknown, request: Request, errorResponse: ErrorResponse) {
    const { statusCode, message, error, requestId, userId } = errorResponse;
    
    const logContext = {
      statusCode,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      requestId,
      userId,
    };

    if (statusCode >= 500) {
      // Server errors - log as error with full stack trace
      this.logger.error(
        `${error}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
        logContext,
      );
    } else if (statusCode >= 400) {
      // Client errors - log as warning
      this.logger.warn(`${error}: ${message}`, logContext);
    } else {
      // Other errors - log as debug
      this.logger.debug(`${error}: ${message}`, logContext);
    }
  }
}
