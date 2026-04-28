-- Migration: Central de Clientes v2
-- Alinha o schema com o projeto visitor-hub-app

-- ============================================================
-- CLIENTES: adiciona data_inicio e fonte; remove parceiro
-- ============================================================
alter table public.customer_hub_clients
  add column if not exists data_inicio date,
  add column if not exists fonte text not null default 'interno'
    check (fonte in ('interno', 'totvs', 'outros'));

-- Mantém parceiro para compatibilidade retroativa (pode remover manualmente)
-- alter table public.customer_hub_clients drop column if exists parceiro;

-- ============================================================
-- CONTATOS: expande tipos
-- ============================================================
-- Remove constraint atual e recria com os valores expandidos
alter table public.customer_hub_contacts
  drop constraint if exists customer_hub_contacts_tipo_check;

alter table public.customer_hub_contacts
  add constraint customer_hub_contacts_tipo_check
    check (tipo in ('comercial', 'servicos', 'tecnico', 'usuario', 'gestao', 'outros'));

-- Migra valores antigos para o novo padrão (lowercase)
update public.customer_hub_contacts set tipo = 'gestao'   where tipo = 'Gestao';
update public.customer_hub_contacts set tipo = 'usuario'  where tipo = 'Usuario';
update public.customer_hub_contacts set tipo = 'tecnico'  where tipo = 'Tecnico';

alter table public.customer_hub_contacts
  alter column tipo set default 'comercial';

-- ============================================================
-- SISTEMAS: adiciona integracoes, responsavel, observacoes
--           mantém modulo/versao, produto renomeado é tratado no código
-- ============================================================
alter table public.customer_hub_systems
  add column if not exists integracoes text not null default '',
  add column if not exists responsavel text not null default '',
  add column if not exists observacoes text not null default '';

-- ============================================================
-- PROCESSOS: adiciona campos novos
-- ============================================================
alter table public.customer_hub_processes
  add column if not exists sistema_nome text not null default '',
  add column if not exists modulo text not null default '',
  add column if not exists responsavel text not null default '',
  add column if not exists detalhamento text not null default '',
  add column if not exists observacoes text not null default '',
  add column if not exists periodicidade text not null default 'mensal'
    check (periodicidade in ('diario','semanal','quinzenal','mensal','semestral','anual','sazonal')),
  add column if not exists criticidade text not null default 'media'
    check (criticidade in ('baixa','media','alta'));

-- ============================================================
-- HISTORICO (activities): alinha com HistoryEntry do visitor-hub-app
-- ============================================================
alter table public.customer_hub_activities
  add column if not exists evento text not null default '',
  add column if not exists sistema_nome text not null default '',
  add column if not exists modulo text not null default '',
  add column if not exists responsavel text not null default '',
  add column if not exists processo_nome text not null default '',
  add column if not exists observacoes text not null default '';

-- Migra descricao -> observacoes para registros existentes (se descricao tiver valor)
update public.customer_hub_activities
  set observacoes = descricao
  where observacoes = '' and descricao <> '';

-- Migra tipo -> evento para registros existentes
update public.customer_hub_activities
  set evento = tipo
  where evento = '' and tipo <> '';
