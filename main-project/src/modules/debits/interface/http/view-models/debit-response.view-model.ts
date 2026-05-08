export interface DebitItemViewModel {
  tipo: string;
  valor_original: number;
  valor_atualizado: number;
  vencimento: string;
  dias_atraso: number;
}

export interface DebitSummaryViewModel {
  total_original: number;
  total_atualizado: number;
}

export interface InstallmentViewModel {
  quantidade: number;
  valor_parcela: number;
}

export interface PaymentOptionViewModel {
  tipo: string;
  valor_base: number;
  pix: { total_com_desconto: number };
  cartao_credito: { parcelas: InstallmentViewModel[] };
}

export interface PaymentOptionsViewModel {
  opcoes: PaymentOptionViewModel[];
}

export interface DebitResponseViewModel {
  placa: string;
  debitos: DebitItemViewModel[];
  resumo: DebitSummaryViewModel;
  pagamentos: PaymentOptionsViewModel;
}
