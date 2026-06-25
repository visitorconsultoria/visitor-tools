import process from 'node:process'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim()
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Configuracao ausente: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios no .env')
  process.exit(1)
}

const SQL_SCRIPT = `
create table if not exists public.rubrica_reference_catalogs (
  id bigserial primary key,
  catalog_key text not null unique,
  catalog_label text not null,
  allow_multiple_links boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rubrica_reference_items (
  id bigserial primary key,
  catalog_id bigint,
  catalog_key text,
  code text not null,
  short_description text not null,
  full_description text not null,
  valid_from date,
  valid_to date,
  reference_links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_rubrica_reference_items_links_array check (jsonb_typeof(reference_links) = 'array'),
  constraint ck_rubrica_reference_items_valid_period check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

alter table if exists public.rubrica_reference_items
  add column if not exists catalog_id bigint;

alter table if exists public.rubrica_reference_items
  add column if not exists catalog_key text;

alter table if exists public.rubrica_reference_items
  alter column catalog_key drop not null;

update public.rubrica_reference_items as i
set catalog_id = c.id
from public.rubrica_reference_catalogs as c
where i.catalog_id is null
  and i.catalog_key is not null
  and i.catalog_key = c.catalog_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rubrica_reference_items_catalog_id_fkey'
  ) then
    alter table public.rubrica_reference_items
      add constraint rubrica_reference_items_catalog_id_fkey
      foreign key (catalog_id)
      references public.rubrica_reference_catalogs(id)
      on update cascade
      on delete cascade;
  end if;
end $$;

alter table if exists public.rubrica_reference_items
  drop constraint if exists rubrica_reference_items_catalog_key_fkey;

alter table if exists public.rubrica_reference_items
  drop constraint if exists uq_rubrica_reference_items_catalog_code;

alter table if exists public.rubrica_reference_items
  drop constraint if exists uq_rubrica_reference_items_catalog_id_code;

alter table if exists public.rubrica_reference_items
  add constraint uq_rubrica_reference_items_catalog_id_code unique (catalog_id, code);

do $$
begin
  if exists (
    select 1
    from public.rubrica_reference_items
    where catalog_id is null
    limit 1
  ) then
    raise notice 'rubrica_reference_items ainda possui linhas sem catalog_id; mantenha catalog_id nullable ate concluir a migracao.';
  else
    alter table public.rubrica_reference_items
      alter column catalog_id set not null;
  end if;
end $$;

create index if not exists idx_rubrica_reference_items_catalog_id_code
  on public.rubrica_reference_items (catalog_id, code);

create index if not exists idx_rubrica_reference_items_catalog_id_valid_from
  on public.rubrica_reference_items (catalog_id, valid_from);

create or replace function public.set_rubrica_reference_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rubrica_reference_catalogs_updated_at on public.rubrica_reference_catalogs;

create trigger trg_rubrica_reference_catalogs_updated_at
before update on public.rubrica_reference_catalogs
for each row
execute function public.set_rubrica_reference_updated_at();

drop trigger if exists trg_rubrica_reference_items_updated_at on public.rubrica_reference_items;

create trigger trg_rubrica_reference_items_updated_at
before update on public.rubrica_reference_items
for each row
execute function public.set_rubrica_reference_updated_at();

insert into public.rubrica_reference_catalogs (catalog_key, catalog_label, allow_multiple_links)
values
  ('natureza-rubricas', 'Tabela de Natureza de Rubricas', false),
  ('inc-cp', 'Tabela Inc. CP', false),
  ('inc-fgts', 'Tabela Inc. FGTS', false),
  ('inc-pis', 'Tabela Inc. PIS', false),
  ('inc-rpps', 'Tabela Inc. RPPS', false),
  ('inc-irrf', 'Tabela Inc. IRRF', false),
  ('dirf-protheus', 'Tabela DIRF - Protheus', false),
  ('id-calculo-protheus', 'Tabela ID CALCULO - Protheus', true)
on conflict (catalog_key)
do update
set
  catalog_label = excluded.catalog_label,
  allow_multiple_links = excluded.allow_multiple_links,
  updated_at = now();

update public.rubrica_reference_items as i
set catalog_id = c.id
from public.rubrica_reference_catalogs as c
where i.catalog_id is null
  and i.catalog_key is not null
  and i.catalog_key = c.catalog_key;

alter table public.rubrica_reference_catalogs disable row level security;
alter table public.rubrica_reference_items disable row level security;

comment on table public.rubrica_reference_catalogs is
'Cadastros basicos de validacao de rubricas (eSocial/Protheus).';

comment on table public.rubrica_reference_items is
'Itens das tabelas de referencia de rubricas com relacao 1:N por catalog_id, vigencia e links normativos.';

create table if not exists public.rubrica_rule_sets (
  id bigserial primary key,
  name text not null unique,
  description text not null default '',
  source_file_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rubrica_rule_items (
  id bigserial primary key,
  rule_set_id bigint not null
    references public.rubrica_rule_sets(id)
    on update cascade
    on delete cascade,
  sort_order integer not null default 0,
  rv_desc text not null default '',
  rv_descdet text not null default '',
  rv_codfol text not null default '',
  rv_tipo text not null default '',
  rv_codcorr text not null default '',
  rv_inss text not null default '',
  rv_inssfer text not null default '',
  rv_ir text not null default '',
  rv_fgts text not null default '',
  rv_rra text not null default '',
  rv_pis text not null default '',
  rv_dirf text not null default '',
  rv_ref13 text not null default '',
  rv_reffer text not null default '',
  rv_refabon text not null default '',
  rv_adianta text not null default '',
  rv_empcons text not null default '',
  rv_refplr text not null default '',
  rv_he text not null default '',
  rv_coddsr text not null default '',
  rv_compl_ text not null default '',
  rv_codcom_ text not null default '',
  rv_codmseg text not null default '',
  rv_ferseg text not null default '',
  rv_naturez text not null default '',
  rv_incirf text not null default '',
  rv_incfgts text not null default '',
  rv_inccp text not null default '',
  rv_incop text not null default '',
  rv_tetop text not null default '',
  rv_contrap text not null default '',
  rv_incpis text not null default '',
  rv_ferdesc text not null default '',
  rv_subst text not null default '',
  rv_ferxml text not null default '',
  rv_feraxml text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rubrica_rule_items'
      and column_name = 'rv_origem'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rubrica_rule_items'
      and column_name = 'rv_naturez'
  ) then
    alter table public.rubrica_rule_items
      add column rv_naturez text not null default '';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rubrica_rule_items'
      and column_name = 'rv_origem'
  ) then
    update public.rubrica_rule_items
    set rv_naturez = rv_origem
    where coalesce(rv_naturez, '') = ''
      and coalesce(rv_origem, '') <> '';
  end if;
end;
$$;

create index if not exists idx_rubrica_rule_items_rule_set_sort
  on public.rubrica_rule_items (rule_set_id, sort_order, id);

create or replace function public.set_rubrica_rule_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rubrica_rule_sets_updated_at on public.rubrica_rule_sets;

create trigger trg_rubrica_rule_sets_updated_at
before update on public.rubrica_rule_sets
for each row
execute function public.set_rubrica_rule_updated_at();

drop trigger if exists trg_rubrica_rule_items_updated_at on public.rubrica_rule_items;

create trigger trg_rubrica_rule_items_updated_at
before update on public.rubrica_rule_items
for each row
execute function public.set_rubrica_rule_updated_at();

alter table public.rubrica_rule_sets disable row level security;
alter table public.rubrica_rule_items disable row level security;

comment on table public.rubrica_rule_sets is
'Cadastros importados da Tabela de Regra para validacao de rubricas.';

comment on table public.rubrica_rule_items is
'Itens da Tabela de Regra com suporte a CRUD, replicacao e multiplos cadastros importados.';
`

async function executeSetup() {
  console.log('🔧 Configurando Supabase para Cadastros Basicos de Rubricas...\n')

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let tablesReady = false

  try {
    console.log('📋 Executando SQL de criacao de tabelas e catalogo...')
    const { error: sqlError } = await client.rpc('exec', {
      sql: SQL_SCRIPT,
    })

    if (sqlError) {
      console.log(`⚠️  RPC exec retornou erro: ${sqlError.message}`)
    } else {
      console.log('✅ Tabelas criadas com sucesso!')
      tablesReady = true
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.warn(`⚠️  Nao foi possivel executar o SQL via RPC: ${detail}`)
  }

  if (!tablesReady) {
    console.log('\n🔎 Validando se as tabelas ja existem no projeto...')

    const [
      { error: catalogsError },
      { error: itemsError },
      { error: ruleSetsError },
      { error: ruleItemsError },
    ] = await Promise.all([
      client.from('rubrica_reference_catalogs').select('id').limit(1),
      client.from('rubrica_reference_items').select('id').limit(1),
      client.from('rubrica_rule_sets').select('id').limit(1),
      client.from('rubrica_rule_items').select('id').limit(1),
    ])

    if (!catalogsError && !itemsError && !ruleSetsError && !ruleItemsError) {
      tablesReady = true
      console.log('✅ Tabelas ja existentes e acessiveis no Supabase')
    } else {
      if (catalogsError) {
        console.log(`⚠️  rubrica_reference_catalogs: ${catalogsError.message}`)
      }

      if (itemsError) {
        console.log(`⚠️  rubrica_reference_items: ${itemsError.message}`)
      }

      if (ruleSetsError) {
        console.log(`⚠️  rubrica_rule_sets: ${ruleSetsError.message}`)
      }

      if (ruleItemsError) {
        console.log(`⚠️  rubrica_rule_items: ${ruleItemsError.message}`)
      }

      console.log('\n⚠️  Para criar as tabelas, execute este SQL no Supabase SQL Editor:\n')
      console.log('---START SQL---')
      console.log(SQL_SCRIPT)
      console.log('---END SQL---\n')
      process.exit(1)
    }
  }

  const { error: schemaValidationError } = await client
    .from('rubrica_reference_items')
    .select('catalog_id')
    .limit(1)

  if (schemaValidationError) {
    console.log(`⚠️  Estrutura de rubricas desatualizada: ${schemaValidationError.message}`)
    console.log('\n⚠️  Execute o SQL atualizado em scripts/supabase-rubrica-validation-rules.sql no Supabase SQL Editor e rode novamente o setup.\n')
    process.exit(1)
  }

  console.log('\n📦 Importando dados dos arquivos XLSX...')
  console.log('Executando: npm run import:rubricas\n')

  const { spawn } = await import('node:child_process')
  const proc = spawn('npm', ['run', 'import:rubricas'], {
    stdio: 'inherit',
    shell: true,
  })

  proc.on('close', (code) => {
    if (code === 0) {
      console.log('\n✅ Setup completo! Seu banco Supabase está pronto para uso.')
      console.log('   Acesse o item do menu "Cadastros Basicos - Rubricas" para gerenciar os dados.')
    } else {
      console.log(`\n❌ Import falhou com código ${code}`)
      console.log('   Execute manualmente: npm run import:rubricas')
    }
    process.exit(code)
  })
}

executeSetup().catch((error) => {
  console.error('Erro:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
