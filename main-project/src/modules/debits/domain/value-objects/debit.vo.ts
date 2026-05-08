import { ValueObject } from '../../../../shared/domain/value-object.base';
import { DebitType } from './debit-type.enum';

interface DebitProps extends Record<string, unknown> {
  type: DebitType;
  amount: number;
  dueDate: Date;
}

export class Debit extends ValueObject<DebitProps> {
  get type(): DebitType {
    return this.props.type;
  }

  get amount(): number {
    return this.props.amount;
  }

  get dueDate(): Date {
    return this.props.dueDate;
  }

  static create(type: DebitType, amount: number, dueDate: Date): Debit {
    return new Debit({ type, amount, dueDate });
  }
}
