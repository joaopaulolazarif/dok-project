import { PayableItem } from '../types/payable-item';
import { PaymentCalculatorService } from './payment-calculator.service';

const svc = new PaymentCalculatorService();

function items(...entries: Array<[string, number]>): PayableItem[] {
  return entries.map(([type, updatedAmount]) => ({ type, updatedAmount }));
}

describe('PaymentCalculatorService', () => {
  it('returns empty options list for an empty input', () => {
    expect(svc.calculate([]).options).toEqual([]);
  });

  it('does not include TOTAL when all updatedAmounts are zero', () => {
    const result = svc.calculate(items(['IPVA', 0]));

    expect(result.options.find((o) => o.type === 'TOTAL')).toBeUndefined();
  });

  it('generates TOTAL first, then ONLY_IPVA and ONLY_MULTA for mixed debits', () => {
    const result = svc.calculate(items(['IPVA', 500], ['MULTA', 200], ['MULTA', 300]));
    const types = result.options.map((o) => o.type);

    expect(types[0]).toBe('TOTAL');
    expect(types).toContain('ONLY_IPVA');
    expect(types).toContain('ONLY_MULTA');
  });

  it('does not emit ONLY_IPVA when input has only MULTA debits', () => {
    const result = svc.calculate(items(['MULTA', 200]));

    expect(result.options.find((o) => o.type === 'ONLY_IPVA')).toBeUndefined();
  });

  it('PIX applies exactly 5% discount: baseAmount=1 000 → 950', () => {
    const option = svc.calculate(items(['IPVA', 1000])).options.find((o) => o.type === 'TOTAL')!;

    expect(option.pix.totalWithDiscount).toBe(950);
  });

  it('installment count=1 → installmentAmount equals baseAmount (no interest)', () => {
    const option = svc.calculate(items(['IPVA', 1000])).options.find((o) => o.type === 'TOTAL')!;
    const one = option.creditCard.installments.find((i) => i.count === 1)!;

    expect(one.installmentAmount).toBe(1000);
  });

  it('installment count=6 follows PMT formula with r=2.5%', () => {
    const P = 1000;
    const r = 0.025;
    const n = 6;
    const expected = Math.round((P * r / (1 - Math.pow(1 + r, -n))) * 100) / 100;
    const option = svc.calculate(items(['IPVA', P])).options.find((o) => o.type === 'TOTAL')!;
    const six = option.creditCard.installments.find((i) => i.count === 6)!;

    expect(six.installmentAmount).toBe(expected);
  });

  it('installment count=12 follows PMT formula with r=2.5%', () => {
    const P = 1000;
    const r = 0.025;
    const n = 12;
    const expected = Math.round((P * r / (1 - Math.pow(1 + r, -n))) * 100) / 100;
    const option = svc.calculate(items(['IPVA', P])).options.find((o) => o.type === 'TOTAL')!;
    const twelve = option.creditCard.installments.find((i) => i.count === 12)!;

    expect(twelve.installmentAmount).toBe(expected);
  });

  it('rounds monetary amounts to 2 decimal places: 0.10 * 95% → 0.10', () => {
    // Math.round(0.095 * 100) / 100 = Math.round(9.5) / 100 = 10/100 = 0.10
    const option = svc.calculate(items(['IPVA', 0.10])).options.find((o) => o.type === 'TOTAL')!;

    expect(option.pix.totalWithDiscount).toBe(0.10);
  });
});
