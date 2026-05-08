import { InvalidDebitsError, InvalidPlateError } from './vehicle-debits.errors';

describe('InvalidPlateError', () => {
  it('is an instance of Error and InvalidPlateError', () => {
    const err = new InvalidPlateError('bad');

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(InvalidPlateError);
  });

  it('has name "InvalidPlateError"', () => {
    expect(new InvalidPlateError('x').name).toBe('InvalidPlateError');
  });

  it('includes the plate value in the message', () => {
    expect(new InvalidPlateError('XYZ').message).toContain('XYZ');
  });
});

describe('InvalidDebitsError', () => {
  it('is an instance of Error and InvalidDebitsError', () => {
    const err = new InvalidDebitsError('expected an array');

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(InvalidDebitsError);
  });

  it('has name "InvalidDebitsError"', () => {
    expect(new InvalidDebitsError('reason').name).toBe('InvalidDebitsError');
  });

  it('includes the reason in the message', () => {
    expect(new InvalidDebitsError('expected an array').message).toContain('expected an array');
  });
});
