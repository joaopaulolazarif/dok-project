import { HttpModule, HttpService } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PaymentOptionsModule } from '../payment-options/payment-options.module';
import { GetDebitsHandler } from './application/queries/get-debits/get-debits.handler';
import { DebitsAggregationService } from './application/services/debits-aggregation.service';
import { DEBIT_PROVIDER_ONE, DEBIT_PROVIDER_TWO } from './domain/providers/debit-provider.interface';
import {
  INTEREST_CALCULATOR,
  InterestCalculatorService,
} from './domain/services/interest-calculator.service';
import { DEFAULT_INTEREST_RULES } from './domain/services/interest-rules.config';
import { CircuitBreakerService } from './infrastructure/circuit-breaker/circuit-breaker.service';
import { ProviderOneDebitClient } from './infrastructure/providers/provider-one/provider-one-debit.client';
import { ProviderTwoDebitClient } from './infrastructure/providers/provider-two/provider-two-debit.client';
import { DebitsController } from './interface/http/debits.controller';

@Module({
  imports: [CqrsModule, HttpModule, PaymentOptionsModule],
  controllers: [DebitsController],
  providers: [
    GetDebitsHandler,
    DebitsAggregationService,
    CircuitBreakerService,
    {
      provide: DEBIT_PROVIDER_ONE,
      useFactory: (http: HttpService, cb: CircuitBreakerService) =>
        new ProviderOneDebitClient(
          http,
          cb,
          process.env.PROVIDER_ONE_URL ?? 'http://localhost:3001',
        ),
      inject: [HttpService, CircuitBreakerService],
    },
    {
      provide: DEBIT_PROVIDER_TWO,
      useFactory: (http: HttpService, cb: CircuitBreakerService) =>
        new ProviderTwoDebitClient(
          http,
          cb,
          process.env.PROVIDER_TWO_URL ?? 'http://localhost:3002',
        ),
      inject: [HttpService, CircuitBreakerService],
    },
    {
      provide: INTEREST_CALCULATOR,
      useFactory: () => {
        const raw = process.env.INTEREST_REFERENCE_DATE;
        const referenceDate = raw ? new Date(raw) : new Date();
        return new InterestCalculatorService(referenceDate, DEFAULT_INTEREST_RULES);
      },
    },
  ],
})
export class DebitsModule {}
