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
CORS_ALLOWED_ORIGINS=https://SEU_USUARIO.github.io
```

Depois de publicar, voce tera uma URL da API, por exemplo:

`https://visitor-tools-api.onrender.com`

### 2) Publicar o frontend apontando para a API

No seu terminal local, defina a URL da API para o build da Vite e publique:

```bash
$env:VITE_API_BASE_URL="https://visitor-tools-api.onrender.com"
npm run deploy
```

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
- Cada usuario pode receber acesso aos menus: `Comparar Projeto`, `XML para Excel`, `Ranking de Curriculos` e `Estimativas`.

1. Crie a tabela de usuarios no Supabase (exemplo em [scripts/supabase-users.sql](scripts/supabase-users.sql)).
2. Configure o `.env`:

```bash
SUPABASE_USERS_TABLE=app_users
```

3. Utilize o login inicial `visitor / Visitor@2026` e cadastre os demais usuarios pela nova rotina.

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
