import { Logger } from '@nestjs/common';
import { DebitType } from '../../../domain/value-objects/debit-type.enum';
import { ProviderOneMapper, ProviderOneResponse } from './provider-one-debit.mapper';

describe('ProviderOneMapper', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps a valid response with 2 debts to VehicleDebits', () => {
    const response: ProviderOneResponse = {
      vehicle: 'abc1234',
      debts: [
        { type: 'IPVA', amount: 1000, due_date: '2025-01-01' },
        { type: 'MULTA', amount: 200, due_date: '2025-06-15' },
      ],
    };

    const result = ProviderOneMapper.toDomain(response);

    expect(result.plate).toBe('ABC1234');
    expect(result.debits).toHaveLength(2);
    expect(result.debits[0].type).toBe(DebitType.IPVA);
    expect(result.debits[1].type).toBe(DebitType.MULTA);
  });

  it('ignores debts with unknown type and warns, keeping valid ones', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    const response: ProviderOneResponse = {
      vehicle: 'ABC1234',
      debts: [
        { type: 'UNKNOWN_TYPE', amount: 500, due_date: '2025-01-01' },
        { type: 'MULTA', amount: 200, due_date: '2025-06-15' },
      ],
    };

    const result = ProviderOneMapper.toDomain(response);

    expect(result.debits).toHaveLength(1);
    expect(result.debits[0].type).toBe(DebitType.MULTA);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('UNKNOWN_TYPE'),
    );
  });

  it('returns empty debits array when all debt types are unknown', () => {
    const response: ProviderOneResponse = {
      vehicle: 'ABC1234',
      debts: [
        { type: 'FOO', amount: 100, due_date: '2025-01-01' },
        { type: 'BAR', amount: 200, due_date: '2025-06-15' },
      ],
    };

    const result = ProviderOneMapper.toDomain(response);

    expect(result.plate).toBe('ABC1234');
    expect(result.debits).toHaveLength(0);
  });
});
