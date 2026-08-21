-- Tabelas da Central de Serviços
-- Executar no Supabase SQL Editor

-- Permissao por recurso usada no login e nas rotas da Central de Servicos.
alter table public.app_users
  add column if not exists central_servicos_resource_scope text not null default 'all';

alter table public.app_users
  drop constraint if exists app_users_central_servicos_resource_scope_check;

alter table public.app_users
  add constraint app_users_central_servicos_resource_scope_check
  check (central_servicos_resource_scope in ('all', 'self'));

create table if not exists public.central_servicos_recursos (
  id bigint generated always as identity primary key,
  nome text not null default '',
  cpf text not null default '',
  cnpj text not null default '',
  sexo text not null default 'Nao Informado' check (sexo in ('Nao Informado', 'Masculino', 'Feminino', 'Outro')),
  data_nascimento date,
  email_pessoal text not null default '',
  dados_pagamento text not null default '',
  status text not null default 'Ativo' check (status in ('Ativo', 'Inativo', 'Bloqueado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.central_servicos_contratos_servicos (
  id bigint generated always as identity primary key,
  contrato_base_id bigint,
  versao integer not null default 1 check (versao > 0),
  titulo text not null default '',
  tipo text not null default 'Cliente' check (tipo in ('Cliente', 'Recurso')),
  relaciona text not null default '',
  descricao text not null default '',
  tipo_contrato text not null default 'Recorrente' check (tipo_contrato in ('Recorrente', 'Banco de Horas', 'Delivery', 'Projeto')),
  valor_unitario numeric(14,2),
  tipo_valor text not null default 'Hora' check (tipo_valor in ('Hora', 'Valor', 'Tarefa')),
  quantidade numeric(14,2),
  saldo_quantidade numeric(14,2),
  saldo_valor numeric(14,2),
  data_inicio date,
  vigencia_inicio date,
  vigencia_termino date,
  observacoes text not null default '',
  faturamento_corpo_nota text not null default '',
  faturamento_documentos text not null default '',
  faturamento_prazo_emissao text not null default '',
  faturamento_data_vencimento date,
  faturamento_codigo_servico text not null default '',
  status text not null default 'Ativo' check (status in ('Ativo', 'Encerrado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.central_servicos_contratos_servicos
  add column if not exists contrato_base_id bigint;

alter table public.central_servicos_contratos_servicos
  add column if not exists versao integer not null default 1;

alter table public.central_servicos_contratos_servicos
  add column if not exists saldo_quantidade numeric(14,2);

alter table public.central_servicos_contratos_servicos
  add column if not exists saldo_valor numeric(14,2);

alter table public.central_servicos_contratos_servicos
  add column if not exists faturamento_corpo_nota text not null default '';

alter table public.central_servicos_contratos_servicos
  add column if not exists faturamento_documentos text not null default '';

alter table public.central_servicos_contratos_servicos
  add column if not exists faturamento_prazo_emissao text not null default '';

alter table public.central_servicos_contratos_servicos
  add column if not exists faturamento_data_vencimento date;

alter table public.central_servicos_contratos_servicos
  add column if not exists faturamento_codigo_servico text not null default '';

update public.central_servicos_contratos_servicos
set contrato_base_id = id
where contrato_base_id is null;

update public.central_servicos_contratos_servicos
set saldo_quantidade = quantidade,
    saldo_valor = case when quantidade is not null and valor_unitario is not null then quantidade * valor_unitario else null end
where tipo_contrato = 'Banco de Horas'
  and saldo_quantidade is null;

create table if not exists public.central_servicos_despesas (
  id bigint generated always as identity primary key,
  titulo text not null default '',
  tipo text not null default 'Cliente' check (tipo in ('Cliente', 'Recurso')),
  relaciona text not null default '',
  descricao text not null default '',
  tipo_despesa text not null default 'Fixa' check (tipo_despesa in ('Fixa', 'Avulsa')),
  valor_unitario numeric(14,2),
  tipo_valor text not null default 'Hora' check (tipo_valor in ('Hora', 'Valor', 'Tarefa')),
  quantidade numeric(14,2),
  data_inicio date,
  vigencia_inicio date,
  vigencia_termino date,
  observacoes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.central_servicos_faturamentos (
  id bigint generated always as identity primary key,
  contrato_id bigint,
  titulo text not null default '',
  nota text not null default '',
  emissao date,
  referencia text not null default '',
  previsao_pagamento date,
  cliente text not null default '',
  contrato text not null default '',
  descricao text not null default '',
  quantidade numeric(14,2),
  valor numeric(14,2),
  status text not null default 'Pendente' check (status in ('Pendente', 'Faturado', 'Pago')),
  data_pagamento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.central_servicos_faturamentos
  add column if not exists contrato_id bigint;

alter table public.central_servicos_faturamentos
  add column if not exists quantidade numeric(14,2);

create table if not exists public.central_servicos_pagamentos (
  id bigint generated always as identity primary key,
  titulo text not null default '',
  nota text not null default '',
  emissao date,
  referencia text not null default '',
  previsao_pagamento date,
  tipo text not null default 'Cliente' check (tipo in ('Cliente', 'Recurso')),
  relaciona text not null default '',
  contrato text not null default '',
  descricao text not null default '',
  valor numeric(14,2),
  status text not null default 'Pendente' check (status in ('Pendente', 'Pago')),
  data_pagamento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.central_servicos_agendas (
  id bigint generated always as identity primary key,
  recurso text not null default '',
  cliente text not null default '',
  contrato_id bigint,
  contrato text not null default '',
  dedicacao text not null default 'Full' check (dedicacao in ('Full', 'Parcial', 'Avulsa', 'Parcial + Avulsa')),
  dias_semana text[] not null default '{}',
  datas_avulsas date[] not null default '{}',
  vigencia_inicio date,
  vigencia_termino date,
  observacoes text not null default '',
  status text not null default 'Ativo' check (status in ('Ativo', 'Encerrado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recurso, cliente)
);

alter table public.central_servicos_agendas
  add column if not exists contrato_id bigint;

alter table public.central_servicos_agendas
  add column if not exists contrato text not null default '';

alter table public.central_servicos_agendas
  add column if not exists datas_avulsas date[] not null default '{}';

alter table public.central_servicos_agendas
  drop constraint if exists central_servicos_agendas_dedicacao_check;

alter table public.central_servicos_agendas
  add constraint central_servicos_agendas_dedicacao_check
  check (dedicacao in ('Full', 'Parcial', 'Avulsa', 'Parcial + Avulsa'));

alter table public.central_servicos_recursos disable row level security;
alter table public.central_servicos_contratos_servicos disable row level security;
alter table public.central_servicos_despesas disable row level security;
alter table public.central_servicos_faturamentos disable row level security;
alter table public.central_servicos_pagamentos disable row level security;
alter table public.central_servicos_agendas disable row level security;

create index if not exists idx_central_servicos_recursos_nome
  on public.central_servicos_recursos (nome);

create index if not exists idx_central_servicos_contratos_servicos_titulo
  on public.central_servicos_contratos_servicos (titulo);

create index if not exists idx_central_servicos_contratos_servicos_relaciona
  on public.central_servicos_contratos_servicos (relaciona);

create index if not exists idx_central_servicos_contratos_servicos_base
  on public.central_servicos_contratos_servicos (contrato_base_id, versao);

create index if not exists idx_central_servicos_despesas_titulo
  on public.central_servicos_despesas (titulo);

create index if not exists idx_central_servicos_despesas_relaciona
  on public.central_servicos_despesas (relaciona);

create index if not exists idx_central_servicos_faturamentos_titulo
  on public.central_servicos_faturamentos (titulo);

create index if not exists idx_central_servicos_faturamentos_cliente
  on public.central_servicos_faturamentos (cliente);

create index if not exists idx_central_servicos_pagamentos_titulo
  on public.central_servicos_pagamentos (titulo);

create index if not exists idx_central_servicos_pagamentos_contrato
  on public.central_servicos_pagamentos (contrato);

create index if not exists idx_central_servicos_agendas_recurso
  on public.central_servicos_agendas (recurso);

create index if not exists idx_central_servicos_agendas_cliente
  on public.central_servicos_agendas (cliente);

create index if not exists idx_central_servicos_agendas_contrato
  on public.central_servicos_agendas (contrato_id);

create table if not exists public.central_servicos_atendimentos (
  id bigint generated always as identity primary key,
  numero text not null default '',
  data date,
  tipo text not null default '',
  cliente text not null default '',
  solicitante text not null default '',
  descricao text not null default '',
  responsavel text not null default '',
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  observacoes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.central_servicos_atendimentos disable row level security;

create index if not exists idx_central_servicos_atendimentos_cliente
  on public.central_servicos_atendimentos (cliente);

create index if not exists idx_central_servicos_atendimentos_data
  on public.central_servicos_atendimentos (data);

create index if not exists idx_central_servicos_atendimentos_status
  on public.central_servicos_atendimentos (status);

-- migration: add relaciona to existing installations
alter table public.central_servicos_pagamentos
  add column if not exists relaciona text not null default '';
