import { PaymentOptionDto, PaymentOptionsDto } from '../../../payment-options/application/dtos/payment-option.dto';
import { DebitResponseDto } from '../../application/dtos/debit.response.dto';
import {
  DebitResponseViewModel,
  PaymentOptionViewModel,
  PaymentOptionsViewModel,
} from './view-models/debit-response.view-model';

const OPTION_TYPE_PT: Record<string, string> = {
  TOTAL: 'TOTAL',
  ONLY_IPVA: 'SOMENTE_IPVA',
  ONLY_MULTA: 'SOMENTE_MULTAS',
};

function presentPaymentOption(option: PaymentOptionDto): PaymentOptionViewModel {
  return {
    tipo: OPTION_TYPE_PT[option.type] ?? option.type,
    valor_base: option.baseAmount,
    pix: {
      total_com_desconto: option.pix.totalWithDiscount,
    },
    cartao_credito: {
      parcelas: option.creditCard.installments.map((i) => ({
        quantidade: i.count,
        valor_parcela: i.installmentAmount,
      })),
    },
  };
}

function presentPaymentOptions(paymentOptions: PaymentOptionsDto): PaymentOptionsViewModel {
  return {
    opcoes: paymentOptions.options.map(presentPaymentOption),
  };
}

export class DebitResponsePresenter {
  static toHttp(dto: DebitResponseDto): DebitResponseViewModel {
    return {
      placa: dto.plate,
      debitos: dto.debits.map((d) => ({
        tipo: d.type,
        valor_original: d.amount,
        valor_atualizado: d.updatedAmount,
        vencimento: d.dueDate,
        dias_atraso: d.daysLate,
      })),
      resumo: {
        total_original: dto.summary.totalAmount,
        total_atualizado: dto.summary.totalUpdatedAmount,
      },
      pagamentos: presentPaymentOptions(dto.paymentOptions),
    };
  }
}
