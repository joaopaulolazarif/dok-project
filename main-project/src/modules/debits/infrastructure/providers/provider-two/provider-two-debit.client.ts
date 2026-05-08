import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { VehicleDebits } from '../../../domain/aggregates/vehicle-debits.aggregate';
import { PlateNotFoundError } from '../../../domain/errors/vehicle-debits.errors';
import { IDebitExternalProvider } from '../../../domain/providers/debit-provider.interface';
import { TRACE_ID_HEADER, getTraceId } from '../../../../../shared/logging';
import { CircuitBreakerService } from '../../circuit-breaker/circuit-breaker.service';
import { ProviderTwoMapper } from './provider-two-debit.mapper';

export class ProviderTwoDebitClient implements IDebitExternalProvider {
  private readonly logger = new Logger(ProviderTwoDebitClient.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly baseUrl: string,
  ) {}

  getDebits(plate: string): Promise<VehicleDebits> {
    return this.circuitBreaker.fire('provider-two', () => this.fetchDebits(plate));
  }

  private async fetchDebits(plate: string): Promise<VehicleDebits> {
    const url = `${this.baseUrl}/debits`;
    const start = Date.now();
    this.logger.debug('outbound HTTP call', { provider: 'provider-two', method: 'POST', url, plate });

    try {
      const response = await lastValueFrom(
        this.httpService.post<string>(
          url,
          { placa: plate },
          { responseType: 'text', headers: traceHeaders() },
        ),
      );
      this.logger.debug('outbound HTTP response', {
        provider: 'provider-two',
        url,
        statusCode: response.status,
        durationMs: Date.now() - start,
      });
      return ProviderTwoMapper.toDomain(response.data);
    } catch (err) {
      const e = err as { message: string; response?: { status?: number } };
      this.logger.warn('outbound HTTP failed', {
        provider: 'provider-two',
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
