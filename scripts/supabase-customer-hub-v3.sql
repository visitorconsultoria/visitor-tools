-- Migration: Central de Clientes v3
-- Adiciona a entidade de acessos por cliente

alter table if exists public.customer_hub_clients
  add column if not exists organizations text not null default '';

alter table if exists public.customer_hub_clients
  drop column if exists parceiro;

create table if not exists public.customer_hub_accesses (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.customer_hub_clients(id) on delete cascade,
  tipo text not null default 'vpn'
    check (tipo in ('vpn', 'servidores', 'protheus', 'outros')),
  nome text not null,
  endereco text not null default '',
  usuario text not null default '',
  senha text not null default '',
  observacoes text not null default '',
  particular boolean not null default false,
  created_by_username text not null default '',
  created_at timestamptz not null default now()
);

alter table if exists public.customer_hub_accesses
  add column if not exists particular boolean not null default false;

alter table if exists public.customer_hub_accesses
  add column if not exists created_by_username text not null default '';

create index if not exists idx_customer_hub_accesses_cliente_id
  on public.customer_hub_accesses (cliente_id);

create index if not exists idx_customer_hub_accesses_tipo
  on public.customer_hub_accesses (tipo);

create index if not exists idx_customer_hub_accesses_particular_owner
  on public.customer_hub_accesses (particular, created_by_username);