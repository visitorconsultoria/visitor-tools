-- Migration: Central de Clientes v3
-- Adiciona a entidade de acessos por cliente

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
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_hub_accesses_cliente_id
  on public.customer_hub_accesses (cliente_id);

create index if not exists idx_customer_hub_accesses_tipo
  on public.customer_hub_accesses (tipo);