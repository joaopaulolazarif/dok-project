import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { HttpLoggingInterceptor } from './http-logging.interceptor';

function makeContext(type: string = 'http', method = 'GET', url = '/test'): ExecutionContext {
  return {
    getType: () => type,
    switchToHttp: () => ({
      getRequest: () => ({ method, url, originalUrl: url }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(value: unknown): CallHandler {
  return { handle: () => of(value) } as CallHandler;
}

function makeErrorHandler(err: unknown): CallHandler {
  return { handle: () => throwError(() => err) } as CallHandler;
}

describe('HttpLoggingInterceptor', () => {
  let interceptor: HttpLoggingInterceptor;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new HttpLoggingInterceptor();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('happy path: logs "request received" then "request completed" with durationMs >= 0', async () => {
    await lastValueFrom(interceptor.intercept(makeContext(), makeHandler({ ok: true })));

    expect(logSpy).toHaveBeenCalledWith(
      'request received',
      expect.objectContaining({ method: 'GET', url: '/test' }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      'request completed',
      expect.objectContaining({ durationMs: expect.any(Number) }),
    );
    const completedCall = logSpy.mock.calls.find(([msg]) => msg === 'request completed');
    expect(completedCall![1].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('error path: logs "request received" and "request failed" with correct statusCode', async () => {
    const err = Object.assign(new Error('boom'), { status: 422 });

    await expect(
      lastValueFrom(interceptor.intercept(makeContext(), makeErrorHandler(err))),
    ).rejects.toThrow('boom');

    expect(logSpy).toHaveBeenCalledWith(
      'request received',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'request failed',
      expect.objectContaining({ statusCode: 422 }),
    );
  });

  it('defaults statusCode to 500 when error has no status property', async () => {
    await expect(
      lastValueFrom(interceptor.intercept(makeContext(), makeErrorHandler(new Error('no-status')))),
    ).rejects.toThrow('no-status');

    expect(errorSpy).toHaveBeenCalledWith(
      'request failed',
      expect.objectContaining({ statusCode: 500 }),
    );
  });

  it('bypasses logging and passes through for non-http contexts', async () => {
    const handler: CallHandler = { handle: jest.fn(() => of('rpc-value')) } as unknown as CallHandler;

    const obs = interceptor.intercept(makeContext('rpc'), handler);
    await lastValueFrom(obs);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
