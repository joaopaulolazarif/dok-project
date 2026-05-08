import { Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { PlateNotFoundError } from '../../domain/errors/vehicle-debits.errors';
import { DebitResponseDto } from '../../application/dtos/debit.response.dto';
import { GetDebitsQuery } from '../../application/queries/get-debits/get-debits.query';
import { DebitResponsePresenter } from './debit-response.presenter';
import { DebitResponseViewModel } from './view-models/debit-response.view-model';

@Controller('debits')
export class DebitsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post()
  async getDebits(@Body() body: { placa: string }): Promise<DebitResponseViewModel> {
    try {
      const result: DebitResponseDto = await this.queryBus.execute(new GetDebitsQuery(body.placa));
      return DebitResponsePresenter.toHttp(result);
    } catch (err) {
      if (err instanceof PlateNotFoundError) throw new NotFoundException(err.message);
      throw err;
    }
  }
}
