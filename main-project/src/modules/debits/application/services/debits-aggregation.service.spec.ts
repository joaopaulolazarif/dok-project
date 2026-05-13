import { Logger } from '@nestjs/common';
import { PaymentCalculatorService } from '../../../payment-options/domain/services/payment-calculator.service';
import { VehicleDebits } from '../../domain/aggregates/vehicle-debits.aggregate';
import { IDebitExternalProvider } from '../../domain/providers/debit-provider.interface';
import { InterestCalculatorService } from '../../domain/services/interest-calculator.service';
import { DEFAULT_INTEREST_RULES } from '../../domain/services/interest-rules.config';
import { DebitType } from '../../domain/value-objects/debit-type.enum';
import { Debit } from '../../domain/value-objects/debit.vo';
import { DebitsAggregationService } from './debits-aggregation.service';

const REFERENCE_DATE = new Date('2026-01-31T00:00:00Z');
const PLATE = 'ABC1234';

function makeDebit(type: DebitType, amount: number, dueDate: Date): Debit {
  return Debit.create(type, amount, dueDate);
}

function vehicleDebits(plate: string, debits: Debit[]): VehicleDebits {
  return VehicleDebits.create(plate, debits);
}

function makeService(
  providerOne: IDebitExternalProvider,
  providerTwo: IDebitExternalProvider,
  providerThree: IDebitExternalProvider,
): DebitsAggregationService {
  const interestCalc = new InterestCalculatorService(REFERENCE_DATE, DEFAULT_INTEREST_RULES);
  const paymentCalc = new PaymentCalculatorService();
  return new DebitsAggregationService(
    providerOne,
    providerTwo,
    providerThree,
    interestCalc,
    paymentCalc,
  );
}

describe('DebitsAggregationService', () => {
  let providerOne: jest.Mocked<IDebitExternalProvider>;
  let providerTwo: jest.Mocked<IDebitExternalProvider>;
  let providerThree: jest.Mocked<IDebitExternalProvider>;
  let svc: DebitsAggregationService;

  beforeEach(() => {
    providerOne = { getDebits: jest.fn() };
    providerTwo = { getDebits: jest.fn() };
    providerThree = { getDebits: jest.fn() };
    svc = makeService(providerOne, providerTwo, providerThree);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('happy path — provider-one', () => {
    it('returns response from provider-one and never calls provider-two', async () => {
      const debits = vehicleDebits(PLATE, [
        makeDebit(DebitType.IPVA, 1000, new Date('2026-01-01T00:00:00Z')),
      ]);
      providerOne.getDebits.mockResolvedValue(debits);

      const result = await svc.aggregate(PLATE);

      expect(providerOne.getDebits).toHaveBeenCalledWith(PLATE);
      expect(providerTwo.getDebits).not.toHaveBeenCalled();
      expect(result.plate).toBe(PLATE);
      expect(result.debits).toHaveLength(1);
      expect(result.paymentOptions).toBeDefined();
    });
  });

  describe('fallback — provider-two', () => {
    it('calls provider-two when provider-one rejects, returning its response', async () => {
      const providerTwoDebits = vehicleDebits(PLATE, [
        makeDebit(DebitType.MULTA, 200, new Date('2025-12-01T00:00:00Z')),
      ]);
      providerOne.getDebits.mockRejectedValue(new Error('provider-one down'));
      providerTwo.getDebits.mockResolvedValue(providerTwoDebits);

      const result = await svc.aggregate(PLATE);

      expect(providerOne.getDebits).toHaveBeenCalledWith(PLATE);
      expect(providerTwo.getDebits).toHaveBeenCalledWith(PLATE);
      expect(result.plate).toBe(PLATE);
      expect(result.debits).toHaveLength(1);
    });
  });

  describe('fallback — provider-three', () => {
    it('calls provider-three when both provider-one and provider-two reject', async () => {
      const providerThreeDebits = vehicleDebits(PLATE, [
        makeDebit(DebitType.IPVA, 500, new Date('2025-11-01T00:00:00Z')),
      ]);
      providerOne.getDebits.mockRejectedValue(new Error('provider-one down'));
      providerTwo.getDebits.mockRejectedValue(new Error('provider-two down'));
      providerThree.getDebits.mockResolvedValue(providerThreeDebits);

      const result = await svc.aggregate(PLATE);

      expect(providerOne.getDebits).toHaveBeenCalledWith(PLATE);
      expect(providerTwo.getDebits).toHaveBeenCalledWith(PLATE);
      expect(providerThree.getDebits).toHaveBeenCalledWith(PLATE);
      expect(result.plate).toBe(PLATE);
      expect(result.debits).toHaveLength(1);
    });
  });

  describe('all providers fail', () => {
    it('throws the error from provider-three when all providers reject', async () => {
      providerOne.getDebits.mockRejectedValue(new Error('provider-one down'));
      providerTwo.getDebits.mockRejectedValue(new Error('provider-two down'));
      providerThree.getDebits.mockRejectedValue(new Error('provider-three down'));

      await expect(svc.aggregate(PLATE)).rejects.toThrow('provider-three down');
    });
  });

  describe('debitCount in log metadata', () => {
    it('logs provider success with plate, provider, durationMs, debitCount', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log');
      const debits = vehicleDebits(PLATE, [
        makeDebit(DebitType.IPVA, 100, new Date('2025-01-01T00:00:00Z')),
        makeDebit(DebitType.MULTA, 50, new Date('2025-06-01T00:00:00Z')),
      ]);
      providerOne.getDebits.mockResolvedValue(debits);

      await svc.aggregate(PLATE);

      expect(logSpy).toHaveBeenCalledWith(
        'provider responded successfully',
        expect.objectContaining({
          plate: PLATE,
          provider: 'provider-one',
          debitCount: 2,
          durationMs: expect.any(Number),
        }),
      );
    });
  });

  describe('summary totals', () => {
    it('totalUpdatedAmount equals sum of interest-calculated amounts', async () => {
      // IPVA 30 days late: 1000 → 1099; MULTA 5 days late: 100 → 105
      const debits = vehicleDebits(PLATE, [
        makeDebit(DebitType.IPVA, 1000, new Date('2026-01-01T00:00:00Z')), // 30 days late
        makeDebit(DebitType.MULTA, 100, new Date('2026-01-26T00:00:00Z')), // 5 days late
      ]);
      providerOne.getDebits.mockResolvedValue(debits);

      const result = await svc.aggregate(PLATE);

      expect(Math.abs(result.summary.totalUpdatedAmount - (1099 + 105))).toBeLessThan(0.01);
    });
  });

  describe('empty debits', () => {
    it('returns empty debits, zeroed summary and empty paymentOptions', async () => {
      providerOne.getDebits.mockResolvedValue(vehicleDebits(PLATE, []));

      const result = await svc.aggregate(PLATE);

      expect(result.debits).toEqual([]);
      expect(result.summary.totalAmount).toBe(0);
      expect(result.summary.totalUpdatedAmount).toBe(0);
      expect(result.paymentOptions.options).toEqual([]);
    });
  });
});
