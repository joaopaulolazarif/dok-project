export interface InstallmentDto {
  count: number;
  installmentAmount: number;
}

export interface PixDto {
  totalWithDiscount: number;
}

export interface CreditCardDto {
  installments: InstallmentDto[];
}

export interface PaymentOptionDto {
  type: string;
  baseAmount: number;
  pix: PixDto;
  creditCard: CreditCardDto;
}

export interface PaymentOptionsDto {
  options: PaymentOptionDto[];
}
