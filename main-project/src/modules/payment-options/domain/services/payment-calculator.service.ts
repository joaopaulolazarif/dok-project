import { PaymentOptionDto, PaymentOptionsDto } from '../../application/dtos/payment-option.dto';
import { PayableItem } from '../types/payable-item';

const PIX_DISCOUNT_RATE = 0.05;
const CREDIT_MONTHLY_RATE = 0.025;
const DISPLAYED_INSTALLMENTS = [1, 6, 12];

export class PaymentCalculatorService {
  calculate(items: PayableItem[]): PaymentOptionsDto {
    const options: PaymentOptionDto[] = [];

    const totalBase = round2(items.reduce((sum, d) => sum + d.updatedAmount, 0));
    if (totalBase > 0) {
      options.push(this.buildOption('TOTAL', totalBase));
    }

    const distinctTypes = [...new Set(items.map((d) => d.type))];
    for (const type of distinctTypes) {
      const typeBase = round2(
        items.filter((d) => d.type === type).reduce((sum, d) => sum + d.updatedAmount, 0),
      );
      if (typeBase > 0) {
        options.push(this.buildOption(`ONLY_${type}`, typeBase));
      }
    }

    return { options };
  }

  private buildOption(type: string, baseAmount: number): PaymentOptionDto {
    return {
      type,
      baseAmount,
      pix: {
        totalWithDiscount: round2(baseAmount * (1 - PIX_DISCOUNT_RATE)),
      },
      creditCard: {
        installments: DISPLAYED_INSTALLMENTS.map((n) => ({
          count: n,
          installmentAmount:
            n === 1
              ? baseAmount
              : round2((baseAmount * Math.pow(1 + CREDIT_MONTHLY_RATE, n)) / n),
        })),
      },
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
