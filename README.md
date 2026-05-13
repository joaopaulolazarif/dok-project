# dok-project

API NestJS que agrega débitos veiculares de dois provedores externos, calcula juros e devolve opções de pagamento. Construída sobre **DDD + CQS** com dois servidores mock para simular os provedores.

> **Testando o projeto?** Consulte o [Guia de Testes](./main-project/TESTING.md) para instruções completas — testes automatizados, cenários de Circuit Breaker e controle dos providers em runtime.

```
dok-project/
├── provider-one/       # Mock HTTP — respostas JSON  (porta 3001)
├── provider-two/       # Mock HTTP — respostas XML   (porta 3002)
├── main-project/       # API NestJS + TypeScript      (porta 3000)
└── docker-compose.yml
```

---

## Como rodar

### Pré-requisitos

| Ferramenta | Versão mínima |
|---|---|
| Node.js | 24 |
| pnpm | 10 |
| Docker + Compose | qualquer recente |

### Docker (recomendado — sobe os três serviços)

```bash
docker compose up --build
```

### Local (desenvolvimento)

```bash
cp main-project/.env.example main-project/.env

pnpm install   # instala dependências do workspace via Turbo
pnpm dev       # sobe os 3 serviços em paralelo com hot reload
```

### Serviços individualmente

```bash
cd provider-one && node index.js
cd provider-two && node index.js

cd main-project && pnpm dev
```

### Comandos do main-project

```bash
pnpm test          # jest
pnpm test:cov      # cobertura (threshold configurado: 85% global)
pnpm build         # nest build → dist/
pnpm start         # node dist/main
```

### Variáveis de ambiente (main-project)

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `PROVIDER_ONE_URL` | `http://localhost:3001` | URL do provider-one |
| `PROVIDER_TWO_URL` | `http://localhost:3002` | URL do provider-two |
| `INTEREST_REFERENCE_DATE` | data atual | Data de referência para juros (`YYYY-MM-DD`) |
| `CB_TIMEOUT_MS` | `5000` | Timeout por chamada ao provider |
| `CB_ERROR_THRESHOLD_PERCENTAGE` | `50` | % de erros para abrir o circuit breaker |
| `CB_VOLUME_THRESHOLD` | `3` | Mínimo de chamadas antes de verificar o percentual |
| `CB_RESET_TIMEOUT_MS` | `15000` | Tempo em OPEN antes de tentar HALF-OPEN |

### Endpoint principal

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

### Controle dos provedores em runtime

```bash
curl http://localhost:3001/status                          # modo atual

curl -X POST http://localhost:3001/control \
  -H 'Content-Type: application/json' \
  -d '{"mode": "error_500"}'                              # simula falha

curl -X POST http://localhost:3001/control \
  -H 'Content-Type: application/json' \
  -d '{"mode": "timeout", "timeoutMs": 30000}'            # simula timeout

curl -X POST http://localhost:3001/control \
  -H 'Content-Type: application/json' \
  -d '{"mode": "normal"}'                                 # restaura
```

Modos: `normal` | `error_400` | `error_500` | `timeout`. Mesmos endpoints em `:3002`.

---

## Decisões técnicas

### DDD em camadas estritas

O `main-project` é dividido em quatro camadas com dependência unidirecional:

- **domain** — TypeScript puro, sem NestJS, sem `process.env`. Contém aggregates, value objects, domain services e as interfaces (ports) dos provedores externos.
- **application** — Orquestra o domínio. O handler de query é fino; toda a lógica de fallback e montagem de DTO fica no `DebitsAggregationService`.
- **infrastructure** — Adapters concretos: clientes HTTP, mappers JSON/XML → domínio, circuit breaker. Tipos externos não atravessam essa fronteira.
- **interface** — Controller HTTP + Presenter que converte o DTO de aplicação para o view-model em português.

### Circuit breaker com fallback entre provedores

Cada chamada HTTP passa pelo [opossum](https://github.com/nodeshift/opossum). Fluxo:

1. Tenta **provider-one** (JSON).
2. Se falhar → cai no **provider-two** (XML).
3. Se ambos falharem → propaga o erro do segundo.

Erros 4xx não contam para o threshold — um lote de placas inválidas não abre o circuito contra um provider saudável.

### Cálculo de juros em centavos

`InterestCalculatorService` converte valores para centavos inteiros antes de aplicar as taxas, evitando acumulação de erros de ponto flutuante. O resultado é dividido por 100 ao final.

### Trace ID via `AsyncLocalStorage`

`TraceIdMiddleware` gera ou reaproveita o header `x-trace-id` e armazena o ID no `AsyncLocalStorage`. Qualquer ponto do código — logger, clients HTTP — lê `getTraceId()` sem receber o ID como parâmetro.

### Configuração externa só nas bordas

`process.env` é lido **exclusivamente** nos `useFactory` dos módulos NestJS. Domain e application services recebem datas, taxas e URLs via construtor — são instanciáveis com `new` diretamente, o que simplifica os testes.
