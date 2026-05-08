import { Logger } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('CircuitBreakerService', () => {
  let savedEnv: Record<string, string | undefined>;
  let svc: CircuitBreakerService;

  beforeEach(() => {
    savedEnv = {
      CB_TIMEOUT_MS: process.env.CB_TIMEOUT_MS,
      CB_ERROR_THRESHOLD_PERCENTAGE: process.env.CB_ERROR_THRESHOLD_PERCENTAGE,
      CB_VOLUME_THRESHOLD: process.env.CB_VOLUME_THRESHOLD,
      CB_RESET_TIMEOUT_MS: process.env.CB_RESET_TIMEOUT_MS,
      CB_ROLLING_COUNT_TIMEOUT_MS: process.env.CB_ROLLING_COUNT_TIMEOUT_MS,
      CB_ROLLING_COUNT_BUCKETS: process.env.CB_ROLLING_COUNT_BUCKETS,
    };
    process.env.CB_TIMEOUT_MS = '200';
    process.env.CB_ERROR_THRESHOLD_PERCENTAGE = '50';
    process.env.CB_VOLUME_THRESHOLD = '3';
    process.env.CB_RESET_TIMEOUT_MS = '200';
    process.env.CB_ROLLING_COUNT_TIMEOUT_MS = '2000';
    process.env.CB_ROLLING_COUNT_BUCKETS = '10';

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    svc = new CircuitBreakerService();
  });

  afterEach(() => {
    Object.assign(process.env, savedEnv);
    jest.restoreAllMocks();
  });

  it('fire resolves with the return value of the wrapped function', async () => {
    const result = await svc.fire('test-ok', () => Promise.resolve(42));

    expect(result).toBe(42);
  });

  it('creates a single breaker instance for repeated calls with the same name', async () => {
    const internal = svc as unknown as { breakers: Map<string, unknown> };

    await svc.fire('repeated', () => Promise.resolve('a'));
    await svc.fire('repeated', () => Promise.resolve('b'));

    expect(internal.breakers.size).toBe(1);
  });

  it('creates separate breakers for different names', async () => {
    const internal = svc as unknown as { breakers: Map<string, unknown> };

    await svc.fire('name-x', () => Promise.resolve());
    await svc.fire('name-y', () => Promise.resolve());

    expect(internal.breakers.size).toBe(2);
  });

  it('opens the circuit after volumeThreshold consecutive failures and rejects fast', async () => {
    const fail = () => Promise.reject(new Error('server error'));

    // Three failures should cross the threshold (100% > 50%) and open the circuit
    await expect(svc.fire('open-test', fail)).rejects.toThrow();
    await expect(svc.fire('open-test', fail)).rejects.toThrow();
    await expect(svc.fire('open-test', fail)).rejects.toThrow();

    // Next call should be rejected immediately by the open circuit
    await expect(svc.fire('open-test', () => Promise.resolve('should-not-run'))).rejects.toThrow();
  });

  it('errorFilter — 4xx errors do not count toward the circuit threshold', async () => {
    const err404 = Object.assign(new Error('Not Found'), { response: { status: 404 } });
    const fail404 = () => Promise.reject(err404);

    // Five 4xx failures — all filtered out, circuit should remain closed
    for (let i = 0; i < 5; i++) {
      await expect(svc.fire('filter-test', fail404)).rejects.toThrow('Not Found');
    }

    // Sixth call with a healthy function should succeed (circuit is still closed)
    const result = await svc.fire('filter-test', () => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('rejects with a timeout error when the wrapped function exceeds CB_TIMEOUT_MS', async () => {
    process.env.CB_TIMEOUT_MS = '20';
    const freshSvc = new CircuitBreakerService();

    const slowFn = () => delay(150).then(() => 'slow');

    await expect(freshSvc.fire('timeout-test', slowFn)).rejects.toThrow();
  });

  it('logs circuit OPEN event via warn when the breaker opens', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    const fail = () => Promise.reject(new Error('boom'));

    for (let i = 0; i < 3; i++) {
      await expect(svc.fire('log-open-test', fail)).rejects.toThrow();
    }

    expect(warnSpy).toHaveBeenCalledWith(
      'circuit OPEN',
      expect.objectContaining({ breaker: 'log-open-test', state: 'open' }),
    );
  });

  it('logs circuit rejected (open state) event when fire is called on an open circuit', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    const fail = () => Promise.reject(new Error('boom'));

    for (let i = 0; i < 3; i++) {
      await expect(svc.fire('log-reject-test', fail)).rejects.toThrow();
    }

    // Trigger a reject event
    await expect(svc.fire('log-reject-test', () => Promise.resolve())).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      'circuit rejected (open state)',
      expect.objectContaining({ breaker: 'log-reject-test' }),
    );
  });
});
