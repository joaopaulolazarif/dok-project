# Guia de Testes

Este documento explica como testar o **main-project**: desde rodar a suíte automatizada até simular falhas de provider e acionar o Circuit Breaker em tempo real.

---

## Índice

1. [Testes automatizados](#testes-automatizados)
2. [Testes manuais com curl](#testes-manuais-com-curl)
3. [Circuit Breaker — o que é e como funciona](#circuit-breaker)
4. [Cenários de teste dos providers](#cenários-de-teste-dos-providers)
5. [Variáveis de ambiente relevantes para testes](#variáveis-de-ambiente-relevantes-para-testes)

---

## Testes automatizados

### Pré-requisitos

```bash
cd main-project
cp .env.example .env
pnpm install
```

### Comandos

| Comando | O que faz |
|---|---|
| `pnpm test` | Roda todos os testes (unit + integração) |
| `pnpm test:cov` | Roda com relatório de cobertura (threshold global: 85%) |
| `pnpm test -- --testPathPattern="circuit-breaker"` | Roda apenas os testes do Circuit Breaker |
| `pnpm test -- --testPathPattern="integration"` | Roda apenas os testes de integração |
| `pnpm test -- --watch` | Modo watch para desenvolvimento |

### Estrutura dos testes

```
src/
├── shared/domain/value-object.base.spec.ts        # ValueObject base
├── shared/logging/
│   ├── app-logger.service.spec.ts
│   ├── http-logging.interceptor.spec.ts
│   ├── trace-context.spec.ts
│   └── trace-id.middleware.spec.ts
└── modules/debits/
    ├── domain/
    │   ├── aggregates/vehicle-debits.aggregate.spec.ts
    │   ├── errors/vehicle-debits.errors.spec.ts
    │   ├── services/interest-calculator.service.spec.ts
    │   └── value-objects/debit-type.enum.spec.ts, debit.vo.spec.ts
    ├── application/
    │   ├── queries/get-debits/get-debits.handler.spec.ts
    │   └── services/debits-aggregation.service.spec.ts
    ├── infrastructure/
    │   ├── circuit-breaker/circuit-breaker.service.spec.ts  ← leia com atenção
    │   └── providers/
    │       ├── provider-one/provider-one-debit.client.spec.ts
    │       ├── provider-one/provider-one-debit.mapper.spec.ts
    │       ├── provider-two/provider-two-debit.client.spec.ts
    │       └── provider-two/provider-two-debit.mapper.spec.ts
    └── interface/http/
        ├── debits.controller.spec.ts
        └── debit-response.presenter.spec.ts

test/
└── integration/debits-flow.spec.ts  ← testes end-to-end (nock + supertest)
```

### Testes de integração

Os testes em `test/integration/debits-flow.spec.ts` sobem o `AppModule` inteiro com o NestJS e interceptam as chamadas HTTP para os providers com [nock](https://github.com/nock/nock). Não é necessário ter os providers rodando.

Cenários cobertos:

| Teste | O que verifica |
|---|---|
| Happy path (provider-one) | `POST /debits` retorna 201, débitos e opções de pagamento |
| Fallback (provider-two) | provider-one retorna 500 → resposta vem do provider-two |
| Propagação de trace ID | header `x-trace-id` enviado ao provider e devolvido na resposta |
| Ambos os providers falham | retorna 500 |
| provider-one retorna 4xx | fallback acionado, resposta vem do provider-two |

> **Por que `CB_VOLUME_THRESHOLD=20` nos testes de integração?**
> O Circuit Breaker é stateful. Se o threshold for baixo (padrão: 3) e um teste individual causar 3 falhas, o circuito abre e todos os testes seguintes falham com "circuit open" antes de chegar ao provider. Usar 20 garante que falhas pontuais de cada teste não contaminem os demais.

---

## Testes manuais com curl

### Subir o ambiente completo

```bash
# na raiz do monorepo
docker compose up --build
```

Ou localmente (requer providers rodando):

```bash
cd main-project
pnpm dev
```

### Requisição básica

```bash
curl -s -X POST http://localhost:3000/debits \
  -H 'Content-Type: application/json' \
  -d '{"placa": "ABC1234"}' | jq
```

### Com trace ID personalizado

```bash
curl -s -X POST http://localhost:3000/debits \
  -H 'Content-Type: application/json' \
  -H 'x-trace-id: meu-trace-123' \
  -d '{"placa": "ABC1234"}' | jq
```

O mesmo `x-trace-id` deve aparecer no header da resposta e ser propagado nas chamadas saindo para os providers (visível nos logs).

---

## Circuit Breaker

O projeto usa [opossum](https://github.com/nodeshift/opossum) para proteger as chamadas HTTP a cada provider. Cada provider tem seu próprio circuito independente.

### Máquina de estados

```
           ┌─────────────────────────────────────────────┐
           │  erros ≥ errorThresholdPercentage            │
           │  e volumeThreshold chamadas observadas        │
           ▼                                              │
        CLOSED ──────────────────────────────────────▶ OPEN
           ▲                                              │
           │                                              │ após resetTimeout
           │  primeira chamada                            ▼
           │  bem-sucedida                          HALF-OPEN
           │                                              │
           └──────────────────────────────────────────────┘
                                          │ primeira chamada falha
                                          ▼
                                        OPEN (reinicia timer)
```

| Estado | Comportamento |
|---|---|
| **CLOSED** | Chamadas passam normalmente. Erros são contados. |
| **OPEN** | Chamadas são rejeitadas imediatamente sem chegar ao provider. O fallback é acionado. |
| **HALF-OPEN** | Uma chamada de teste é deixada passar. Sucesso fecha o circuito; falha reabre. |

### Configuração padrão

| Parâmetro | Valor padrão | Significado |
|---|---|---|
| `CB_TIMEOUT_MS` | `5000` | Máximo de espera por chamada. Após isso, conta como erro. |
| `CB_ERROR_THRESHOLD_PERCENTAGE` | `50` | % de erros para abrir o circuito. |
| `CB_VOLUME_THRESHOLD` | `3` | Mínimo de chamadas antes de verificar o percentual. |
| `CB_RESET_TIMEOUT_MS` | `15000` | Tempo em OPEN antes de tentar HALF-OPEN. |
| `CB_ROLLING_COUNT_TIMEOUT_MS` | `10000` | Janela deslizante de contagem de erros (ms). |
| `CB_ROLLING_COUNT_BUCKETS` | `10` | Granularidade da janela (buckets de 1 s cada). |

### Filtro de erros 4xx

Erros HTTP `4xx` **não contam** para o threshold do circuito. A lógica é: uma placa inválida é um problema do cliente, não uma falha do provider. Portanto, 100 requisições com placas inválidas não abrem o circuito contra um provider saudável.

Apenas erros `5xx`, timeouts e falhas de rede contam para o threshold.

---

## Cenários de teste dos providers

Os providers mock aceitam um endpoint de controle que muda o comportamento sem reiniciar nada:

```
POST /control   { "mode": "normal | error_400 | error_500 | timeout", "timeoutMs": <ms> }
GET  /status    → modo atual
```

### Cenário 1 — Fluxo normal (ambos saudáveis)

```bash
# garantir que os dois estão em modo normal
curl -X POST http://localhost:3001/control -H 'Content-Type: application/json' \
  -d '{"mode": "normal"}'
curl -X POST http://localhost:3002/control -H 'Content-Type: application/json' \
  -d '{"mode": "normal"}'

# consultar
curl -s -X POST http://localhost:3000/debits \
  -H 'Content-Type: application/json' \
  -d '{"placa": "ABC1234"}' | jq .placa
# → "ABC1234" (dados do provider-one)
```

### Cenário 2 — Fallback imediato (provider-one retorna 500)

```bash
curl -X POST http://localhost:3001/control -H 'Content-Type: application/json' \
  -d '{"mode": "error_500"}'

curl -s -X POST http://localhost:3000/debits \
  -H 'Content-Type: application/json' \
  -d '{"placa": "ABC1234"}' | jq
# → 201 com dados do provider-two (XML parseado)
```

Nos logs do main-project você verá:
```
[WARN] provider-one failed — falling back to provider-two
[LOG]  provider responded successfully  { provider: "provider-two" }
```

### Cenário 3 — Abertura do Circuit Breaker

Com `CB_VOLUME_THRESHOLD=3` e `CB_ERROR_THRESHOLD_PERCENTAGE=50`, três falhas consecutivas de `5xx` abrem o circuito.

```bash
# deixar provider-one falhando
curl -X POST http://localhost:3001/control -H 'Content-Type: application/json' \
  -d '{"mode": "error_500"}'

# fazer 3+ requisições (cada uma aciona o fallback e conta uma falha no CB)
for i in 1 2 3 4; do
  curl -s -X POST http://localhost:3000/debits \
    -H 'Content-Type: application/json' \
    -d '{"placa": "ABC1234"}' -o /dev/null -w "status: %{http_code}\n"
done
```

Após a terceira falha, o circuito do provider-one abre. A partir daí, as chamadas são **rejeitadas antes de chegar ao provider** — o fallback para o provider-two acontece instantaneamente sem nem tentar o provider-one.

Nos logs você verá:
```
[WARN] circuit OPEN  { breaker: "provider-one" }
[WARN] circuit rejected (open state)  { breaker: "provider-one" }
```

### Cenário 4 — Recuperação (HALF-OPEN → CLOSED)

```bash
# restaurar provider-one
curl -X POST http://localhost:3001/control -H 'Content-Type: application/json' \
  -d '{"mode": "normal"}'

# aguardar CB_RESET_TIMEOUT_MS (padrão 15 s) e fazer uma requisição
sleep 16
curl -s -X POST http://localhost:3000/debits \
  -H 'Content-Type: application/json' \
  -d '{"placa": "ABC1234"}' | jq
```

Nos logs:
```
[LOG] circuit HALF-OPEN — probing  { breaker: "provider-one" }
[LOG] circuit CLOSED               { breaker: "provider-one" }
```

### Cenário 5 — Timeout no provider

```bash
curl -X POST http://localhost:3001/control -H 'Content-Type: application/json' \
  -d '{"mode": "timeout", "timeoutMs": 30000}'

# a chamada ao provider-one vai estourar CB_TIMEOUT_MS (5 s) antes dos 30 s
time curl -s -X POST http://localhost:3000/debits \
  -H 'Content-Type: application/json' \
  -d '{"placa": "ABC1234"}' -o /dev/null -w "%{http_code}\n"
# → retorna em ~5 s com status 201 (fallback para provider-two)
```

Nos logs:
```
[WARN] circuit timeout  { breaker: "provider-one" }
```

### Cenário 6 — Falha em ambos os providers

```bash
curl -X POST http://localhost:3001/control -H 'Content-Type: application/json' \
  -d '{"mode": "error_500"}'
curl -X POST http://localhost:3002/control -H 'Content-Type: application/json' \
  -d '{"mode": "error_500"}'

curl -s -X POST http://localhost:3000/debits \
  -H 'Content-Type: application/json' \
  -d '{"placa": "ABC1234"}' -w "\nHTTP %{http_code}\n"
# → HTTP 500
```

### Cenário 7 — 4xx não abre o circuito

```bash
curl -X POST http://localhost:3001/control -H 'Content-Type: application/json' \
  -d '{"mode": "error_400"}'

# fazer várias requisições — o circuito permanece CLOSED
for i in $(seq 1 10); do
  curl -s -X POST http://localhost:3000/debits \
    -H 'Content-Type: application/json' \
    -d '{"placa": "ABC1234"}' -o /dev/null -w "req $i: %{http_code}\n"
done

# restaurar e verificar que o circuito ainda aceita chamadas
curl -X POST http://localhost:3001/control -H 'Content-Type: application/json' \
  -d '{"mode": "normal"}'

curl -s -X POST http://localhost:3000/debits \
  -H 'Content-Type: application/json' \
  -d '{"placa": "ABC1234"}' | jq .placa
# → "ABC1234" (provider-one respondeu — circuito nunca abriu)
```

---

## Variáveis de ambiente relevantes para testes

Para testar cenários de CB com abertura mais rápida, use valores menores:

```bash
# .env local para testes agressivos de CB
CB_TIMEOUT_MS=1000          # timeout de 1 s por chamada
CB_ERROR_THRESHOLD_PERCENTAGE=50
CB_VOLUME_THRESHOLD=2       # abre com apenas 2 falhas
CB_RESET_TIMEOUT_MS=3000    # reabre em 3 s (em vez de 15 s)
```

Para testes determinísticos de juros (útil ao comparar valores esperados):

```bash
INTEREST_REFERENCE_DATE=2026-01-31   # data fixa de referência
```

### Verificar status dos providers

```bash
curl http://localhost:3001/status   # { "mode": "normal" }
curl http://localhost:3002/status   # { "mode": "normal" }
```

### Restaurar estado normal rapidamente

```bash
for port in 3001 3002; do
  curl -s -X POST http://localhost:$port/control \
    -H 'Content-Type: application/json' \
    -d '{"mode": "normal"}' && echo " ✓ provider :$port restaurado"
done
```
