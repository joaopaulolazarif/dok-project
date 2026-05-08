// eslint-disable-next-line @typescript-eslint/no-require-imports
import nock = require('nock');
import { HttpService } from '@nestjs/axios';
import { CircuitBreakerService } from '../../circuit-breaker/circuit-breaker.service';
import { runWithTrace } from '../../../../../shared/logging';
import { PlateNotFoundError } from '../../../domain/errors/vehicle-debits.errors';
import { ProviderTwoDebitClient } from './provider-two-debit.client';

const BASE_URL = 'http://provider-two-test-client.local';

const VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <plate>ABC1234</plate>
  <debts>
    <debt><category>IPVA</category><value>1000</value><expiration>2025-01-01</expiration></debt>
    <debt><category>MULTA</category><value>200</value><expiration>2025-06-15</expiration></debt>
  </debts>
</response>`;

describe('ProviderTwoDebitClient', () => {
  let client: ProviderTwoDebitClient;

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    const httpService = new HttpService();
    const circuitBreaker = new CircuitBreakerService();
    client = new ProviderTwoDebitClient(httpService, circuitBreaker, BASE_URL);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('200 OK with XML response → returns VehicleDebits with correct plate and debits', async () => {
    nock(BASE_URL)
      .post('/debits', { placa: 'ABC1234' })
      .reply(200, VALID_XML, { 'Content-Type': 'application/xml' });

    const result = await client.getDebits('ABC1234');

    expect(result.plate).toBe('ABC1234');
    expect(result.debits).toHaveLength(2);
  });

  it('sends x-trace-id header when inside runWithTrace context', async () => {
    const scope = nock(BASE_URL)
      .post('/debits', { placa: 'ABC1234' })
      .matchHeader('x-trace-id', 'trace-xyz')
      .reply(200, VALID_XML, { 'Content-Type': 'application/xml' });

    await runWithTrace('trace-xyz', () => client.getDebits('ABC1234'));

    expect(scope.isDone()).toBe(true);
  });

  it('404 Not Found → throws PlateNotFoundError', async () => {
    nock(BASE_URL).post('/debits').reply(404, { error: 'Plate not found', code: 404 });

    await expect(client.getDebits('XYZ9999')).rejects.toThrow(PlateNotFoundError);
  });

  it('500 error → throws', async () => {
    nock(BASE_URL).post('/debits').reply(500, 'Internal Server Error');

    await expect(client.getDebits('ABC1234')).rejects.toThrow();
  });
});
