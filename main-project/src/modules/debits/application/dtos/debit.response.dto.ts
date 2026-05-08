import { PaymentOptionsDto } from '../../../payment-options/application/dtos/payment-option.dto';
import { DebitType } from '../../domain/value-objects/debit-type.enum';

export interface DebitItemDto {
  type: DebitType;
  amount: number;
  updatedAmount: number;
  daysLate: number;
  dueDate: string;
}

export interface DebitSummaryDto {
  totalAmount: number;
  totalUpdatedAmount: number;
}

export interface DebitResponseDto {
  plate: string;
  debits: DebitItemDto[];
  summary: DebitSummaryDto;
  paymentOptions: PaymentOptionsDto;
}
