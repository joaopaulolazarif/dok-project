import { Logger } from '@nestjs/common';
import { VehicleDebits } from '../../../domain/aggregates/vehicle-debits.aggregate';
import { isKnownDebitType } from '../../../domain/value-objects/debit-type.enum';
import { Debit } from '../../../domain/value-objects/debit.vo';

interface ProviderOneDebtItem {
  type: string;
  amount: number;
  due_date: string;
}

export interface ProviderOneResponse {
  vehicle: string;
  debts: ProviderOneDebtItem[];
}

const logger = new Logger('ProviderOneMapper');

export class ProviderOneMapper {
  static toDomain(response: ProviderOneResponse): VehicleDebits {
    const debits = response.debts.flatMap((d) => {
      if (!isKnownDebitType(d.type)) {
        logger.warn(`Unknown debit type ignored: "${d.type}" for plate "${response.vehicle}"`);
        return [];
      }
      return [Debit.create(d.type, d.amount, new Date(d.due_date))];
    });
    return VehicleDebits.create(response.vehicle, debits);
  }
}
