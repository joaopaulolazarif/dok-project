import { Module } from '@nestjs/common';
import { DebitsModule } from './modules/debits/debits.module';
import { LoggingModule } from './shared/logging';

@Module({
  imports: [LoggingModule, DebitsModule],
})
export class AppModule {}
