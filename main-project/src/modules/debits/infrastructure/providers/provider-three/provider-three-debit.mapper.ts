import { Logger } from '@nestjs/common';
import { VehicleDebits } from '../../../domain/aggregates/vehicle-debits.aggregate';
import { isKnownDebitType } from '../../../domain/value-objects/debit-type.enum';
import { Debit } from '../../../domain/value-objects/debit.vo';

const logger = new Logger('ProviderThreeMapper');

export class ProviderThreeMapper {
  static toDomain(csv: string): VehicleDebits {
    const lines = csv.trim().split('\n');
    // skip header: vehicle,type,amount,due_date
    const dataLines = lines.slice(1);

    let plate = '';
    const debits = dataLines.flatMap((line) => {
      const [vehicle, type, amount, due_date] = line.split(',');
      if (!vehicle || !type || !amount || !due_date) return [];
      if (!plate) plate = vehicle.trim();
      const debitType = type.trim();
      if (!isKnownDebitType(debitType)) {
        logger.warn(`Unknown debit type ignored: "${debitType}" for plate "${vehicle.trim()}"`);
        return [];
      }
      return [Debit.create(debitType, Number(amount.trim()), new Date(due_date.trim()))];
    });

    return VehicleDebits.create(plate, debits);
  }
}
