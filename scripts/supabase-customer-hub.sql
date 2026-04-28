create table if not exists public.customer_hub_clients (
  id bigint generated always as identity primary key,
  nome text not null,
  cnpj text not null default '',
  segmento text not null default '',
  cidade text not null default '',
  status text not null default 'Ativo' check (status in ('Ativo', 'Inativo', 'Em Implantacao')),
  parceiro text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.customer_hub_contacts (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.customer_hub_clients(id) on delete cascade,
  nome text not null,
  cargo text not null default '',
  departamento text not null default '',
  email text not null default '',
  telefone text not null default '',
  tipo text not null default 'Usuario' check (tipo in ('Gestao', 'Usuario', 'Tecnico')),
  created_at timestamptz not null default now()
);

create table if not exists public.customer_hub_accesses (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.customer_hub_clients(id) on delete cascade,
  tipo text not null default 'vpn' check (tipo in ('vpn', 'servidores', 'protheus', 'outros')),
  nome text not null,
  endereco text not null default '',
  usuario text not null default '',
  senha text not null default '',
  observacoes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.customer_hub_systems (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.customer_hub_clients(id) on delete cascade,
  contato_id bigint references public.customer_hub_contacts(id) on delete set null,
  produto text not null,
  modulo text not null default '',
  versao text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.customer_hub_processes (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.customer_hub_clients(id) on delete cascade,
  nome text not null,
  descricao text not null default '',
  criado_em date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_hub_activities (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.customer_hub_clients(id) on delete cascade,
  tipo text not null default 'Atividade',
  descricao text not null,
  data date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_hub_clients_nome
  on public.customer_hub_clients (nome);

create index if not exists idx_customer_hub_contacts_cliente_id
  on public.customer_hub_contacts (cliente_id);

create index if not exists idx_customer_hub_accesses_cliente_id
  on public.customer_hub_accesses (cliente_id);

create index if not exists idx_customer_hub_accesses_tipo
  on public.customer_hub_accesses (tipo);

create index if not exists idx_customer_hub_systems_cliente_id
  on public.customer_hub_systems (cliente_id);

create index if not exists idx_customer_hub_systems_contato_id
  on public.customer_hub_systems (contato_id);

create index if not exists idx_customer_hub_processes_cliente_id
  on public.customer_hub_processes (cliente_id);

create index if not exists idx_customer_hub_processes_criado_em
  on public.customer_hub_processes (criado_em desc);

create index if not exists idx_customer_hub_activities_cliente_id
  on public.customer_hub_activities (cliente_id);

create index if not exists idx_customer_hub_activities_data
  on public.customer_hub_activities (data desc);
