-- Tabela de Propostas Comerciais
-- Executar no Supabase SQL Editor

create table if not exists public.propostas_comerciais (
  id                      bigint generated always as identity primary key,
  cliente                 text not null default '',
  projeto                 text not null default '',
  contato                 text not null default '',
  tipo                    text not null default '',
  data_proposta           date not null,
  desenvolvimento         boolean not null default false,
  objetivo                text not null default '',
  escopo_titulo           text not null default '',
  escopo_conteudo         text not null default '',
  precificacao_titulo     text not null default '',
  precificacao_descricao  text not null default '',
  precificacao_itens      jsonb not null default '[]'::jsonb,
  banco_horas_conteudo    text not null default '',
  delivery_itens          jsonb not null default '[]'::jsonb,
  outras_informacoes      text not null default '',
  incluir_objetivo               boolean not null default true,
  incluir_escopo                 boolean not null default true,
  incluir_precificacao           boolean not null default true,
  incluir_banco_horas            boolean not null default true,
  incluir_delivery               boolean not null default true,
  incluir_outras_informacoes     boolean not null default true,
  status                  text not null default 'draft' check (status in ('draft', 'sent')),
  estimativa_id           bigint,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- RLS: disable para acesso via service role
alter table public.propostas_comerciais disable row level security;

-- Index para ordenação
create index if not exists idx_propostas_comerciais_created_at
  on public.propostas_comerciais (created_at desc);

-- ─── Migração: adicionar colunas de inclusão (para tabelas já existentes) ────
alter table public.propostas_comerciais
  add column if not exists incluir_objetivo             boolean not null default true,
  add column if not exists incluir_escopo               boolean not null default true,
  add column if not exists incluir_precificacao         boolean not null default true,
  add column if not exists incluir_banco_horas          boolean not null default true,
  add column if not exists incluir_delivery             boolean not null default true,
  add column if not exists incluir_outras_informacoes   boolean not null default true;
