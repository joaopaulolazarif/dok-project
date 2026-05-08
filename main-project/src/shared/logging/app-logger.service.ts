import { Injectable, LoggerService, LogLevel } from '@nestjs/common';
import { getTraceId } from './trace-context';

type Meta = Record<string, unknown> | undefined;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  traceId: string | null;
  context: string | null;
  message: string;
  meta?: Record<string, unknown>;
  trace?: string;
}

/**
 * JSON structured logger with traceId injected from AsyncLocalStorage.
 *
 * Usage:
 *   private readonly logger = new Logger(MyClass.name);
 *   this.logger.log('event happened', { foo: 1 });        // metadata as second arg
 *   this.logger.error('boom', err.stack, { foo: 1 });
 *
 * NestJS routes both `Logger` static class and framework logs through this.
 */
@Injectable()
export class AppLogger implements LoggerService {
  private readonly enabledLevels: Set<LogLevel> = new Set(
    (process.env.LOG_LEVELS?.split(',') as LogLevel[] | undefined) ?? [
      'log',
      'error',
      'warn',
      'debug',
      'verbose',
    ],
  );

  log(message: unknown, ...rest: unknown[]): void {
    this.emit('log', message, rest);
  }

  error(message: unknown, ...rest: unknown[]): void {
    this.emit('error', message, rest);
  }

  warn(message: unknown, ...rest: unknown[]): void {
    this.emit('warn', message, rest);
  }

  debug(message: unknown, ...rest: unknown[]): void {
    this.emit('debug', message, rest);
  }

  verbose(message: unknown, ...rest: unknown[]): void {
    this.emit('verbose', message, rest);
  }

  setLogLevels(levels: LogLevel[]): void {
    this.enabledLevels.clear();
    for (const l of levels) this.enabledLevels.add(l);
  }

  /**
   * NestJS calling convention varies:
   *   logger.log(message, context)
   *   logger.error(message, trace, context)
   *   logger.log(message, meta, context)        // our extension
   * Last string arg is treated as context; an object arg becomes meta.
   */
  private emit(level: LogLevel, message: unknown, rest: unknown[]): void {
    if (!this.enabledLevels.has(level)) return;

    let context: string | null = null;
    let trace: string | undefined;
    let meta: Meta;

    for (const arg of rest) {
      if (arg == null) continue;
      if (typeof arg === 'string') {
        if (level === 'error' && trace === undefined && /\n\s+at\s/.test(arg)) {
          trace = arg;
        } else {
          context = arg;
        }
      } else if (typeof arg === 'object') {
        meta = { ...(meta ?? {}), ...(arg as Record<string, unknown>) };
      }
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      traceId: getTraceId() ?? null,
      context,
      message: typeof message === 'string' ? message : safeStringify(message),
      ...(meta && Object.keys(meta).length ? { meta } : {}),
      ...(trace ? { trace } : {}),
    };

    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(JSON.stringify(entry) + '\n');
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
