import { DebitType } from '../../domain/value-objects/debit-type.enum';
import { DebitResponseDto } from '../../application/dtos/debit.response.dto';
import { DebitResponsePresenter } from './debit-response.presenter';

function makeDto(overrides: Partial<DebitResponseDto> = {}): DebitResponseDto {
  return {
    plate: 'ABC1234',
    debits: [],
    summary: { totalAmount: 0, totalUpdatedAmount: 0 },
    paymentOptions: { options: [] },
    ...overrides,
  };
}

describe('DebitResponsePresenter', () => {
  describe('payment option type mapping', () => {
    it('maps TOTAL → tipo "TOTAL"', () => {
      const dto = makeDto({
        paymentOptions: {
          options: [
            {
              type: 'TOTAL',
              baseAmount: 1000,
              pix: { totalWithDiscount: 950 },
              creditCard: { installments: [] },
            },
          ],
        },
      });

      const vm = DebitResponsePresenter.toHttp(dto);

      expect(vm.pagamentos.opcoes[0].tipo).toBe('TOTAL');
    });

    it('maps ONLY_IPVA → tipo "SOMENTE_IPVA"', () => {
      const dto = makeDto({
        paymentOptions: {
          options: [
            {
              type: 'ONLY_IPVA',
              baseAmount: 500,
              pix: { totalWithDiscount: 475 },
              creditCard: { installments: [] },
            },
          ],
        },
      });

      const vm = DebitResponsePresenter.toHttp(dto);

      expect(vm.pagamentos.opcoes[0].tipo).toBe('SOMENTE_IPVA');
    });

    it('maps ONLY_MULTA → tipo "SOMENTE_MULTAS"', () => {
      const dto = makeDto({
        paymentOptions: {
          options: [
            {
              type: 'ONLY_MULTA',
              baseAmount: 200,
              pix: { totalWithDiscount: 190 },
              creditCard: { installments: [] },
            },
          ],
        },
      });

      const vm = DebitResponsePresenter.toHttp(dto);

      expect(vm.pagamentos.opcoes[0].tipo).toBe('SOMENTE_MULTAS');
    });

    it('keeps unmapped type as-is', () => {
      const dto = makeDto({
        paymentOptions: {
          options: [
            {
              type: 'ONLY_FOO',
              baseAmount: 100,
              pix: { totalWithDiscount: 95 },
              creditCard: { installments: [] },
            },
          ],
        },
      });

      const vm = DebitResponsePresenter.toHttp(dto);

      expect(vm.pagamentos.opcoes[0].tipo).toBe('ONLY_FOO');
    });
  });

  describe('structural mapping', () => {
    it('maps a full DTO to the correct DebitResponseViewModel shape', () => {
      const dto: DebitResponseDto = {
        plate: 'ABC1234',
        debits: [
          {
            type: DebitType.IPVA,
            amount: 1000,
            updatedAmount: 1099,
            daysLate: 30,
            dueDate: '2026-01-01',
          },
        ],
        summary: { totalAmount: 1000, totalUpdatedAmount: 1099 },
        paymentOptions: {
          options: [
            {
              type: 'TOTAL',
              baseAmount: 1099,
              pix: { totalWithDiscount: 1044.05 },
              creditCard: {
                installments: [{ count: 1, installmentAmount: 1099 }],
              },
            },
          ],
        },
      };

      const vm = DebitResponsePresenter.toHttp(dto);

      expect(vm.placa).toBe('ABC1234');
      expect(vm.debitos[0].tipo).toBe(DebitType.IPVA);
      expect(vm.debitos[0].valor_original).toBe(1000);
      expect(vm.debitos[0].valor_atualizado).toBe(1099);
      expect(vm.debitos[0].dias_atraso).toBe(30);
      expect(vm.resumo.total_original).toBe(1000);
      expect(vm.resumo.total_atualizado).toBe(1099);
      expect(vm.pagamentos.opcoes[0].tipo).toBe('TOTAL');
      expect(vm.pagamentos.opcoes[0].valor_base).toBe(1099);
    });
  });
});
