import { InvalidDebitsError, InvalidPlateError } from '../errors/vehicle-debits.errors';
import { DebitType } from '../value-objects/debit-type.enum';
import { Debit } from '../value-objects/debit.vo';
import { VehicleDebits } from './vehicle-debits.aggregate';

const sampleDebit = Debit.create(DebitType.IPVA, 100, new Date('2025-01-01T00:00:00Z'));

describe('VehicleDebits', () => {
  describe('create — plate validation', () => {
    it('normalizes plate: trims whitespace and uppercases', () => {
      const agg = VehicleDebits.create('  abc1234  ', [sampleDebit]);

      expect(agg.plate).toBe('ABC1234');
    });

    it('throws InvalidPlateError for empty string', () => {
      expect(() => VehicleDebits.create('', [sampleDebit])).toThrow(InvalidPlateError);
    });

    it('throws InvalidPlateError for whitespace-only string', () => {
      expect(() => VehicleDebits.create('   ', [sampleDebit])).toThrow(InvalidPlateError);
    });

    it('throws InvalidPlateError for non-string (null)', () => {
      expect(() => VehicleDebits.create(null as unknown as string, [sampleDebit])).toThrow(
        InvalidPlateError,
      );
    });
  });

  describe('create — debits validation', () => {
    it('throws InvalidDebitsError when debits is not an array', () => {
      expect(() =>
        VehicleDebits.create('ABC1234', {} as unknown as Debit[]),
      ).toThrow(InvalidDebitsError);
    });

    it('accepts an empty debits array', () => {
      const agg = VehicleDebits.create('ABC1234', []);

      expect(agg.debits).toEqual([]);
    });
  });

  describe('debits getter', () => {
    it('returns a copy — mutating the result does not affect the aggregate', () => {
      const agg = VehicleDebits.create('ABC1234', [sampleDebit]);
      const copy = agg.debits;

      copy.push(Debit.create(DebitType.MULTA, 200, new Date('2025-06-01T00:00:00Z')));

      expect(agg.debits).toHaveLength(1);
    });
  });
});
