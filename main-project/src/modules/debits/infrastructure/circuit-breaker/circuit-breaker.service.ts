import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import CircuitBreaker = require('opossum');

/**
 * Circuit Breaker configuration for external debit providers.
 *
 * State machine:
 *   CLOSED  ──(errors ≥ errorThresholdPercentage)──▶  OPEN
 *   OPEN    ──(after resetTimeout)──────────────────▶  HALF-OPEN
 *   HALF-OPEN ──(first call succeeds)───────────────▶  CLOSED
 *   HALF-OPEN ──(first call fails)──────────────────▶  OPEN
 *
 * Tuning guide:
 *
 * timeout (5 000 ms)
 *   Hard deadline per HTTP call. If the provider takes longer, the call is
 *   rejected immediately so the fallback kicks in fast instead of waiting
 *   for a TCP/HTTP-level timeout that could take 30+ seconds.
 *
 * errorThresholdPercentage (50 %)
 *   Share of failing calls (within the rolling window) that flips the
 *   circuit to OPEN. Below 50 % the circuit stays CLOSED even under
 *   partial degradation.
 *
 * volumeThreshold (3)
 *   Minimum number of calls that must be observed before the percentage
 *   check fires. Prevents the circuit from opening on a single cold-start
 *   error when there is no statistical signal yet.
 *
 * resetTimeout (15 000 ms)
 *   How long the circuit stays OPEN before trying one probe request
 *   (HALF-OPEN). Keep this shorter than typical provider recovery time
 *   so healthy providers get unblocked quickly without hammering a broken
 *   one.
 *
 * rollingCountTimeout (10 000 ms)
 *   Width of the sliding window used to compute error rate. A 10-second
 *   window captures recent behaviour without over-weighting old spikes.
 *
 * rollingCountBuckets (10)
 *   Granularity of the window (one bucket = 1 s). More buckets = smoother
 *   decay of old data; fewer = faster response to sudden degradation.
 *
 * errorFilter
 *   4xx errors are client mistakes, not provider failures — exclude them
 *   from the error count so a batch of bad plates does not open the
 *   circuit against a healthy provider.
 */
function buildOptions(): CircuitBreaker.Options {
  return {
    timeout: Number(process.env.CB_TIMEOUT_MS ?? 5_000),
    errorThresholdPercentage: Number(process.env.CB_ERROR_THRESHOLD_PERCENTAGE ?? 50),
    volumeThreshold: Number(process.env.CB_VOLUME_THRESHOLD ?? 3),
    resetTimeout: Number(process.env.CB_RESET_TIMEOUT_MS ?? 15_000),
    rollingCountTimeout: Number(process.env.CB_ROLLING_COUNT_TIMEOUT_MS ?? 10_000),
    rollingCountBuckets: Number(process.env.CB_ROLLING_COUNT_BUCKETS ?? 10),
    errorFilter: (err: { response?: { status?: number } }) => {
      const status = err?.response?.status;
      return status !== undefined && status >= 400 && status < 500;
    },
  };
}

@Injectable()
export class CircuitBreakerService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly breakers = new Map<string, CircuitBreaker<any[], any>>();
  private readonly logger = new Logger(CircuitBreakerService.name);

  fire<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.breakers.has(name)) {
      // The action is a thunk invoker: the real work is always provided per call via fire(fn)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const breaker = new CircuitBreaker((thunk: () => Promise<any>) => thunk(), {
        ...buildOptions(),
        name,
      });
      this.attachLogs(breaker, name);
      this.breakers.set(name, breaker);
    }

    return this.breakers.get(name)!.fire(fn) as Promise<T>;
  }

  private attachLogs(breaker: CircuitBreaker, name: string): void {
    breaker.on('open', () =>
      this.logger.warn('circuit OPEN', { breaker: name, state: 'open' }),
    );
    breaker.on('halfOpen', () =>
      this.logger.log('circuit HALF-OPEN — probing', { breaker: name, state: 'half-open' }),
    );
    breaker.on('close', () =>
      this.logger.log('circuit CLOSED', { breaker: name, state: 'closed' }),
    );
    breaker.on('fallback', () =>
      this.logger.warn('fallback triggered', { breaker: name }),
    );
    breaker.on('timeout', () =>
      this.logger.warn('circuit timeout', { breaker: name }),
    );
    breaker.on('reject', () =>
      this.logger.warn('circuit rejected (open state)', { breaker: name }),
    );
  }
}
