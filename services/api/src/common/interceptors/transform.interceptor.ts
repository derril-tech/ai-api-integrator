import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
  path: string;
  method: string;
  requestId?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  meta?: Record<string, any>;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    
    const { method, url } = request;
    const requestId = request.headers['x-request-id'] as string;
    const timestamp = new Date().toISOString();

    return next.handle().pipe(
      map((data) => {
        // Handle different response types
        if (this.isAlreadyFormatted(data)) {
          return data;
        }

        // Handle paginated responses
        if (this.isPaginatedResponse(data)) {
          return {
            success: true,
            data: data.items,
            timestamp,
            path: url,
            method,
            requestId,
            pagination: {
              page: data.page,
              limit: data.limit,
              total: data.total,
              totalPages: Math.ceil(data.total / data.limit),
              hasNext: data.page * data.limit < data.total,
              hasPrev: data.page > 1,
            },
            meta: data.meta,
          };
        }

        // Handle standard responses
        return {
          success: true,
          data,
          timestamp,
          path: url,
          method,
          requestId,
        };
      }),
    );
  }

  private isAlreadyFormatted(data: any): boolean {
    return data && typeof data === 'object' && 'success' in data && 'timestamp' in data;
  }

  private isPaginatedResponse(data: any): boolean {
    return (
      data &&
      typeof data === 'object' &&
      'items' in data &&
      'page' in data &&
      'limit' in data &&
      'total' in data
    );
  }
}
