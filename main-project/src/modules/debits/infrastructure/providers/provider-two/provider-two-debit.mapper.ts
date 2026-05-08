import { Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { VehicleDebits } from '../../../domain/aggregates/vehicle-debits.aggregate';
import { isKnownDebitType } from '../../../domain/value-objects/debit-type.enum';
import { Debit } from '../../../domain/value-objects/debit.vo';

interface ProviderTwoDebtItem {
  category: string;
  value: number;
  expiration: string;
}

interface ProviderTwoXmlResponse {
  response: {
    plate: string;
    debts: {
      debt: ProviderTwoDebtItem | ProviderTwoDebtItem[];
    };
  };
}

const logger = new Logger('ProviderTwoMapper');

export class ProviderTwoMapper {
  private static readonly parser = new XMLParser({ ignoreAttributes: false });

  static toDomain(xml: string): VehicleDebits {
    const parsed = this.parser.parse(xml) as ProviderTwoXmlResponse;
    const { plate, debts } = parsed.response;

    // fast-xml-parser returns a single object when there's only one child element
    const debtArray = Array.isArray(debts.debt) ? debts.debt : [debts.debt];

    const domainDebits = debtArray.flatMap((d) => {
      if (!isKnownDebitType(d.category)) {
        logger.warn(`Unknown debit type ignored: "${d.category}" for plate "${plate}"`);
        return [];
      }
      return [Debit.create(d.category, Number(d.value), new Date(String(d.expiration)))];
    });

    return VehicleDebits.create(String(plate), domainDebits);
  }
}
