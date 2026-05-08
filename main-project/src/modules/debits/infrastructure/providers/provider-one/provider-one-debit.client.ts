import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { VehicleDebits } from '../../../domain/aggregates/vehicle-debits.aggregate';
import { PlateNotFoundError } from '../../../domain/errors/vehicle-debits.errors';
import { IDebitExternalProvider } from '../../../domain/providers/debit-provider.interface';
import { TRACE_ID_HEADER, getTraceId } from '../../../../../shared/logging';
import { CircuitBreakerService } from '../../circuit-breaker/circuit-breaker.service';
import { ProviderOneMapper, ProviderOneResponse } from './provider-one-debit.mapper';

export class ProviderOneDebitClient implements IDebitExternalProvider {
  private readonly logger = new Logger(ProviderOneDebitClient.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly baseUrl: string,
  ) {}

  getDebits(plate: string): Promise<VehicleDebits> {
    return this.circuitBreaker.fire('provider-one', () => this.fetchDebits(plate));
  }

  private async fetchDebits(plate: string): Promise<VehicleDebits> {
    const url = `${this.baseUrl}/debits`;
    const start = Date.now();
    this.logger.debug('outbound HTTP call', { provider: 'provider-one', method: 'POST', url, plate });

    try {
      const response = await lastValueFrom(
        this.httpService.post<ProviderOneResponse>(
          url,
          { placa: plate },
          { headers: traceHeaders() },
        ),
      );
      this.logger.debug('outbound HTTP response', {
        provider: 'provider-one',
        url,
        statusCode: response.status,
        durationMs: Date.now() - start,
      });
      return ProviderOneMapper.toDomain(response.data);
    } catch (err) {
      const e = err as { message: string; response?: { status?: number } };
      this.logger.warn('outbound HTTP failed', {
        provider: 'provider-one',
        url,
        statusCode: e.response?.status,
        durationMs: Date.now() - start,
        error: e.message,
      });
      if (e.response?.status === 404) throw new PlateNotFoundError(plate);
      throw err;
    }
  }
}

function traceHeaders(): Record<string, string> {
  const traceId = getTraceId();
  return traceId ? { [TRACE_ID_HEADER]: traceId } : {};
}
