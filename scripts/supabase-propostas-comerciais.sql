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
