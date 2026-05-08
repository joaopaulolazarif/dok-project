import { Logger } from '@nestjs/common';
import { DebitType } from '../../../domain/value-objects/debit-type.enum';
import { ProviderTwoMapper } from './provider-two-debit.mapper';

function buildXml(plate: string, debts: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <plate>${plate}</plate>
  <debts>${debts}</debts>
</response>`;
}

function debtXml(category: string, value: number, expiration: string): string {
  return `<debt><category>${category}</category><value>${value}</value><expiration>${expiration}</expiration></debt>`;
}

describe('ProviderTwoMapper', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps XML with 2 <debt> elements to VehicleDebits with 2 debits', () => {
    const xml = buildXml(
      'ABC1234',
      debtXml('IPVA', 1000, '2025-01-01') + debtXml('MULTA', 200, '2025-06-15'),
    );

    const result = ProviderTwoMapper.toDomain(xml);

    expect(result.plate).toBe('ABC1234');
    expect(result.debits).toHaveLength(2);
    expect(result.debits[0].type).toBe(DebitType.IPVA);
    expect(result.debits[1].type).toBe(DebitType.MULTA);
  });

  it('handles a single <debt> element (fast-xml-parser returns object, not array)', () => {
    const xml = buildXml('ABC1234', debtXml('MULTA', 300, '2025-03-10'));

    const result = ProviderTwoMapper.toDomain(xml);

    expect(result.debits).toHaveLength(1);
    expect(result.debits[0].type).toBe(DebitType.MULTA);
    expect(result.debits[0].amount).toBe(300);
  });

  it('ignores debts with unknown category and warns', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    const xml = buildXml(
      'ABC1234',
      debtXml('UNKNOWN', 100, '2025-01-01') + debtXml('IPVA', 500, '2025-06-01'),
    );

    const result = ProviderTwoMapper.toDomain(xml);

    expect(result.debits).toHaveLength(1);
    expect(result.debits[0].type).toBe(DebitType.IPVA);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('UNKNOWN'));
  });

  it('parses expiration in YYYY-MM-DD format to a Date', () => {
    const xml = buildXml('ABC1234', debtXml('IPVA', 1000, '2025-12-31'));

    const result = ProviderTwoMapper.toDomain(xml);
    const dueDate = result.debits[0].dueDate;

    expect(dueDate).toBeInstanceOf(Date);
    expect(dueDate.getUTCFullYear()).toBe(2025);
    expect(dueDate.getUTCMonth()).toBe(11); // 0-indexed
    expect(dueDate.getUTCDate()).toBe(31);
  });
});
