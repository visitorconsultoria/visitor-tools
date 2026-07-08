-- Tabelas do modulo Projeto Dev
-- Executar no Supabase SQL Editor

create table if not exists public.dev_projects (
  id bigint generated always as identity primary key,
  client text not null default '',
  date date not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dev_project_items (
  id bigint generated always as identity primary key,
  project_id bigint not null references public.dev_projects(id) on delete cascade,
  module text not null default '',
  type text not null default 'outros',
  description text not null default '',
  complexity text not null default 'baixa',
  notes text not null default '',
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_project_items_type_check
    check (type in ('cadastro', 'processo', 'relatorio', 'formula', 'dicionario', 'workflow', 'outros')),
  constraint dev_project_items_complexity_check
    check (complexity in ('baixa', 'media', 'alta'))
);

-- RLS: disable para acesso via service role
alter table public.dev_projects disable row level security;
alter table public.dev_project_items disable row level security;

create index if not exists idx_dev_projects_date
  on public.dev_projects (date desc);

create index if not exists idx_dev_project_items_project
  on public.dev_project_items (project_id, sort_order, id);
