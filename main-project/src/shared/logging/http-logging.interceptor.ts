import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = Date.now();

    this.logger.log('request received', {
      method: req.method,
      url: req.originalUrl ?? req.url,
    });

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log('request completed', {
            method: req.method,
            url: req.originalUrl ?? req.url,
            statusCode: res.statusCode,
            durationMs: Date.now() - start,
          }),
        error: (err: Error & { status?: number }) =>
          this.logger.error('request failed', {
            method: req.method,
            url: req.originalUrl ?? req.url,
            statusCode: err.status ?? 500,
            durationMs: Date.now() - start,
            error: err.message,
          }),
      }),
    );
  }
}
