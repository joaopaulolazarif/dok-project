import { Inject, Injectable, Logger } from '@nestjs/common';
import { PaymentCalculatorService } from '../../../payment-options/domain/services/payment-calculator.service';
import { VehicleDebits } from '../../domain/aggregates/vehicle-debits.aggregate';
import {
  DEBIT_PROVIDER_ONE,
  DEBIT_PROVIDER_TWO,
  IDebitExternalProvider,
} from '../../domain/providers/debit-provider.interface';
import {
  INTEREST_CALCULATOR,
  InterestCalculatorService,
} from '../../domain/services/interest-calculator.service';
import { DebitItemDto, DebitResponseDto } from '../dtos/debit.response.dto';

@Injectable()
export class DebitsAggregationService {
  private readonly logger = new Logger(DebitsAggregationService.name);

  constructor(
    @Inject(DEBIT_PROVIDER_ONE) private readonly providerOne: IDebitExternalProvider,
    @Inject(DEBIT_PROVIDER_TWO) private readonly providerTwo: IDebitExternalProvider,
    @Inject(INTEREST_CALCULATOR) private readonly interestCalculator: InterestCalculatorService,
    private readonly paymentCalculator: PaymentCalculatorService,
  ) {}

  async aggregate(plate: string): Promise<DebitResponseDto> {
    this.logger.log('aggregation started', { plate });
    const vehicleDebits = await this.fetchWithFallback(plate);
    const response = this.buildResponse(vehicleDebits);
    this.logger.log('aggregation completed', {
      plate,
      debitCount: response.debits.length,
      totalUpdatedAmount: response.summary.totalUpdatedAmount,
    });
    return response;
  }

  private async fetchWithFallback(plate: string): Promise<VehicleDebits> {
    try {
      return await this.attempt(plate, 'provider-one', this.providerOne);
    } catch (err) {
      this.logger.warn('provider-one failed — falling back to provider-two', {
        plate,
        error: (err as Error).message,
      });
      return this.attempt(plate, 'provider-two', this.providerTwo);
    }
  }

  private async attempt(
    plate: string,
    name: string,
    provider: IDebitExternalProvider,
  ): Promise<VehicleDebits> {
    this.logger.log('querying provider', { plate, provider: name });
    const start = Date.now();
    try {
      const result = await provider.getDebits(plate);
      this.logger.log('provider responded successfully', {
        plate,
        provider: name,
        durationMs: Date.now() - start,
        debitCount: result.debits.length,
      });
      return result;
    } catch (err) {
      this.logger.warn('provider call failed', {
        plate,
        provider: name,
        durationMs: Date.now() - start,
        error: (err as Error).message,
      });
      throw err;
    }
  }

  private buildResponse(vehicleDebits: VehicleDebits): DebitResponseDto {
    const debits = this.toDebitItems(vehicleDebits);
    return {
      plate: vehicleDebits.plate,
      debits,
      summary: {
        totalAmount: debits.reduce((sum, d) => sum + d.amount, 0),
        totalUpdatedAmount: debits.reduce((sum, d) => sum + d.updatedAmount, 0),
      },
      paymentOptions: this.paymentCalculator.calculate(debits),
    };
  }

  private toDebitItems(vehicleDebits: VehicleDebits): DebitItemDto[] {
    return vehicleDebits.debits.map((d) => ({
      type: d.type,
      amount: d.amount,
      updatedAmount: this.interestCalculator.calculate(d),
      daysLate: this.interestCalculator.daysLate(d.dueDate),
      dueDate: d.dueDate.toISOString().split('T')[0],
    }));
  }
}
