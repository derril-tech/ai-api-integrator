import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    
    const { method, url, headers, body, query, params } = request;
    const userAgent = headers['user-agent'] || '';
    const ip = request.ip;
    const userId = (request as any).user?.id;
    const requestId = headers['x-request-id'] as string;
    
    const startTime = Date.now();

    // Log incoming request
    this.logger.log(`Incoming Request: ${method} ${url}`, {
      method,
      url,
      userAgent,
      ip,
      userId,
      requestId,
      query: Object.keys(query).length > 0 ? query : undefined,
      params: Object.keys(params).length > 0 ? params : undefined,
      bodySize: body ? JSON.stringify(body).length : 0,
    });

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startTime;
        const { statusCode } = response;
        
        // Log successful response
        this.logger.log(`Outgoing Response: ${method} ${url} - ${statusCode}`, {
          method,
          url,
          statusCode,
          duration,
          userId,
          requestId,
          responseSize: data ? JSON.stringify(data).length : 0,
        });
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        
        // Log error response
        this.logger.error(`Request Failed: ${method} ${url}`, {
          method,
          url,
          duration,
          userId,
          requestId,
          error: error.message,
        });
        
        throw error;
      }),
    );
  }
}
