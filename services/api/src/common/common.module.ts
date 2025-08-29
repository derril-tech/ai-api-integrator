import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

// Services
import { HttpClientService } from './services/http-client.service';
import { ApiClientService } from './services/api-client.service';

// Validators
import { ApiSpecValidator } from './validators/api-spec.validator';

// Filters
import { GlobalExceptionFilter } from './filters/global-exception.filter';

// Interceptors
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { TransformInterceptor } from './interceptors/transform.interceptor';

// Middleware
import { RequestIdMiddleware } from './middleware/request-id.middleware';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    // Services
    HttpClientService,
    ApiClientService,
    ApiSpecValidator,
    
    // Global providers
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
  exports: [
    HttpClientService,
    ApiClientService,
    ApiSpecValidator,
  ],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
