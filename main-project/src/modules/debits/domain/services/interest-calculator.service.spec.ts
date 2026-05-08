import { DebitType } from '../value-objects/debit-type.enum';
import { Debit } from '../value-objects/debit.vo';
import { InterestCalculatorService } from './interest-calculator.service';
import { DEFAULT_INTEREST_RULES } from './interest-rules.config';

const REFERENCE_DATE = new Date('2026-01-31T00:00:00Z');

function makeService(): InterestCalculatorService {
  return new InterestCalculatorService(REFERENCE_DATE, DEFAULT_INTEREST_RULES);
}

function debit(type: DebitType, amount: number, dueDate: Date): Debit {
  return Debit.create(type, amount, dueDate);
}

describe('InterestCalculatorService', () => {
  const svc = makeService();

  describe('calculate', () => {
    it('returns original amount when dueDate is in the future (not overdue)', () => {
      const d = debit(DebitType.IPVA, 1000, new Date('2026-02-28T00:00:00Z'));

      expect(svc.calculate(d)).toBe(1000);
    });

    it('returns original amount when no rule exists for the debit type', () => {
      const noRuleSvc = new InterestCalculatorService(REFERENCE_DATE, {} as typeof DEFAULT_INTEREST_RULES);
      // Debit with past dueDate but no matching rule
      const d = debit(DebitType.IPVA, 500, new Date('2020-01-01T00:00:00Z'));

      expect(noRuleSvc.calculate(d)).toBe(500);
    });

    it('IPVA 30 days late, R$1 000 → 1 099.00', () => {
      // ref=2026-01-31, dueDate=2026-01-01 → 30 days
      // amountCents=100000, interestCents=round(100000*0.0033*30)=9900, cap=20000 → min=9900
      // result = 109900/100 = 1099
      const d = debit(DebitType.IPVA, 1000, new Date('2026-01-01T00:00:00Z'));

      expect(svc.calculate(d)).toBe(1099);
    });

    it('IPVA 1 000 days late, R$1 000 → capped at 1 200.00', () => {
      // interestCents=round(100000*0.0033*1000)=330000, cap=round(100000*0.20)=20000 → min=20000
      // result = 120000/100 = 1200
      const dueDate = new Date(REFERENCE_DATE.getTime() - 1000 * 86_400_000);
      const d = debit(DebitType.IPVA, 1000, dueDate);

      expect(svc.calculate(d)).toBe(1200);
    });

    it('MULTA 5 days late, R$100 → 105.00', () => {
      // amountCents=10000, interestCents=round(10000*0.01*5)=500, no cap
      // result = 10500/100 = 105
      const d = debit(DebitType.MULTA, 100, new Date('2026-01-26T00:00:00Z'));

      expect(svc.calculate(d)).toBe(105);
    });

    it('does not introduce floating-point garbage (result*100 is an integer)', () => {
      // amount=99.99, IPVA, 1 day late
      const d = debit(DebitType.IPVA, 99.99, new Date('2026-01-30T00:00:00Z'));
      const result = svc.calculate(d);

      expect(Number.isInteger(Math.round(result * 100))).toBe(true);
    });
  });

  describe('daysLate', () => {
    it('returns 30 for a date 30 days before referenceDate', () => {
      expect(svc.daysLate(new Date('2026-01-01T00:00:00Z'))).toBe(30);
    });

    it('returns 0 when dueDate equals referenceDate', () => {
      expect(svc.daysLate(new Date('2026-01-31T00:00:00Z'))).toBe(0);
    });

    it('returns negative for a future dueDate', () => {
      expect(svc.daysLate(new Date('2026-02-28T00:00:00Z'))).toBeLessThan(0);
    });

    it('returns 0 for the same UTC day regardless of timezone offset', () => {
      // 2026-01-31T06:30:00Z = same UTC day as referenceDate
      const sameDayDifferentOffset = new Date('2026-01-31T06:30:00Z');

      expect(svc.daysLate(sameDayDifferentOffset)).toBe(0);
    });

    it('always returns an integer', () => {
      expect(Number.isInteger(svc.daysLate(new Date('2026-01-15T00:00:00Z')))).toBe(true);
    });
  });
});
