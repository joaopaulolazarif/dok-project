// eslint-disable-next-line @typescript-eslint/no-require-imports
import nock = require('nock');
import { HttpService } from '@nestjs/axios';
import { CircuitBreakerService } from '../../circuit-breaker/circuit-breaker.service';
import { runWithTrace } from '../../../../../shared/logging';
import { PlateNotFoundError } from '../../../domain/errors/vehicle-debits.errors';
import { ProviderOneDebitClient } from './provider-one-debit.client';

const BASE_URL = 'http://provider-one-test-client.local';

const VALID_RESPONSE = {
  vehicle: 'ABC1234',
  debts: [{ type: 'IPVA', amount: 1000, due_date: '2025-01-01' }],
};

describe('ProviderOneDebitClient', () => {
  let client: ProviderOneDebitClient;

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    // Fresh instances per test to avoid circuit breaker state bleed
    const httpService = new HttpService();
    const circuitBreaker = new CircuitBreakerService();
    client = new ProviderOneDebitClient(httpService, circuitBreaker, BASE_URL);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('200 OK → returns VehicleDebits with correct plate and debits', async () => {
    nock(BASE_URL).post('/debits', { placa: 'ABC1234' }).reply(200, VALID_RESPONSE);

    const result = await client.getDebits('ABC1234');

    expect(result.plate).toBe('ABC1234');
    expect(result.debits).toHaveLength(1);
  });

  it('sends x-trace-id header when inside runWithTrace context', async () => {
    const scope = nock(BASE_URL)
      .post('/debits', { placa: 'ABC1234' })
      .matchHeader('x-trace-id', 'trace-abc')
      .reply(200, VALID_RESPONSE);

    await runWithTrace('trace-abc', () => client.getDebits('ABC1234'));

    expect(scope.isDone()).toBe(true);
  });

  it('404 Not Found → throws PlateNotFoundError', async () => {
    nock(BASE_URL).post('/debits').reply(404, { error: 'Plate not found', code: 404 });

    await expect(client.getDebits('XYZ9999')).rejects.toThrow(PlateNotFoundError);
  });

  it('500 Internal Server Error → throws', async () => {
    nock(BASE_URL).post('/debits').reply(500, 'Internal Server Error');

    await expect(client.getDebits('ABC1234')).rejects.toThrow();
  });

  it('no trace context → request succeeds without x-trace-id header', async () => {
    // Intercept that would only match WITH the trace header
    const headerRequiredScope = nock(BASE_URL)
      .matchHeader('x-trace-id', /.+/)
      .post('/debits')
      .reply(200, VALID_RESPONSE);

    // Intercept that matches without any header requirement (fallback)
    const noHeaderScope = nock(BASE_URL)
      .post('/debits')
      .reply(200, VALID_RESPONSE);

    await client.getDebits('ABC1234');

    // The header-required intercept should NOT have been consumed
    expect(headerRequiredScope.isDone()).toBe(false);
    // The no-header intercept should have been consumed
    expect(noHeaderScope.isDone()).toBe(true);

    nock.cleanAll();
  });
});
