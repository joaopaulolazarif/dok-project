import { AsyncLocalStorage } from 'node:async_hooks';

export interface TraceStore {
  traceId: string;
}

export const traceContext = new AsyncLocalStorage<TraceStore>();

export function getTraceId(): string | undefined {
  return traceContext.getStore()?.traceId;
}

export function runWithTrace<T>(traceId: string, fn: () => T): T {
  return traceContext.run({ traceId }, fn);
}
