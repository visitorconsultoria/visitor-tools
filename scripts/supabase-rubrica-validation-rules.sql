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

comment on table public.rubrica_reference_catalogs is
'Cadastros basicos de validacao de rubricas (eSocial/Protheus).';

comment on table public.rubrica_reference_items is
'Itens das tabelas de referencia de rubricas com relacao 1:N por catalog_id, vigencia e links normativos.';
