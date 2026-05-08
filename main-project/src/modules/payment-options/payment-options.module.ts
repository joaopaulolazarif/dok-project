import { Module } from '@nestjs/common';
import { PaymentCalculatorService } from './domain/services/payment-calculator.service';

@Module({
  providers: [PaymentCalculatorService],
  exports: [PaymentCalculatorService],
})
export class PaymentOptionsModule {}
