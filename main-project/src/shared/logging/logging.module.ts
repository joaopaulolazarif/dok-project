import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppLogger } from './app-logger.service';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { TraceIdMiddleware } from './trace-id.middleware';

@Module({
  providers: [
    AppLogger,
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
  ],
  exports: [AppLogger],
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceIdMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
