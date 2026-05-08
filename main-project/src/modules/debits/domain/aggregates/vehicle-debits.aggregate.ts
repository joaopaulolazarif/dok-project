import { InvalidDebitsError, InvalidPlateError } from '../errors/vehicle-debits.errors';
import { Debit } from '../value-objects/debit.vo';

export class VehicleDebits {
  private constructor(
    private readonly _plate: string,
    private readonly _debits: Debit[],
  ) {}

  get plate(): string {
    return this._plate;
  }

  get debits(): Debit[] {
    return [...this._debits];
  }

  static create(plate: string, debits: Debit[]): VehicleDebits {
    const normalizedPlate = typeof plate === 'string' ? plate.trim().toUpperCase() : '';
    if (!normalizedPlate) {
      throw new InvalidPlateError(plate);
    }
    if (!Array.isArray(debits)) {
      throw new InvalidDebitsError('expected an array');
    }
    return new VehicleDebits(normalizedPlate, debits);
  }
}
