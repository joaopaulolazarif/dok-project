export class InvalidPlateError extends Error {
  constructor(plate: unknown) {
    super(`Invalid plate: ${JSON.stringify(plate)}`);
    this.name = 'InvalidPlateError';
  }
}

export class InvalidDebitsError extends Error {
  constructor(reason: string) {
    super(`Invalid debits: ${reason}`);
    this.name = 'InvalidDebitsError';
  }
}

export class PlateNotFoundError extends Error {
  constructor(plate: string) {
    super(`Plate not found: ${plate}`);
    this.name = 'PlateNotFoundError';
  }
}
