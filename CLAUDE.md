# CLAUDE.md

Guia para o Claude Code trabalhar neste repositório. Foco: **`main-project`**. Os mocks `provider-one` e `provider-two` existem apenas como dependências externas e não são alvo de desenvolvimento.

## Estrutura do monorepo

```
dok-project/
├── provider-one/      # Mock externo (port 3001) — não modificar
├── provider-two/      # Mock externo (port 3002) — não modificar
├── main-project/      # NestJS + DDD (port 3000) — alvo principal
└── docker-compose.yml
```

> Os providers são servidores Node.js de teste que retornam dados de débitos veiculares com modos controláveis (`normal | error_400 | error_500 | timeout`) via `POST /control`. Trate-os como APIs externas estáveis.

---

# main-project

NestJS + TypeScript que agrega débitos veiculares vindos dos dois providers, calcula juros e gera opções de pagamento (PIX e parcelado). Usa Circuit Breaker no acesso aos providers e fallback entre eles.

## Comandos

```bash
cd main-project
npm install
npm run start:dev      # watch mode
npm run build          # nest build → dist/
npm run start          # node dist/main
npm test               # jest
npm run test:cov       # cobertura
npm run lint           # eslint --fix
```

Subir tudo (main + providers):
```bash
docker compose up --build
```

## Variáveis de ambiente

Copie `.env.example` para `.env`. Principais:

| Var | Descrição |
|---|---|
| `PORT` | Porta HTTP (default 3000) |
| `PROVIDER_ONE_URL` / `PROVIDER_TWO_URL` | URLs dos mocks |
| `INTEREST_REFERENCE_DATE` | Data de referência (YYYY-MM-DD) para cálculo de juros — útil em testes determinísticos |
| `CB_*` | Tunables do Circuit Breaker (opossum) |

`process.env` **só é lido na borda** (factories de módulo, `main.ts`). Domínio e application nunca acessam env diretamente.

## Arquitetura (DDD + CQS read-side)

> **Nota sobre CQRS:** o projeto usa `@nestjs/cqrs` apenas pelo `QueryBus`. Não há comandos (escrita) hoje. Quando aparecer mutação real, criar `CommandHandler` em `application/commands/<name>/`. Não criar commands fictícios só para "completar o padrão".


```
src/
├── shared/domain/                  # Bases reutilizáveis (puro TS, sem Nest)
│   └── value-object.base.ts
└── modules/
    ├── debits/                     # Bounded context principal
    │   ├── domain/
    │   │   ├── aggregates/         # VehicleDebits
    │   │   ├── value-objects/      # Debit, DebitType
    │   │   ├── services/           # InterestCalculatorService (puro)
    │   │   └── providers/          # IDebitExternalProvider (port)
    │   ├── application/
    │   │   ├── queries/<name>/     # query.ts + handler.ts (@QueryHandler — fino)
    │   │   ├── services/           # Application services (orquestração — DebitsAggregationService)
    │   │   └── dtos/
    │   ├── infrastructure/
    │   │   ├── providers/          # Adapters HTTP (provider-one, provider-two) + mappers
    │   │   └── circuit-breaker/    # Wrapper opossum
    │   ├── interface/http/         # Controller + Presenter
    │   └── debits.module.ts
    └── payment-options/            # Bounded context auxiliar
        ├── domain/
        │   ├── services/           # PaymentCalculatorService (puro)
        │   └── types/              # PayableItem (contrato genérico)
        └── application/dtos/
```

### Camadas (regras invioláveis)

- **domain** — TypeScript puro. **Sem** `@Injectable()`, `process.env`, axios, NestJS, libs de I/O. Só lógica de negócio.
- **application** — orquestra domínio. Queries via `QueryBus` (`@QueryHandler`). Application services concretos podem ficar em `application/services/` quando o handler ficar gordo (ver `DebitsAggregationService`).
- **infrastructure** — adapters concretos (HTTP clients, circuit breaker, persistência). Implementam ports definidas no domain.
- **interface** — controllers HTTP. Recebem DTOs de entrada, despacham via bus, retornam ViewModel via Presenter.

### Convenções

- **Controllers nunca importam handlers.** Sempre `queryBus.execute(new XQuery(...))` (e `commandBus.execute(...)` quando comandos forem introduzidos).
- **Ports do domínio** exportam um `Symbol` token ao lado da interface (ex.: `DEBIT_PROVIDER_ONE`, `INTEREST_CALCULATOR`). Quem injeta usa `@Inject(TOKEN)`.
- **Configuração externa** (datas, taxas, env) entra via **factory provider** no `*.module.ts` — nunca dentro do domain service.
  ```ts
  {
    provide: INTEREST_CALCULATOR,
    useFactory: () => new InterestCalculatorService(
      process.env.INTEREST_REFERENCE_DATE
        ? new Date(process.env.INTEREST_REFERENCE_DATE)
        : new Date(),
    ),
  }
  ```
- **Cross-module**: módulos não importam tipos uns dos outros. Defina contratos próprios (ex.: `payment-options/domain/types/PayableItem`) e deixe que compatibilidade estrutural do TS resolva.
- **Mappers** ficam em `infrastructure/providers/<provider>/`. Traduzem 100% do payload externo → entidades de domínio. Tipos HTTP/axios não atravessam essa fronteira.
- **Aggregates / eventos de domínio**: ainda não há demanda. Quando aparecer, reintroduzir `AggregateRoot` base e o event publisher — não manter código morto antecipando isso.

### Módulo de referência

Use **`debits`** como template ao criar novos módulos. Ele exemplifica todas as convenções acima (port + adapter, factory provider, query handler fino + application service, presenter, circuit breaker em adapter de infra).

## Endpoint principal

`POST /debits` com body `{ "placa": "ABC1234" }` → agrega débitos dos dois providers (provider-one preferencial, fallback para provider-two), aplica juros e devolve opções de pagamento.

## Controlando os providers em runtime

Sem reiniciar nada:
```bash
curl -X POST http://localhost:3001/control -H 'Content-Type: application/json' \
  -d '{"mode": "error_500"}'
curl -X POST http://localhost:3001/control -H 'Content-Type: application/json' \
  -d '{"mode": "timeout", "timeoutMs": 30000}'
curl -X POST http://localhost:3001/control -H 'Content-Type: application/json' \
  -d '{"mode": "normal"}'
curl http://localhost:3001/status
```
Modos: `normal | error_400 | error_500 | timeout`. Mesmos endpoints em `:3002`.
