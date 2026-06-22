# Visitor Tools

Aplicação React + Vite para utilitários internos da Visitor.

## Rodar localmente

```bash
npm install
npm run dev
```

Esse comando sobe frontend + API juntos.

## Publicar na internet (GitHub Pages)

Este projeto já está configurado para deploy público com `gh-pages`.

### 1) Subir o código para um repositório no GitHub

```bash
git init
git add .
git commit -m "chore: preparar deploy"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/visitor-tools.git
git push -u origin main
```

### 2) Publicar

```bash
npm install
npm run deploy
```

Esse comando cria a branch `gh-pages` com os arquivos de produção.

### 3) Ativar GitHub Pages no repositório

No GitHub: `Settings` → `Pages` → `Build and deployment`:

- `Source`: `Deploy from a branch`
- `Branch`: `gh-pages`
- Pasta: `/ (root)`

Após salvar, o site fica disponível em:

`https://SEU_USUARIO.github.io/visitor-tools/`

## Publicacao completa (frontend + API em producao)

Para funcionamento completo em producao, e necessario publicar tambem a API (`server.mjs`) em um host Node (Render/Railway/Fly.io etc.).

### 1) Publicar a API

Configure as variaveis no host da API:

```bash
API_PORT=8787
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ESTIMATIVAS_TABLE=estimativas
SUPABASE_ESTIMATIVA_ITEMS_TABLE=estimativa_items
SUPABASE_DAILY_ACTIVITIES_TABLE=daily_activities
SUPABASE_USERS_TABLE=app_users
SUPABASE_DATA_DICTIONARY_TABLE=data_dictionary
SUPABASE_CUSTOMER_CLIENTS_TABLE=customer_hub_clients
SUPABASE_CUSTOMER_CONTACTS_TABLE=customer_hub_contacts
SUPABASE_CUSTOMER_SYSTEMS_TABLE=customer_hub_systems
SUPABASE_CUSTOMER_PROCESSES_TABLE=customer_hub_processes
SUPABASE_CUSTOMER_ACTIVITIES_TABLE=customer_hub_activities
CORS_ALLOWED_ORIGINS=https://SEU_USUARIO.github.io
```

Depois de publicar, voce tera uma URL da API, por exemplo:

`https://visitor-tools-api.onrender.com`

### 2) Publicar o frontend apontando para a API

No seu terminal local, defina a URL da API para o build da Vite e publique:

```bash
$env:VITE_API_BASE_URL="https://visitor-tools-api.onrender.com"
$env:VITE_SUPABASE_URL="https://xxxx.supabase.co"
$env:VITE_SUPABASE_ANON_KEY="eyJ..."
$env:VITE_SUPABASE_DATA_DICTIONARY_TABLE="data_dictionary"
npm run deploy
```

Ou, se as variaveis `VITE_*` ja estiverem no seu `.env`, use o atalho:

```bash
npm run deploy:prod
```

As variaveis `VITE_SUPABASE_*` permitem que a rotina `Excel/CSV para SQL` consulte o dicionario diretamente no Supabase quando a rota da API nao estiver disponivel.

### 3) Resultado

- Frontend: `https://SEU_USUARIO.github.io/visitor-tools/`
- API: URL do host Node escolhido
- A aplicacao passa a funcionar fora da rede local (login, CRUD, apontamentos, usuarios, ranking)

## Scripts disponíveis

- `npm run dev`: desenvolvimento local (frontend + API)
- `npm run dev:web`: apenas frontend
- `npm run dev:api`: apenas API
- `npm run dev:all`: frontend + API
- `npm run build`: build de produção
- `npm run preview`: pré-visualização do build
- `npm run deploy`: publica versão atual no GitHub Pages
- `npm run deploy:prod`: deploy com variaveis de producao carregadas via `.env`
- `npm run supabase:keepalive`: mantem o Supabase ativo com pings periodicos
- `npm run supabase:keepalive:once`: executa somente um ping de teste

## Keep-alive do Supabase (evitar idle/cold start)

Para reduzir o atraso no primeiro acesso apos inatividade, rode o keep-alive em um processo sempre ativo.

Variaveis usadas:

```bash
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
# opcional (padrao 5)
SUPABASE_KEEP_ALIVE_MINUTES=5
# opcional: tabela usada para ping
SUPABASE_KEEP_ALIVE_TABLE=estimativas
```

Execucao:

```bash
npm run supabase:keepalive
```

Opcoes por linha de comando:

```bash
npm run supabase:keepalive -- --once
npm run supabase:keepalive -- --interval-minutes=10
npm run supabase:keepalive -- --table=estimativas
```

Observacao: para funcionar continuamente, esse processo precisa ficar rodando em algum host (Render, Railway, VPS, Task Scheduler etc.).

### Deploy no Render (worker dedicado)

O arquivo [render.yaml](render.yaml) ja inclui o worker `visitor-tools-supabase-keepalive` com:

- `startCommand: npm run supabase:keepalive`
- ping a cada `5` minutos (configuravel)

No Render, confirme as variaveis no worker:

```bash
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_KEEP_ALIVE_MINUTES=5
SUPABASE_KEEP_ALIVE_TABLE=estimativas
```

Se o plano nao aceitar `worker`, alternativa: criar um `Cron Job` no Render executando:

```bash
npm run supabase:keepalive:once
```

## Estimativas via Supabase

O acesso e a manipulacao das estimativas agora ocorre em banco Supabase.

Modelo de dados:
- `estimativas`: cabecalho (`id` sequencial, `partner, client, date, demand, notes, status`)
- `estimativa_items`: itens (`detail, hours`) com relacao 1:N por `estimativa_id`

1. Crie a tabela no Supabase (exemplo em [scripts/supabase-estimativas.sql](scripts/supabase-estimativas.sql)).
2. Configure o `.env`:

```bash
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ESTIMATIVAS_TABLE=estimativas
SUPABASE_ESTIMATIVA_ITEMS_TABLE=estimativa_items
```

3. Rode frontend + API:

```bash
npm run dev:all
```

O formulario de inclusao abre em modal com os campos de cabecalho e um grid de itens `detail/hours` (1:N) por id.

## Usuarios e permissoes de menu

A aplicacao agora autentica usuarios no Supabase e permite cadastro de novos usuarios com definicao de acesso por item de menu.

Regras:
- A rotina `Usuarios e Acessos` e exclusiva do usuario `visitor`.
- Cada usuario pode receber acesso aos menus: `Comparar Projeto`, `XML para Excel`, `Excel/CSV para SQL`, `Ranking de Curriculos`, `Estimativas`, `Apontamentos`, `Demandas DIGTE`, `Central de Clientes` e `Central de Chamados`.

1. Crie a tabela de usuarios no Supabase (exemplo em [scripts/supabase-users.sql](scripts/supabase-users.sql)).
2. Configure o `.env`:

```bash
SUPABASE_USERS_TABLE=app_users
```

3. Utilize o login inicial `visitor / Visitor@2026` e cadastre os demais usuarios pela nova rotina.

## Central de Chamados (TomTicket)

Integração com a API do TomTicket para gerenciamento de chamados e tickets.

### Funcionalidades

- **Administração**: Gestão de usuários e seus acessos às organizações do TomTicket
- **Integração com TomTicket**: Sincroniza automaticamente as organizações via API

### Configuração

1. Configure as variáveis no `.env`:

```bash
TOMTICKET_API_TOKEN=seu_token_aqui
TOMTICKET_API_BASE_URL=https://api.tomticket.com/v2.0
SUPABASE_TICKET_HUB_ACCESSES_TABLE=ticket_hub_accesses
VITE_TOMTICKET_TOKEN=seu_token_aqui
VITE_TOMTICKET_API_BASE=https://api.tomticket.com/v2.0
```

O token não expira e permite consultar as organizações disponíveis.

2. Crie a tabela de persistência das organizações por usuário (mesmo padrão dos demais módulos):
- Script: [scripts/supabase-ticket-hub-accesses.sql](scripts/supabase-ticket-hub-accesses.sql)

3. Endpoints principais:
- `GET /api/ticket-hub/users` - Listar usuários com acesso a tickets
- `POST /api/ticket-hub/users` - Criar novo usuário com permissões
- `PUT /api/ticket-hub/users/:id` - Atualizar usuário e suas organizações
- `DELETE /api/ticket-hub/users/:id` - Deletar usuário

4. Libere o menu `Central de Chamados` no cadastro de usuários para quem deve acessar a rotina.

### API TomTicket

Para mais informações sobre a API do TomTicket, consulte:
- Documentação: https://tomticket.tomticket.com/kb/chamados-api
- Endpoint de organizações: `https://api.tomticket.com/v2.0/organization/list`

## Cadastros Basicos - Rubricas (Supabase)

A rotina de `Cadastros Basicos - Rubricas` foi redesenhada para CRUD de tabelas de referencia (eSocial/Protheus) no Supabase.

### Estrutura de dados

Execute o script:

- [scripts/supabase-rubrica-validation-rules.sql](scripts/supabase-rubrica-validation-rules.sql)

Ele cria:

- `rubrica_reference_catalogs`: catalogos (8 tabelas de rubricas)
- `rubrica_reference_items`: registros com `codigo`, `descricao abreviada`, `descricao completa`, `inicio/fim de vigencia` e `reference_links`

No catalogo `Tabela ID CALCULO - Protheus`, o campo `reference_links` aceita multiplos links.

### Variaveis de ambiente

```bash
SUPABASE_RUBRICA_CATALOGS_TABLE=rubrica_reference_catalogs
SUPABASE_RUBRICA_ITEMS_TABLE=rubrica_reference_items
```

### Endpoints da API

- `GET /api/rubricas/catalogs`
- `GET /api/rubricas/catalogs/:catalogKey/items`
- `POST /api/rubricas/catalogs/:catalogKey/items`
- `PUT /api/rubricas/catalogs/:catalogKey/items/:id`
- `DELETE /api/rubricas/catalogs/:catalogKey/items/:id`

### Carga default automatica via planilhas anexas

Nao e necessario processo manual de importacao para os 8 cadastros basicos de rubricas.

Comportamento atual:

1. O backend procura automaticamente planilhas `.xlsx` em `scripts/rubricas-defaults` (ou `scripts` como fallback).
2. No primeiro acesso aos endpoints de rubricas, se a tabela `rubrica_reference_items` estiver vazia, a carga inicial e executada automaticamente.
3. Os dados sao deduplicados por codigo e gravados por catalogo.

Importacao manual continua disponivel apenas para manutencao/recarga excepcional:

```bash
npm run import:rubricas -- --dir=scripts/rubricas-defaults
```

### Histórico de Status Report (Central de Clientes)

Persistência dos reports enviados com os números de tickets e comparação com o envio anterior.

1. Crie a tabela de histórico no Supabase:
- Script: [scripts/supabase-customer-status-report-history.sql](scripts/supabase-customer-status-report-history.sql)

2. Configure o `.env` da API:

```bash
SUPABASE_CUSTOMER_STATUS_REPORT_HISTORY_TABLE=customer_hub_status_report_history
```

3. Endpoints:
- `GET /api/customer-hub/status-report/history?clientId=<id>` - retorna histórico de envios do cliente
- `POST /api/customer-hub/status-report/history` - grava um novo envio com os tickets marcados como enviados

## Excel/CSV para SQL (.sql)

Nova rotina para converter arquivos `.csv`, `.xlsx` e `.xls` em script SQL com instrucoes de `INSERT`.

Como usar:
1. Abra o menu `Excel/CSV para SQL`.
2. Selecione um ou mais arquivos de origem.
3. Informe a tabela de destino (ex.: `SR4020`) e o ultimo valor de `R_E_C_N_O_` existente.
4. Clique em `Gerar arquivo .sql`.

Observacoes:
- Cada arquivo selecionado gera um `.sql` separado.
- O campo `R_E_C_N_O_` e preenchido automaticamente e incrementado a partir do ultimo valor informado.
- Em arquivos Excel com multiplas abas, todas as linhas sao consolidadas no script gerado.
- Ao selecionar manualmente um dicionario (`X3_CAMPO`/`X3_TIPO`), o sistema sincroniza os campos no Supabase.

### Dicionario de dados no Supabase

1. Crie a tabela no Supabase (exemplo em [scripts/supabase-data-dictionary.sql](scripts/supabase-data-dictionary.sql)).
2. Configure o `.env` da API:

```bash
SUPABASE_DATA_DICTIONARY_TABLE=data_dictionary
```

3. Sempre que um dicionario for selecionado na rotina `Excel/CSV para SQL`, os dados sao atualizados nessa tabela.
4. Para fallback direto no frontend (sem depender da rota da API), configure tambem no build:

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SUPABASE_DATA_DICTIONARY_TABLE=data_dictionary
```

## Apontamento diario de atividades

Nova rotina para registrar as atividades executadas por recurso no dia, com horas e observacoes.

Modelo de dados:
- `daily_activities`: (`id, date, resource, activity, hours, notes`)

1. Crie a tabela no Supabase (exemplo em [scripts/supabase-daily-activities.sql](scripts/supabase-daily-activities.sql)).
2. Configure o `.env`:

```bash
SUPABASE_DAILY_ACTIVITIES_TABLE=daily_activities
```

3. Libere o menu `Apontamento Diario` no cadastro de usuarios para quem deve acessar a rotina.

## Central de Clientes

Backend implementado com CRUD completo para as rotinas:
- `Clientes`
- `Contatos`
- `Sistemas`
- `Processos`
- `Historico`

Endpoints principais:
- `GET /api/customer-hub/bootstrap`
- `GET/POST/PUT/DELETE /api/customer-hub/clients`
- `GET/POST/PUT/DELETE /api/customer-hub/contacts`
- `GET/POST/PUT/DELETE /api/customer-hub/systems`
- `GET/POST/PUT/DELETE /api/customer-hub/processes`
- `GET/POST/PUT/DELETE /api/customer-hub/activities`

1. Crie as tabelas no Supabase com [scripts/supabase-customer-hub.sql](scripts/supabase-customer-hub.sql).
2. Configure as variaveis no `.env` da API:

```bash
SUPABASE_CUSTOMER_CLIENTS_TABLE=customer_hub_clients
SUPABASE_CUSTOMER_CONTACTS_TABLE=customer_hub_contacts
SUPABASE_CUSTOMER_SYSTEMS_TABLE=customer_hub_systems
SUPABASE_CUSTOMER_PROCESSES_TABLE=customer_hub_processes
SUPABASE_CUSTOMER_ACTIVITIES_TABLE=customer_hub_activities
```
