import { AppLogger } from './app-logger.service';
import { runWithTrace } from './trace-context';

function captureWrite(
  stream: 'stdout' | 'stderr',
): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = jest
    .spyOn(process[stream], 'write')
    .mockImplementation((chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    });
  return {
    lines,
    restore: () => spy.mockRestore(),
  };
}

describe('AppLogger', () => {
  let logger: AppLogger;

  beforeEach(() => {
    logger = new AppLogger();
  });

  it('log() emits a JSON entry with level "log", context, and traceId null', () => {
    const { lines, restore } = captureWrite('stdout');

    logger.log('hello', 'MyContext');
    restore();

    const entry = JSON.parse(lines[0]);
    expect(entry.level).toBe('log');
    expect(entry.context).toBe('MyContext');
    expect(entry.traceId).toBeNull();
    expect(entry.message).toBe('hello');
  });

  it('log() with metadata object emits meta field', () => {
    const { lines, restore } = captureWrite('stdout');

    logger.log('event', { foo: 1 }, 'MyCtx');
    restore();

    const entry = JSON.parse(lines[0]);
    expect(entry.meta).toEqual({ foo: 1 });
    expect(entry.context).toBe('MyCtx');
  });

  it('error() with a stack string puts it in trace, not context', () => {
    const { lines, restore } = captureWrite('stderr');
    const stack = '\n    at Object.<anonymous> (file.ts:10:5)';

    logger.error('boom', stack, 'ErrCtx');
    restore();

    const entry = JSON.parse(lines[0]);
    expect(entry.trace).toBe(stack);
    expect(entry.context).toBe('ErrCtx');
  });

  it('log() inside runWithTrace emits the traceId', () => {
    const { lines, restore } = captureWrite('stdout');

    runWithTrace('t1', () => logger.log('traced'));
    restore();

    const entry = JSON.parse(lines[0]);
    expect(entry.traceId).toBe('t1');
  });

  it('log() is a no-op when "log" level is disabled', () => {
    const { lines, restore } = captureWrite('stdout');
    logger.setLogLevels(['error']);

    logger.log('should be silent');
    restore();

    expect(lines).toHaveLength(0);
  });

  it('error() writes to stderr, other levels write to stdout', () => {
    const outLines: string[] = [];
    const errLines: string[] = [];
    const outSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((c: unknown) => { outLines.push(String(c)); return true; });
    const errSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((c: unknown) => { errLines.push(String(c)); return true; });

    logger.log('stdout-message');
    logger.error('stderr-message');

    outSpy.mockRestore();
    errSpy.mockRestore();

    expect(outLines.some((l) => l.includes('stdout-message'))).toBe(true);
    expect(errLines.some((l) => l.includes('stderr-message'))).toBe(true);
  });

  it('safeStringify — circular reference does not throw, message becomes a string', () => {
    const { lines, restore } = captureWrite('stdout');

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    logger.log(circular);
    restore();

    const entry = JSON.parse(lines[0]);
    expect(typeof entry.message).toBe('string');
  });
});
