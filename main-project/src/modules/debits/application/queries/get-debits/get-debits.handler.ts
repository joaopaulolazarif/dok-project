import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { DebitResponseDto } from '../../dtos/debit.response.dto';
import { DebitsAggregationService } from '../../services/debits-aggregation.service';
import { GetDebitsQuery } from './get-debits.query';

@QueryHandler(GetDebitsQuery)
export class GetDebitsHandler implements IQueryHandler<GetDebitsQuery, DebitResponseDto> {
  constructor(private readonly aggregationService: DebitsAggregationService) {}

  execute(query: GetDebitsQuery): Promise<DebitResponseDto> {
    return this.aggregationService.aggregate(query.plate);
  }
}
