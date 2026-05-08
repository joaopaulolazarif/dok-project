import { DebitsAggregationService } from '../../services/debits-aggregation.service';
import { DebitResponseDto } from '../../dtos/debit.response.dto';
import { GetDebitsHandler } from './get-debits.handler';
import { GetDebitsQuery } from './get-debits.query';

const mockDto: DebitResponseDto = {
  plate: 'ABC1234',
  debits: [],
  summary: { totalAmount: 0, totalUpdatedAmount: 0 },
  paymentOptions: { options: [] },
};

describe('GetDebitsHandler', () => {
  let aggregationService: jest.Mocked<Pick<DebitsAggregationService, 'aggregate'>>;
  let handler: GetDebitsHandler;

  beforeEach(() => {
    aggregationService = { aggregate: jest.fn() };
    handler = new GetDebitsHandler(
      aggregationService as unknown as DebitsAggregationService,
    );
  });

  it('delegates to aggregationService.aggregate with the plate from the query', async () => {
    aggregationService.aggregate.mockResolvedValue(mockDto);

    await handler.execute(new GetDebitsQuery('ABC1234'));

    expect(aggregationService.aggregate).toHaveBeenCalledWith('ABC1234');
  });

  it('returns the DTO resolved by the aggregation service', async () => {
    aggregationService.aggregate.mockResolvedValue(mockDto);

    const result = await handler.execute(new GetDebitsQuery('ABC1234'));

    expect(result).toBe(mockDto);
  });

  it('propagates rejections from the aggregation service', async () => {
    aggregationService.aggregate.mockRejectedValue(new Error('aggregation failed'));

    await expect(handler.execute(new GetDebitsQuery('ABC1234'))).rejects.toThrow(
      'aggregation failed',
    );
  });
});
