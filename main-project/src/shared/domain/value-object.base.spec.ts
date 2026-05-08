import { ValueObject } from './value-object.base';

interface TestProps extends Record<string, unknown> {
  x: number;
  y: string;
}

class TestVO extends ValueObject<TestProps> {
  static create(x: number, y: string): TestVO {
    return new TestVO({ x, y });
  }
}

describe('ValueObject', () => {
  describe('equals', () => {
    it('returns true when props are identical', () => {
      expect(TestVO.create(1, 'a').equals(TestVO.create(1, 'a'))).toBe(true);
    });

    it('returns false when a prop differs', () => {
      expect(TestVO.create(1, 'a').equals(TestVO.create(2, 'a'))).toBe(false);
    });

    it('returns false when other is undefined', () => {
      expect(TestVO.create(1, 'a').equals(undefined)).toBe(false);
    });

    it('returns false when other is not a ValueObject instance', () => {
      expect(TestVO.create(1, 'a').equals({} as ValueObject<TestProps>)).toBe(false);
    });
  });

  describe('props immutability', () => {
    it('props are frozen after construction', () => {
      const vo = TestVO.create(1, 'a');
      expect(Object.isFrozen((vo as unknown as { props: TestProps }).props)).toBe(true);
    });
  });
});
