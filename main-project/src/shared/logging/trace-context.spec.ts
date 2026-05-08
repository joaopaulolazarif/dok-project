import { getTraceId, runWithTrace } from './trace-context';

describe('trace-context', () => {
  it('getTraceId returns undefined outside of runWithTrace', () => {
    expect(getTraceId()).toBeUndefined();
  });

  it('getTraceId returns the provided ID inside runWithTrace', () => {
    let captured: string | undefined;

    runWithTrace('my-trace-id', () => {
      captured = getTraceId();
    });

    expect(captured).toBe('my-trace-id');
  });

  it('isolates context between parallel runWithTrace calls', async () => {
    const results: [string | undefined, string | undefined] = [undefined, undefined];

    await Promise.all([
      runWithTrace('trace-A', async () => {
        await Promise.resolve(); // yield to allow interleaving
        results[0] = getTraceId();
      }),
      runWithTrace('trace-B', async () => {
        await Promise.resolve();
        results[1] = getTraceId();
      }),
    ]);

    expect(results[0]).toBe('trace-A');
    expect(results[1]).toBe('trace-B');
  });
});
