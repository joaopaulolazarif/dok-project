import { Debit } from '../value-objects/debit.vo';
import { InterestRules } from './interest-rules.config';

export const INTEREST_CALCULATOR = Symbol('INTEREST_CALCULATOR');

export class InterestCalculatorService {
  constructor(
    private readonly referenceDate: Date,
    private readonly rules: InterestRules,
  ) {}

  calculate(debit: Debit): number {
    const rule = this.rules[debit.type];
    if (!rule) return debit.amount;

    const daysLate = this.daysLate(debit.dueDate);
    if (daysLate <= 0) return debit.amount;

    // Work in cents to avoid floating-point precision loss during rounding
    const amountCents = Math.round(debit.amount * 100);
    let interestCents = Math.round(amountCents * rule.dailyRate * daysLate);

    if (rule.cap !== undefined) {
      interestCents = Math.min(interestCents, Math.round(amountCents * rule.cap));
    }

    return (amountCents + interestCents) / 100;
  }

  daysLate(dueDate: Date): number {
    const ref = Date.UTC(
      this.referenceDate.getUTCFullYear(),
      this.referenceDate.getUTCMonth(),
      this.referenceDate.getUTCDate(),
    );
    const due = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
    return Math.round((ref - due) / 86_400_000);
  }
}
