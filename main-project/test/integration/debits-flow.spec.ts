// eslint-disable-next-line @typescript-eslint/no-require-imports
import nock = require('nock');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';

const PROVIDER_ONE_URL = 'http://provider-one.integration-test';
const PROVIDER_TWO_URL = 'http://provider-two.integration-test';

const providerOnePayload = {
  vehicle: 'ABC1234',
  debts: [
    { type: 'IPVA', amount: 1000, due_date: '2026-01-01' },
    { type: 'MULTA', amount: 100, due_date: '2026-01-26' },
  ],
};

const providerTwoXml = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <plate>ABC1234</plate>
  <debts>
    <debt><category>IPVA</category><value>500</value><expiration>2026-01-01</expiration></debt>
  </debts>
</response>`;

describe('Debits flow — integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.PROVIDER_ONE_URL = PROVIDER_ONE_URL;
    process.env.PROVIDER_TWO_URL = PROVIDER_TWO_URL;
    process.env.INTEREST_REFERENCE_DATE = '2026-01-31';
    // Keep volume threshold high so individual test failures don't open the circuit
    process.env.CB_VOLUME_THRESHOLD = '20';
    process.env.CB_RESET_TIMEOUT_MS = '200';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Silence app logger output during tests
    app.useLogger(false);
    await app.init();

    nock.disableNetConnect();
    nock.enableNetConnect(/127\.0\.0\.1|localhost/);
  });

  afterAll(async () => {
    nock.enableNetConnect();
    nock.cleanAll();
    await app.close();
    delete process.env.PROVIDER_ONE_URL;
    delete process.env.PROVIDER_TWO_URL;
    delete process.env.INTEREST_REFERENCE_DATE;
    delete process.env.CB_VOLUME_THRESHOLD;
    delete process.env.CB_RESET_TIMEOUT_MS;
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('happy path — provider-one', () => {
    it('returns 201 with plate, debits, and paymentOptions; x-trace-id header echoed', async () => {
      const p1 = nock(PROVIDER_ONE_URL)
        .post('/debits')
        .reply(200, providerOnePayload);

      const response = await request(app.getHttpServer())
        .post('/debits')
        .send({ placa: 'abc1234' });

      expect(response.status).toBe(201);
      expect(response.body.placa).toBe('ABC1234');
      expect(Array.isArray(response.body.debitos)).toBe(true);
      expect(response.body.debitos).toHaveLength(2);
      expect(response.body.pagamentos.opcoes.length).toBeGreaterThan(0);
      expect(response.headers['x-trace-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(p1.isDone()).toBe(true);
    });
  });

  describe('fallback — provider-two', () => {
    it('falls back to provider-two when provider-one returns 500', async () => {
      const p1 = nock(PROVIDER_ONE_URL).post('/debits').reply(500);
      const p2 = nock(PROVIDER_TWO_URL)
        .post('/debits')
        .reply(200, providerTwoXml, { 'Content-Type': 'application/xml' });

      const response = await request(app.getHttpServer())
        .post('/debits')
        .send({ placa: 'ABC1234' });

      expect(response.status).toBe(201);
      expect(response.body.placa).toBe('ABC1234');
      expect(p1.isDone()).toBe(true);
      expect(p2.isDone()).toBe(true);
    });
  });

  describe('x-trace-id propagation', () => {
    it('forwards x-trace-id from request header to outbound provider call', async () => {
      const p1 = nock(PROVIDER_ONE_URL)
        .post('/debits')
        .matchHeader('x-trace-id', 'my-trace-123')
        .reply(200, providerOnePayload);

      const response = await request(app.getHttpServer())
        .post('/debits')
        .set('x-trace-id', 'my-trace-123')
        .send({ placa: 'ABC1234' });

      expect(response.status).toBe(201);
      expect(p1.isDone()).toBe(true);
      expect(response.headers['x-trace-id']).toBe('my-trace-123');
    });
  });

  describe('both providers fail', () => {
    it('returns 500 when both provider-one and provider-two fail', async () => {
      nock(PROVIDER_ONE_URL).post('/debits').reply(500);
      nock(PROVIDER_TWO_URL).post('/debits').reply(500);

      const response = await request(app.getHttpServer())
        .post('/debits')
        .send({ placa: 'ABC1234' });

      expect(response.status).toBe(500);
    });
  });

  describe('4xx from provider-one — falls back to provider-two', () => {
    it('uses provider-two when provider-one returns 400', async () => {
      const p1 = nock(PROVIDER_ONE_URL).post('/debits').reply(400, { error: 'bad request' });
      const p2 = nock(PROVIDER_TWO_URL)
        .post('/debits')
        .reply(200, providerTwoXml, { 'Content-Type': 'application/xml' });

      const response = await request(app.getHttpServer())
        .post('/debits')
        .send({ placa: 'ABC1234' });

      // Current behavior: 4xx from provider-one triggers fallback to provider-two
      expect(response.status).toBe(201);
      expect(p1.isDone()).toBe(true);
      expect(p2.isDone()).toBe(true);
    });
  });
});
