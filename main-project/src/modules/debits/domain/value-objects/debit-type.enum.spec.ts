import { isKnownDebitType } from './debit-type.enum';

describe('isKnownDebitType', () => {
  it('returns true for IPVA', () => {
    expect(isKnownDebitType('IPVA')).toBe(true);
  });

  it('returns true for MULTA', () => {
    expect(isKnownDebitType('MULTA')).toBe(true);
  });

  it('returns false for unknown string', () => {
    expect(isKnownDebitType('xpto')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isKnownDebitType('')).toBe(false);
  });

  it('returns false for undefined cast to string', () => {
    expect(isKnownDebitType(undefined as unknown as string)).toBe(false);
  });
});
