# main-project

API NestJS que agrega débitos veiculares a partir de dois provedores externos, calcula juros e devolve opções de pagamento (PIX e parcelado).

> **Testando o projeto?** Consulte o [Guia de Testes](./TESTING.md) para instruções completas — testes automatizados, cenários de Circuit Breaker e controle dos providers em runtime.

---

## Como rodar

### Pré-requisitos

| Ferramenta | Versão |
|---|---|
| Node.js | ≥ 24 |
| pnpm | ≥ 10 |

### Com Docker (recomendado — sobe os três serviços)

```bash
# na raiz do monorepo
docker compose up --build
```

| Serviço | URL |
|---|---|
| main-project | http://localhost:3000 |
| provider-one | http://localhost:3001 |
| provider-two | http://localhost:3002 |

### Local (só o main-project)

```bash
cd main-project
cp .env.example .env   # ajuste as URLs se os providers estiverem em outro host
pnpm install
pnpm dev               # hot reload
```

### Comandos disponíveis

```bash
pnpm test          # jest
pnpm test:cov      # cobertura (threshold: 85% global)
pnpm build         # nest build → dist/
pnpm start         # node dist/main
```

### Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `PROVIDER_ONE_URL` | `http://localhost:3001` | URL do provider-one |
| `PROVIDER_TWO_URL` | `http://localhost:3002` | URL do provider-two |
| `INTEREST_REFERENCE_DATE` | data atual | Data de referência para cálculo de juros (`YYYY-MM-DD`) |
| `CB_TIMEOUT_MS` | `5000` | Timeout por chamada HTTP ao provider |
| `CB_ERROR_THRESHOLD_PERCENTAGE` | `50` | % de erros para abrir o circuit breaker |
| `CB_VOLUME_THRESHOLD` | `3` | Mínimo de chamadas antes de verificar o percentual |
| `CB_RESET_TIMEOUT_MS` | `15000` | Tempo em OPEN antes de tentar HALF-OPEN |

### Endpoint

```bash
curl -X POST http://localhost:3000/debits \
  -H 'Content-Type: application/json' \
  -d '{"placa": "ABC1234"}'
```

```json
{
  "placa": "ABC1234",
  "debitos": [
    {
      "tipo": "IPVA",
      "valor_original": 1500.00,
      "valor_atualizado": 1648.50,
      "vencimento": "2024-01-10",
      "dias_atraso": 30
    }
  ],
  "resumo": {
    "total_original": 1500.00,
    "total_atualizado": 1648.50
  },
  "pagamentos": {
    "opcoes": [
      {
        "tipo": "TOTAL",
        "valor_base": 1648.50,
        "pix": { "total_com_desconto": 1566.08 },
        "cartao_credito": {
          "parcelas": [
            { "quantidade": 1,  "valor_parcela": 1648.50 },
            { "quantidade": 6,  "valor_parcela": 299.23 },
            { "quantidade": 12, "valor_parcela": 162.05 }
          ]
        }
      }
    ]
  }
}
```

---

## Decisões técnicas

### DDD em camadas

O projeto segue uma separação estrita em quatro camadas:

- **domain** — TypeScript puro, zero dependências de framework. Contém aggregates (`VehicleDebits`), value objects (`Debit`, `DebitType`), domain services (`InterestCalculatorService`) e as interfaces (ports) dos provedores externos.
- **application** — Orquestra o domínio. O `GetDebitsHandler` é fino: apenas delega para o `DebitsAggregationService`, que controla o fluxo de fallback, cálculo de juros e montagem do DTO.
- **infrastructure** — Adapters concretos: clientes HTTP dos provedores, mappers que traduzem JSON/XML para entidades de domínio, e o circuit breaker.
- **interface** — Controller HTTP + Presenter que converte o DTO de aplicação para o view-model em português.

A regra principal é que **tipos de camadas externas não atravessam para o domínio**: os mappers absorvem 100% da tradução na borda de infra.

### CQS read-side com `@nestjs/cqrs`

O projeto usa apenas `QueryBus` — não há `CommandBus` nem handlers de escrita. A decisão foi explícita: `CqrsModule` entrega o `QueryBus` de graça e o padrão é válido mesmo com só leitura. Commands serão introduzidos quando existir o primeiro caso real de mutação.

### Circuit breaker com fallback entre provedores

O `CircuitBreakerService` envolve cada chamada HTTP via [opossum](https://github.com/nodeshift/opossum). A lógica de resiliência é:

1. Tenta o **provider-one** (JSON).
2. Se falhar (qualquer erro), cai no **provider-two** (XML).
3. Se ambos falharem, propaga o erro do provider-two para o chamador.

Erros 4xx **não contam** para o threshold do circuit breaker — um lote de placas inválidas não abre o circuito contra um provider saudável.

### Cálculo de juros em centavos

`InterestCalculatorService` converte todos os valores para centavos inteiros antes de aplicar as taxas, evitando acumulação de erros de ponto flutuante. O resultado final é dividido por 100 de volta para reais.

### Trace ID via `AsyncLocalStorage`

O `TraceIdMiddleware` gera ou reaproveita o header `x-trace-id` e armazena o ID no `AsyncLocalStorage`. Qualquer ponto do código (logger, clients HTTP) pode ler `getTraceId()` sem receber o ID como parâmetro, sem acoplamento ao framework.

### Configuração externa só nas bordas

`process.env` é lido **exclusivamente** nos `useFactory` dos módulos NestJS. Domain e application services recebem datas, taxas e URLs via construtor — são instanciáveis e testáveis com `new` diretamente.

---

## Trade-offs

| Decisão | Benefício | Custo |
|---|---|---|
| Dois bounded contexts (`debits` + `payment-options`) | Separação de responsabilidades clara; `PaymentCalculatorService` é reutilizável | Mais arquivos e indireção para uma feature pequena |
| Circuit breaker real (opossum) em vez de retry simples | Proteção automática contra cascade failure; configurável por env | Testes precisam de instâncias reais e timers; opossum tem estado interno que vaza entre suítes sem cuidado |
| `AsyncLocalStorage` para trace propagation | Sem prop-drilling do traceId por todo o call stack | Comportamento implícito — difícil de rastrear só lendo o código; requer conhecimento da API |
| Opossum injetado diretamente (sem interface) | Menos abstração | `CircuitBreakerService` é difícil de substituir por um fake; testes de client dependem da instância real |
| Cálculo de juros em centavos | Elimina erros de ponto flutuante em produção | Código ligeiramente menos legível (`amountCents`, `interestCents`) |
| Sem persistência | Foco em DDD/resiliência sem ruído de banco | Dados não sobrevivem a restart; sem histórico de consultas |

---

## Melhorias futuras

**Robustez**
- Adicionar interface `ICircuitBreaker` para desacoplar opossum dos adapters, permitindo fakes limpos em testes de client.
- Health check endpoint (`/health`) expondo estado dos circuit breakers (CLOSED/OPEN/HALF-OPEN) de cada provider.
- Retry com back-off exponencial antes de acionar o fallback para erros transitórios (ex.: timeout pontual).

**Observabilidade**
- Métricas Prometheus (contador de fallbacks, latência por provider, taxa de abertura do circuit breaker).
- Structured logging já está no lugar; próximo passo é exportar para um agregador (Loki, Datadog).

**Domínio**
- Persistência da consulta para auditoria (quem consultou qual placa e quando).
- Commands para o write-side quando surgir o primeiro caso de mutação (ex.: marcar um débito como pago).
- Suporte a novos tipos de débito sem alterar o core: hoje `DebitType` é um enum fechado; poderia ser um registro configurável.

**Operação**
- Variável `INTEREST_REFERENCE_DATE` é útil para testes determinísticos mas perigosa em produção (fácil de esquecer setada). Adicionar validação que avisa quando a data está muito defasada da data atual.
- Rate limiting no endpoint `/debits` para proteger os providers de consultas em rajada.
