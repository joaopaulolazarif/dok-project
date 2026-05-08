import { DebitType } from './debit-type.enum';
import { Debit } from './debit.vo';

describe('Debit', () => {
  const dueDate = new Date('2025-12-31T00:00:00Z');

  describe('create / getters', () => {
    it('returns instance with correct type, amount, dueDate', () => {
      const debit = Debit.create(DebitType.IPVA, 1000, dueDate);

      expect(debit.type).toBe(DebitType.IPVA);
      expect(debit.amount).toBe(1000);
      expect(debit.dueDate).toBe(dueDate);
    });
  });

  describe('equals', () => {
    it('returns true for two Debits with the same props', () => {
      const a = Debit.create(DebitType.IPVA, 1000, dueDate);
      const b = Debit.create(DebitType.IPVA, 1000, dueDate);

      expect(a.equals(b)).toBe(true);
    });

    it('returns false when amounts differ', () => {
      const a = Debit.create(DebitType.IPVA, 1000, dueDate);
      const b = Debit.create(DebitType.IPVA, 2000, dueDate);

      expect(a.equals(b)).toBe(false);
    });

    it('returns false when types differ', () => {
      const a = Debit.create(DebitType.IPVA, 1000, dueDate);
      const b = Debit.create(DebitType.MULTA, 1000, dueDate);

      expect(a.equals(b)).toBe(false);
    });
  });
});
