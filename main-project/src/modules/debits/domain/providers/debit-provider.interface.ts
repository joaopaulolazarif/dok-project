import { VehicleDebits } from '../aggregates/vehicle-debits.aggregate';

export const DEBIT_PROVIDER_ONE = Symbol('DEBIT_PROVIDER_ONE');
export const DEBIT_PROVIDER_TWO = Symbol('DEBIT_PROVIDER_TWO');

export interface IDebitExternalProvider {
  getDebits(plate: string): Promise<VehicleDebits>;
}
