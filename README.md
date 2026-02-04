# BUSCAI V2

## O que é o BUSCAI (e como funciona)
O BUSCAI é uma plataforma que coloca empresas locais no topo das buscas de quem procura serviços ou produtos, com entrega direta no WhatsApp/telefone. Ele funciona como um motor de busca + vitrine de ofertas + leilão de visibilidade, com três formas principais de aparecer:

1) **Por empresa buscada**
   - Quando alguém procura um nicho/serviço, o BUSCAI exibe até **3 posições de leilão** (pagas) e **2 posições orgânicas**.
   - Resultado: visibilidade imediata para quem já está procurando o que você vende.

2) **Oferecido por**
   - Empresas podem **comprar um nicho** (ex.: dentista, gesseiro).
   - Sempre que alguém busca esse nicho, a mensagem final inclui o selo **“Oferecido por: SUA EMPRESA”** com telefone ou site.

3) **Por produto buscado**
   - A empresa cadastra produtos/ofertas.
   - Quando o usuário busca por um produto específico, o BUSCAI mostra as empresas que oferecem esse item.

Fluxo operacional (resumo):
1. O cliente manda uma mensagem (ex.: WhatsApp) com o que precisa.
2. A IA identifica a intenção (serviço/produto), cidade e nicho.
3. O sistema aplica o leilão (3 posições), separa orgânicos (2 posições) e adiciona o “Oferecido por”.
4. O cliente recebe a resposta com empresas, contatos e ações (ligar/WhatsApp).

Além disso, o BUSCAI oferece:
- **Gestão de catálogo** (produtos/ofertas por empresa).
- **Leilão de posições** para aumentar visibilidade.
- **Analytics** de buscas e desempenho.
- **Integrações** (ex.: WhatsApp).
- **Importação administrativa (SerpAPI)** para coleta e dedupe de empresas em escala.

Monorepo BUSCAI V2 (pnpm workspaces) com backend (Fastify + Drizzle) e frontend (React + Vite).

## Layout do workspace
- apps/api: backend (Fastify, Drizzle, PostgreSQL)
- apps/web: frontend (React, Vite, React Query)
- packages/shared-schema: tipos compartilhados + OpenAPI types
- openapi/buscai-v2.yaml: contrato OpenAPI
- docker-compose.yml: Postgres local (porta 5433)

## Requisitos
- Node.js 20+
- pnpm
- Docker Desktop (para banco local)

## Setup rápido (local)
1) Suba o Postgres:
   - docker compose up -d
2) Instale dependências:
   - pnpm install
3) API:
   - copie apps/api/.env.example para apps/api/.env
   - pnpm -C apps/api db:migrate
   - pnpm -C apps/api db:seed
   - pnpm -C apps/api dev
4) Web:
   - pnpm -C apps/web dev

## Variáveis de ambiente (API)
Definidas em `apps/api/src/config/env.ts`. Principais:
- DB: `DATABASE_URL` (ou usa fallback local `postgres://buscai:buscai@localhost:5433/buscai`)
- Auth: `JWT_SECRET`, `REFRESH_SECRET` (fallback para `JWT_SECRET`), `JWT_EXPIRES_IN`, `REFRESH_EXPIRES_IN`
- Demo: `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`
- WhatsApp: `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_API_TOKEN`, `WHATSAPP_API_URL` (obrigatória quando provider=generic)
- Claims: `CLAIM_SUPPORT_WHATSAPP`
- SerpAPI: `SERPAPI_API_KEY`, `SERPAPI_BASE_URL`, `SERPAPI_ENGINE`, `SERPAPI_DEFAULT_LIMIT`
- Chaos: `CHAOS_ENABLED`, `CHAOS_LATENCY_MS`, `CHAOS_ERROR_RATE`, `CHAOS_DB_SLEEP_MS`
- Flags BUSCAI: `BUSCAI_READONLY`, `BUSCAI_DISABLE_AUCTION`, `BUSCAI_DISABLE_HEAVY_LOGS`

## Scripts principais
Root:
- pnpm test (roda testes em todos os workspaces)
- pnpm lint
- pnpm generate:api-types (OpenAPI -> packages/shared-schema/src/api-types.ts)

API (apps/api/package.json):
- pnpm -C apps/api dev (Fastify)
- pnpm -C apps/api db:migrate (drizzle-kit push)
- pnpm -C apps/api db:apply-sql <arquivo.sql>
- pnpm -C apps/api db:seed
- pnpm -C apps/api test
- pnpm -C apps/api test:e2e

Web (apps/web/package.json):
- pnpm -C apps/web dev
- pnpm -C apps/web build
- pnpm -C apps/web test

## DEV - Checklist rapido (leilao auto + cobranca por impressao)
1) Rodar migrations (manual, para garantir enum/checks):
   - docker exec -i buscai-db psql -U buscai -d buscai -f /app/drizzle/0025_auction_target_position_constraints.sql
   - docker exec -i buscai-db psql -U buscai -d buscai -f /app/drizzle/0026_auction_mode_auto.sql

2) Criar uma config auto de teste + seed de creditos (idempotente por dia, America/Sao_Paulo):
   - (A) cd apps/api; pnpm tsx scripts/seed-auction-auto.ts <companyId> <cityId> <nicheId> 1 10 50
   - (A opcional) cd apps/api; pnpm tsx scripts/seed-auction-auto.ts <companyId> <cityId> <nicheId> 1 10 50 <seedBatchId>
   - (B) pnpm --filter @buscai/api tsx scripts/seed-auction-auto.ts <companyId> <cityId> <nicheId> 1 10 50
   - (B opcional) pnpm --filter @buscai/api tsx scripts/seed-auction-auto.ts <companyId> <cityId> <nicheId> 1 10 50 <seedBatchId>

3) Rodar sanity report (nao altera dados):
   - (A) cd apps/api; pnpm tsx scripts/auction-sanity.ts <companyId> <cityId> <nicheId> [txLimit]
   - (B) pnpm --filter @buscai/api tsx scripts/auction-sanity.ts <companyId> <cityId> <nicheId> [txLimit]
   - Saida inclui wallet, ultimas transactions (com marker seed) e config auto do city+niche.

4) Executar uma busca paga (endpoint existente):
   - POST /search
   - Body exemplo:
     ```json
     {
       "cityId": "<cityId>",
       "nicheId": "<nicheId>",
       "query": "teste leilao",
       "source": "web"
     }
     ```
   - Garanta que o company do teste tem saldo para cobrir impressao.

5) Validar cobranca e tracking no DB:
   - `search_results.is_paid = true` para o company:
     ```sql
     SELECT search_id, company_id, position, is_paid, charged_amount
     FROM search_results
     WHERE company_id = '<companyId>' AND is_paid = true
     ORDER BY search_id DESC
     LIMIT 5;
     ```
   - `search_events` com impression:
     ```sql
     SELECT search_id, company_id, type, created_at
     FROM search_events
     WHERE company_id = '<companyId>' AND type = 'impression'
     ORDER BY created_at DESC
     LIMIT 5;
     ```
   - `billing_transactions` com debito de impressao:
     ```sql
     SELECT id, company_id, type, amount, amount_cents, occurred_at
     FROM billing_transactions
     WHERE company_id = '<companyId>' AND type = 'search_debit'
     ORDER BY occurred_at DESC
     LIMIT 5;
     ```
   - `billing_wallet` com saldo reduzido:
     ```sql
     SELECT company_id, balance, reserved
     FROM billing_wallet
     WHERE company_id = '<companyId>';
     ```

6) Forcar limite diario:
   - Ajuste `daily_budget` para `1` ou `0.5` e repita a busca.
   - Confirmar que o backend pausou por limite (config nao entra nas posicoes pagas).

7) Reverter (remover config seed):
   - (A) cd apps/api; pnpm tsx scripts/remove-seed-auction-auto.ts <companyId> <cityId> <nicheId> [seedBatchId]
   - (B) pnpm --filter @buscai/api tsx scripts/remove-seed-auction-auto.ts <companyId> <cityId> <nicheId> [seedBatchId]
   - Sem seedBatchId, o cleanup remove apenas seeds das ultimas 24h.

## DEV - Notas importantes (leilao auto + limites)
- `mode` aceita `manual`, `smart` e `auto`. O backend normaliza `smart` -> `auto` na leitura e grava sempre `auto` para modo automatico.
- `target_position` e `pause_on_limit` sao persistidos em `auction_configs`.
- Regras de validacao:
  - `mode in ('auto','smart')` exige `target_position`.
  - `mode = 'manual'` exige `target_position` nulo.
- Empate no leilao pago (mesmo bid): vence o menor `created_at` da auction_config, e se empatar, o menor `companyId`.
- Limite diario (quando `pause_on_limit=true`) pausa automaticamente a configuracao no dia ao atingir o teto.
- Sem cron/Task Scheduler: validacao e seeds sao comandos manuais.

## DEV - Scripts novos (leilao auto)
- TSX e o caminho oficial:
  - (A) cd apps/api; pnpm tsx scripts/seed-auction-auto.ts <companyId> <cityId> <nicheId> 1 10 [seedAmount] [seedBatchId] (cria/upsert config auto + seed de creditos)
  - (B) pnpm --filter @buscai/api tsx scripts/seed-auction-auto.ts <companyId> <cityId> <nicheId> 1 10 [seedAmount] [seedBatchId]
  - (A) cd apps/api; pnpm tsx scripts/auction-sanity.ts <companyId> <cityId> <nicheId> [txLimit] (relatorio de sanity)
  - (B) pnpm --filter @buscai/api tsx scripts/auction-sanity.ts <companyId> <cityId> <nicheId> [txLimit]
  - (A) cd apps/api; pnpm tsx scripts/remove-seed-auction-auto.ts <companyId> <cityId> <nicheId> [seedBatchId] (remove seed)
  - (B) pnpm --filter @buscai/api tsx scripts/remove-seed-auction-auto.ts <companyId> <cityId> <nicheId> [seedBatchId]
- TSX e o caminho oficial; SQL apenas como fallback manual em apps/api/drizzle/dev/

## DEV - Como resetar ambiente de teste do leilao
1) Seed + config auto:
   - cd apps/api; pnpm tsx scripts/seed-auction-auto.ts <companyId> <cityId> <nicheId> 1 10 50
2) Validar estado:
   - cd apps/api; pnpm tsx scripts/auction-sanity.ts <companyId> <cityId> <nicheId> 10
3) Rodar busca (POST /search) e conferir search_results, search_events, billing_transactions.
4) Cleanup:
   - cd apps/api; pnpm tsx scripts/remove-seed-auction-auto.ts <companyId> <cityId> <nicheId> [seedBatchId]

## Banco de dados
- Migrations SQL em `apps/api/drizzle/` (inclui claims e serpapi).
- Reset local: `pnpm -C apps/api db:reset` (usa Docker).
- Seed: `apps/api/seed/seed.ts`.

## Backend: módulos e rotas principais
Fonte da verdade das rotas: `apps/api/src/core/http/router.ts`.

Auth:
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me` (authGuard)

Catalog:
- `GET /cities`
- `GET /niches`

Companies:
- `GET /companies` (auth)
- `POST /companies` (auth)
- `GET /companies/:companyId` (auth)
- `PATCH /companies/:companyId` (auth)
- `POST /companies/:companyId/claim` (auth)
- `PATCH /companies/:companyId/channels` (auth)
- `GET /me/company` (auth)

Claims (V2, sem OTP):
- `GET /claims/candidates` (auth)
- `POST /claims/request` (auth)
- `POST /claims/cnpj/confirm` (auth)

Search:
- `POST /search`
- `POST /search/:searchId/click`
- `POST /search/products`
- `GET /search/products`

Products:
- `GET /products` (auth)
- `GET /products/:id` (auth)
- `POST /products` (auth)
- `PUT /products/:id` (auth)
- `DELETE /products/:id` (auth)
- `POST /products/:id/renew` (auth)
- `GET /products/plans`
- `GET /product-plans`
- `GET /products/subscription` (auth)
- `POST /products/subscription` (auth)
- `GET /companies/:companyId/product-subscription` (auth)
- `POST /companies/:companyId/product-subscription` (auth)
- `GET /companies/:companyId/product-offers` (auth)
- `POST /companies/:companyId/product-offers` (auth)
- `PATCH /companies/:companyId/product-offers/:offerId` (auth)

Auction:
- `GET /auction/configs` (auth)
- `POST /auction/configs` (auth)
- `GET /auction/slots` (auth)
- `GET /auction/summary` (auth)

Billing:
- `GET /billing/wallet` (auth)
- `GET /billing/transactions` (auth)
- `POST /billing/purchase` (auth)
- `POST /billing/recharge-intents` (auth)
- `POST /billing/recharges` (auth)
- `POST /billing/recharges/:rechargeId/confirm` (auth)

Analytics:
- `GET /analytics/searches` (auth + admin)
- `GET /analytics/dashboard` (auth)

Contacts/Complaints:
- `GET /companies/:companyId/contacts` (auth)
- `PATCH /companies/:companyId/contacts/:contactId` (auth)
- `POST /complaints`

Integrations:
- `POST /integrations/whatsapp/webhook`

Admin SerpAPI (auth + admin):
- `POST /admin/serpapi/import`
- `GET /admin/serpapi/runs`
- `GET /admin/serpapi/runs/:runId`
- `GET /admin/serpapi/runs/:runId/records`
- `POST /admin/serpapi/runs/:runId/resolve-conflict`
- `GET /admin/serpapi/export`

## Item 1 (SerpAPI Admin Operacional) — concluído
Finalidade: governança da ingestão de empresas via SerpAPI antes de publicar no catálogo. Permite controlar importações, deduplicação e resolução de conflitos.
Capacidades: disparo de importação, histórico de runs, detalhe por run, listagem de records, resolução de conflitos (merge/substituir/ignorar) e exportação CSV.
Rotas administrativas: `/admin/serpapi/import`, `/admin/serpapi/runs`, `/admin/serpapi/runs/:runId`, `/admin/serpapi/runs/:runId/records`, `/admin/serpapi/runs/:runId/resolve-conflict`, `/admin/serpapi/export`.

## Item 2 (Catálogo Publicável) — concluído
O catálogo publicável é a Company final que a busca vai consumir, com status, qualidade e governança de dedupe.
Fluxos entregues: CRUD admin-only de Company (listar/criar/editar/status) e publish de SerpAPI record -> Company com auditoria no record.
Governança entregue: normalização (telefone/whatsapp/site), dedupe consistente (409 + dedupeHits + force), qualityScore (0–100) e bloqueio de status=active quando inválido.
Rotas administrativas: `/admin/companies` (GET/POST), `/admin/companies/:companyId` (GET/PATCH), `/admin/companies/:companyId/status` (PATCH), `/admin/serpapi/runs/:runId/records/:recordId/publish` (POST).
Observação: ainda não é a busca do usuário final (Item 3).

## Item 3 (Busca do usuário + Tracking) — concluído
Fluxo de busca web: `/buscar` usa `POST /public/search` (resolve cidade/nicho por nome), retorna até 5 empresas (3 leilão + 2 orgânicas) e bloco “Oferecido por” opcional.
Regras de resultado: leilão ocupa posições 1–3 (maiores lances), orgânico determinístico (qualityScore desc, name asc, id asc), offeredBy vem da mesma regra do WhatsApp (legalName != tradeName) no nível da resposta.
Tracking: impression dedup por searchId, click_whatsapp e click_call exigem companyId.

## Item 4 (WhatsApp) — concluído (P0)
Webhook inbound: `POST /integrations/whatsapp/webhook`, valida `WHATSAPP_WEBHOOK_SECRET` (header `x-webhook-secret`), dedupe por messageId (janela 5 min) e logs mínimos sem payload sensível.
Resposta: parse de texto + cidade (ex.: `cidade: X; query`), fallback para `DEFAULT_CITY_NAME` (se vazio, pede cidade), chama publicSearch internamente e responde texto com 3 pagas + 2 orgânicas + offeredBy (se existir).
Tracking de cliques: links do reply usam `PUBLIC_BASE_URL` + `/r/w/{searchId}/{companyId}` e `/r/c/{searchId}/{companyId}`; redirects registram click_whatsapp/click_call em search_events e retornam 302 para wa.me/tel.
Historico de Mensagens (read-only): rota `/mensagens` (auth) lista inbound/outbound do WhatsApp via `GET /messages/history`; persistencia em `apps/api/drizzle/0018_message_history.sql`.

## Item 5 (Tracking + Analytics) — concluído
Tracking coletado: impression dedup por searchId, click_whatsapp e click_call por companyId.
Analytics reais no backend: `/analytics/dashboard` expõe realImpressions, realClicks, realClicksWhatsapp, realClicksCall, realCtr e topCompaniesByClick (admin-only), mantendo campos antigos por compatibilidade.
UI disponível: rota admin `/admin/analytics/searches` (lista paginada via `/analytics/searches`).

## Item 6 (Monetizacao) — concluido
Regras de cobranca:
- Leilao: cobra por impressao quando a empresa entra como paga no resultado do search (`search_results.is_paid=true`).
- Redirect `/r/w/{searchId}/{companyId}` e `/r/c/{searchId}/{companyId}`: tracking apenas (click_whatsapp/click_call), sem cobranca.
- Produtos: cobranca mensal do plano de produto. Nao se mistura com leilao.
- Idempotencia: 1 cobranca por impressao por `(searchId, companyId)` na geracao do resultado pago.
- Saldo insuficiente: empresa nao entra como paga; redirect nunca bloqueia.

Matriz de Cobranca:
| Produto | Evento que cobra | Quando cobra | Unidade | Onde ocorre | Idempotencia | Observacoes |
| --- | --- | --- | --- | --- | --- | --- |
| Leilao (impressao) | search_result pago | No search, quando `search_results.is_paid=true` e persistido | Impressao | Search | Unico por `(searchId, companyId)` | Se saldo insuficiente, nao aparece como pago |
| Redirects (tracking) | click_whatsapp / click_call | Clique em `/r/w/{searchId}/{companyId}` ou `/r/c/{searchId}/{companyId}` | Evento | Redirect publico | N/A | Nao cobra |
| Produtos (mensal) | renovacao de plano | Ciclo mensal do plano | Mes | Billing | N/A | Sem cobranca por evento |

Fluxo tecnico correto:
1) Search gera resultados.
2) Se pago, debita por impressao e persiste `search_results.is_paid=true`.
3) Redirect apenas registra `search_events` e redireciona.

Internals:
- `GET /internal/metrics` (auth + admin)
- `GET /internal/health`

## Frontend: rotas atuais
Fonte: `apps/web/src/app/routes.tsx`.

Público:
- `/` (Home)
- `/buscar`
- `/search/companies`
- `/search/products`
- `/como-funciona`
- `/empresa/:id`
- `/login`

Protegido (auth):
- `/minha-empresa`
- `/leilao`
- `/produtos`
- `/configuracoes`
- `/configuracoes/leiloes`
- `/configuracoes/produtos`
- `/lances`
- `/creditos`
- `/companies` (lista)
- `/companies/new`
- `/companies/:companyId`
- `/auction`
- `/billing`

Admin:
- `/admin/serpapi`

## OpenAPI e tipos
- OpenAPI em `openapi/buscai-v2.yaml`.
- Gerar tipos: `pnpm generate:api-types`.

## Smoke tests
- SerpAPI records: `apps/api/scripts/smoke/serpapi_records.ps1`

## Testes
API:
- `pnpm -C apps/api test`
- `pnpm -C apps/api test:api:stable` (dev normal: rapido e estavel)
- `pnpm -C apps/api test:api:bunker` (se travar/CI instavel)
- `pnpm -C apps/api test:ci` (CI com coverage)
- `pnpm -C apps/api test:e2e`
Web:
- `pnpm -C apps/web test`

## O que falta / pendências (verificado no repositório)
- Frontend de claims (não há telas/rotas para claim; apenas endpoints backend).
- Fluxo OTP de claim (somente candidatos/request/cnpj confirm; não há endpoints de OTP).
- `apps/web/README.md` ainda é o template do Vite e não descreve o app V2.

## Observações
- O contrato OpenAPI deve ser mantido em sincronia com `router.ts` quando novas rotas forem adicionadas.
