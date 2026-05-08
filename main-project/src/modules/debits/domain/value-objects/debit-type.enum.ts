export enum DebitType {
  IPVA = 'IPVA',
  MULTA = 'MULTA',
}

export function isKnownDebitType(value: string): value is DebitType {
  return Object.values(DebitType).includes(value as DebitType);
}
