# Refactor Checklist — main-project

Revisão DDD / SOLID / CQRS. Marque `[x]` conforme concluir.

---

## 🔴 Crítico

- [x] **1. Remover `@Injectable()` e `process.env` do domínio**
  - `src/modules/payment-options/domain/services/payment-calculator.service.ts` — tirar decorator NestJS
  - `src/modules/debits/domain/services/interest-calculator.service.ts` — taxas/cap não devem vir de `process.env` direto; receber via construtor ou config tipada
  - Domain services devem ser framework-agnostic (puro TS)

- [x] **2. Eliminar instanciação manual no handler**
  - `src/modules/debits/application/queries/get-debits/get-debits.handler.ts:18`
  - Trocar `new InterestCalculatorService()` por injeção via construtor
  - Registrar provider no `debits.module.ts`

- [x] **3. Quebrar acoplamento entre módulos**
  - `payment-calculator.service.ts` importa `DebitItemDto` de `debits`
  - Definir contrato próprio em `payment-options/domain` (ex.: `DebitInput` interface) ou mover para `shared`

- [x] **4. Resolver inconsistência do módulo `example`**
  - CLAUDE.md referencia módulo `example` que não existe
  - Decisão: criar o esqueleto canônico **ou** atualizar CLAUDE.md apontando `debits` como referência

---

## 🟡 Importante

- [x] **5. Aplicar SRP em `GetDebitsHandler`**
  - `get-debits.handler.ts:43-71` faz fallback + cálculo + validação + DTO + payment options
  - Extrair `DebitsAggregationService` (application service)
  - Handler vira fino: só dispara o service

- [x] **6. Resolver ambiguidade de `VehicleDebits`**
  - `src/modules/debits/domain/aggregates/vehicle-debits.aggregate.ts`
  - Hoje é uma classe sem invariantes — placa pode vir vazia, lista pode vir nula
  - Adicionar `static create(plate, debits)` validando entrada e jogar exceções de domínio (`InvalidPlateError`, etc.)
  - Mover o arquivo de `aggregates/` para `entities/` se preferir não chamar de Aggregate enquanto não houver eventos/invariantes complexos

- [x] **7. Alinhar CQRS com a realidade**
  - Só temos query side. CLAUDE.md fala em "CQRS" como se fosse completo
  - Ajustar doc para "CQRS read-side / CQS" enquanto não houver mutação real, ou adicionar commands quando aparecer caso de escrita
  - Decisão YAGNI: manter `CqrsModule` (já entrega QueryBus); não criar commands fictícios

- [x] **8. Decidir sobre `IRepository<T>`** — removido (YAGNI). Junto: `AggregateRoot`, `Entity`, `DomainEvent` também eliminados (eram código morto).
  - `src/shared/domain/repository.interface.ts` declarado e nunca usado
  - Remover (YAGNI) ou usar no primeiro caso de persistência

- [x] **9. Auditar `debit-provider.interface.ts`**
  - Port + mappers já estavam limpos (zero tipos HTTP/axios no domínio)
  - Adapters tinham `process.env.PROVIDER_*_URL` direto na classe → movido para `useFactory` no módulo (mesmo padrão do `INTEREST_CALCULATOR`)
  - `@Injectable()` removido dos clients (factories tornam desnecessário)
  - Pendência menor não tratada: `CircuitBreakerService` lê `CB_*` direto. Aceitável — é infra config sem impacto em domínio

---

## 🟢 Menor

- [x] **10. Tipar `Debit.type` como `DebitType`** — feito; cast removido. Filtro de tipos desconhecidos movido para os mappers (responsabilidade de tradução).
- [x] **11. Mover taxas IPVA/MULTA para config tipada** — extraído para `domain/services/interest-rules.config.ts` (`InterestRules` + `DEFAULT_INTEREST_RULES`); injetado via construtor.
- [x] **12. Refatorar logs de fallback** — extraído método `attempt(plate, name, provider)` que encapsula log+chamada; `fetchWithFallback` agora tem só try/catch.
- [x] **13. Separar ViewModel HTTP do DTO de aplicação** — novo `interface/http/view-models/debit-response.view-model.ts`; presenter retorna `DebitResponseViewModel` tipado; controller tipado.
- [x] **14. Adicionar testes**
  - 21 spec files, 108 testes, cobertura global ≥ 97% (threshold configurado em 85%)
  - Fases: domain, application, infrastructure (mappers + clients + circuit-breaker), interface, logging e integração E2E com nock

---

## 💡 Sugestões

- [ ] **15. Glossário de ubiquitous language** no CLAUDE.md (Debit, VehicleDebits, PaymentOption, …)
- [ ] **16. Wrapper de interface sobre `opossum`** para testabilidade do CircuitBreaker

> Removido o ex-item 17 ("Wire de `EventPublisher`"): contradiz o item 8 — `AggregateRoot` foi excluído por YAGNI. Reintroduzir base + publisher só quando o primeiro evento de domínio real existir.

---

## Próximos passos sugeridos

Já concluídos: **1, 2, 3, 4, 5, 8**.

Restante por prioridade:
1. **6** — invariantes em `VehicleDebits` (rápido, alto retorno em robustez)
2. **10** — tipar `Debit.type` como `DebitType` (small win, remove cast)
3. **7** — ajustar doc CQRS → CQS read-side
4. **9** — auditar vazamento de tipos HTTP no port
5. **14** — testes cobrindo o que já foi refatorado
6. **11**, **13**, **15**, **16**, **12** — refinamentos conforme necessidade
