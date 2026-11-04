-- Execute no Supabase SQL Editor antes de atualizar a API de Atendimentos.
alter table public.central_servicos_atendimentos
  add column if not exists data_prevista date,
  add column if not exists data_conclusao date;

create table if not exists public.central_servicos_atendimento_historico (
  id bigint generated always as identity primary key,
  atendimento_id bigint not null references public.central_servicos_atendimentos(id) on delete cascade,
  acao text not null check (acao in ('inclusao', 'alteracao')),
  ocorrido_em timestamptz not null default clock_timestamp(),
  usuario text not null,
  usuario_nome text not null default '',
  valores_anteriores jsonb,
  valores_novos jsonb not null,
  alteracoes jsonb not null
);

create index if not exists idx_atendimento_historico_atendimento
  on public.central_servicos_atendimento_historico (atendimento_id, id desc);

alter table public.central_servicos_atendimento_historico disable row level security;
revoke all on public.central_servicos_atendimento_historico from public, anon, authenticated, service_role;
grant select, insert on public.central_servicos_atendimento_historico to service_role;
revoke all on sequence public.central_servicos_atendimento_historico_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.central_servicos_atendimento_historico_id_seq to service_role;

create or replace function public.central_servicos_atendimento_datas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and new.data_conclusao is null then
    if tg_op = 'INSERT' then
      new.data_conclusao := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
    elsif old.status is distinct from 'done' then
      new.data_conclusao := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.central_servicos_atendimento_auditar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  antes jsonb;
  depois jsonb := to_jsonb(new) - array['id', 'created_at', 'updated_at'];
  diferencas jsonb;
begin
  if tg_op = 'UPDATE' then
    antes := to_jsonb(old) - array['id', 'created_at', 'updated_at'];
    if antes = depois then
      return new;
    end if;
  end if;
  select coalesce(jsonb_object_agg(campo.key, jsonb_build_object(
    'anterior', antes -> campo.key, 'novo', campo.value
  )), '{}'::jsonb) into diferencas
  from jsonb_each(depois) campo
  where campo.value is distinct from antes -> campo.key;

  insert into public.central_servicos_atendimento_historico (
    atendimento_id, acao, usuario, usuario_nome, valores_anteriores, valores_novos, alteracoes
  ) values (
    new.id, case when tg_op = 'INSERT' then 'inclusao' else 'alteracao' end,
    coalesce(nullif(current_setting('visitor.atendimento_usuario', true), ''), 'Banco de dados'),
    coalesce(current_setting('visitor.atendimento_usuario_nome', true), ''),
    antes, depois, diferencas
  );
  return new;
end;
$$;

drop trigger if exists trg_atendimento_datas on public.central_servicos_atendimentos;
create trigger trg_atendimento_datas
before insert or update on public.central_servicos_atendimentos
for each row execute function public.central_servicos_atendimento_datas();

drop trigger if exists trg_atendimento_auditar on public.central_servicos_atendimentos;
create trigger trg_atendimento_auditar
after insert or update on public.central_servicos_atendimentos
for each row execute function public.central_servicos_atendimento_auditar();

create or replace function public.central_servicos_salvar_atendimento(
  p_id bigint,
  p_dados jsonb,
  p_usuario text,
  p_usuario_nome text default ''
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  anterior public.central_servicos_atendimentos%rowtype;
  dados public.central_servicos_atendimentos%rowtype;
  salvo public.central_servicos_atendimentos%rowtype;
  usuario_anterior text := coalesce(current_setting('visitor.atendimento_usuario', true), '');
  nome_anterior text := coalesce(current_setting('visitor.atendimento_usuario_nome', true), '');
begin
  if nullif(btrim(p_usuario), '') is null then
    raise exception 'Usuário de sessão não informado.';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados do atendimento inválidos.';
  end if;
  if p_id is not null then
    select * into anterior from public.central_servicos_atendimentos where id = p_id for update;
    if not found then
      raise exception 'Atendimento não encontrado.';
    end if;
  end if;
  dados := jsonb_populate_record(anterior, p_dados);
  if dados.data is null or nullif(btrim(dados.solicitante), '') is null
      or nullif(btrim(dados.descricao), '') is null or nullif(btrim(dados.responsavel), '') is null then
    raise exception 'Informe data, solicitante, descrição e responsável.';
  end if;
  if coalesce(dados.tipo, '') <> '' and dados.tipo not in (
    'Desenvolvimento', 'Sustentação / Suporte', 'Análise / Diagnóstico', 'Reunião',
    'Testes / Homologação', 'Documentação', 'Proposta / Estimativa',
    'Implantação / Deploy', 'Treinamento', 'Outros'
  ) and (p_id is null or dados.tipo is distinct from anterior.tipo) then
    raise exception 'Tipo de atendimento inválido.';
  end if;

  perform set_config('visitor.atendimento_usuario', btrim(p_usuario), true);
  perform set_config('visitor.atendimento_usuario_nome', coalesce(btrim(p_usuario_nome), ''), true);
  if p_id is null then
    insert into public.central_servicos_atendimentos (
      numero, titulo, data, data_prevista, data_conclusao, tipo, cliente,
      solicitante, descricao, responsavel, status, observacoes
    ) values (
      coalesce(dados.numero, ''), coalesce(dados.titulo, ''), dados.data, dados.data_prevista,
      dados.data_conclusao, coalesce(dados.tipo, ''), coalesce(dados.cliente, ''),
      dados.solicitante, dados.descricao, dados.responsavel, coalesce(dados.status, 'open'),
      coalesce(dados.observacoes, '')
    ) returning * into salvo;
  else
    update public.central_servicos_atendimentos set
      numero = coalesce(dados.numero, ''), titulo = coalesce(dados.titulo, ''),
      data = dados.data, data_prevista = dados.data_prevista, data_conclusao = dados.data_conclusao,
      tipo = coalesce(dados.tipo, ''), cliente = coalesce(dados.cliente, ''),
      solicitante = dados.solicitante, descricao = dados.descricao, responsavel = dados.responsavel,
      status = coalesce(dados.status, 'open'), observacoes = coalesce(dados.observacoes, '')
    where id = p_id returning * into salvo;
  end if;
  perform set_config('visitor.atendimento_usuario', usuario_anterior, true);
  perform set_config('visitor.atendimento_usuario_nome', nome_anterior, true);
  return to_jsonb(salvo);
end;
$$;

revoke all on function public.central_servicos_atendimento_datas() from public, anon, authenticated;
revoke all on function public.central_servicos_atendimento_auditar() from public, anon, authenticated;
revoke all on function public.central_servicos_salvar_atendimento(bigint, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.central_servicos_atendimento_datas() to service_role;
grant execute on function public.central_servicos_atendimento_auditar() to service_role;
grant execute on function public.central_servicos_salvar_atendimento(bigint, jsonb, text, text) to service_role;
