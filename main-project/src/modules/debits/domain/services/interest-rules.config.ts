import { DebitType } from '../value-objects/debit-type.enum';

export interface InterestRule {
  /** Daily interest rate applied per day late (e.g. 0.0033 = 0.33% per day) */
  dailyRate: number;
  /** Optional cap as a fraction of the original amount (e.g. 0.20 = 20% max interest) */
  cap?: number;
}

export type InterestRules = Record<DebitType, InterestRule>;

export const DEFAULT_INTEREST_RULES: InterestRules = {
  [DebitType.IPVA]: { dailyRate: 0.0033, cap: 0.20 },
  [DebitType.MULTA]: { dailyRate: 0.01 },
};
