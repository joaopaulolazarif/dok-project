import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { PlateNotFoundError } from '../../domain/errors/vehicle-debits.errors';
import { DebitResponseDto } from '../../application/dtos/debit.response.dto';
import { GetDebitsQuery } from '../../application/queries/get-debits/get-debits.query';
import { DebitsController } from './debits.controller';

const mockDto: DebitResponseDto = {
  plate: 'ABC1234',
  debits: [],
  summary: { totalAmount: 0, totalUpdatedAmount: 0 },
  paymentOptions: { options: [] },
};

describe('DebitsController', () => {
  let controller: DebitsController;
  let queryBus: jest.Mocked<Pick<QueryBus, 'execute'>>;

  beforeEach(async () => {
    queryBus = { execute: jest.fn().mockResolvedValue(mockDto) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DebitsController],
      providers: [{ provide: QueryBus, useValue: queryBus }],
    }).compile();

    controller = module.get(DebitsController);
  });

  it('calls queryBus.execute with a GetDebitsQuery carrying the plate', async () => {
    await controller.getDebits({ placa: 'ABC1234' });

    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetDebitsQuery));
    const query: GetDebitsQuery = (queryBus.execute as jest.Mock).mock.calls[0][0];
    expect(query.plate).toBe('ABC1234');
  });

  it('returns the view-model produced by the presenter (placa in PT-BR)', async () => {
    const vm = await controller.getDebits({ placa: 'ABC1234' });

    expect(vm).toHaveProperty('placa', 'ABC1234');
  });

  it('PlateNotFoundError from queryBus → throws NotFoundException (HTTP 404)', async () => {
    (queryBus.execute as jest.Mock).mockRejectedValue(new PlateNotFoundError('XYZ9999'));

    await expect(controller.getDebits({ placa: 'XYZ9999' })).rejects.toThrow(NotFoundException);
  });
});
