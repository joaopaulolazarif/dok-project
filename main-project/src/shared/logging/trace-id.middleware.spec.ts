import type { NextFunction, Request, Response } from 'express';
import { TRACE_ID_HEADER, TraceIdMiddleware } from './trace-id.middleware';
import { getTraceId } from './trace-context';

function makeReq(header?: string | string[]): Request {
  return {
    headers: header !== undefined ? { [TRACE_ID_HEADER]: header } : {},
  } as unknown as Request;
}

function makeRes(): { headers: Record<string, string>; setHeader: jest.Mock } {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value;
    }),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('TraceIdMiddleware', () => {
  let middleware: TraceIdMiddleware;

  beforeEach(() => {
    middleware = new TraceIdMiddleware();
  });

  it('generates a UUID v4 when x-trace-id header is absent and calls next inside the trace context', (done) => {
    const req = makeReq();
    const res = makeRes();
    const next: NextFunction = () => {
      expect(getTraceId()).toMatch(UUID_RE);
      expect(res.setHeader).toHaveBeenCalledWith(
        TRACE_ID_HEADER,
        expect.stringMatching(UUID_RE),
      );
      done();
    };

    middleware.use(req as Request, res as unknown as Response, next);
  });

  it('reuses the x-trace-id when provided as a string', (done) => {
    const req = makeReq('existing-trace');
    const res = makeRes();
    const next: NextFunction = () => {
      expect(getTraceId()).toBe('existing-trace');
      done();
    };

    middleware.use(req as Request, res as unknown as Response, next);
  });

  it('uses the first element when x-trace-id is an array', (done) => {
    const req = makeReq(['first-id', 'second-id']);
    const res = makeRes();
    const next: NextFunction = () => {
      expect(getTraceId()).toBe('first-id');
      done();
    };

    middleware.use(req as Request, res as unknown as Response, next);
  });

  it('generates a UUID when x-trace-id is an empty string', (done) => {
    const req = makeReq('');
    const res = makeRes();
    const next: NextFunction = () => {
      expect(getTraceId()).toMatch(UUID_RE);
      done();
    };

    middleware.use(req as Request, res as unknown as Response, next);
  });
});
