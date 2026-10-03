-- Execute no SQL Editor do Supabase antes de utilizar a aba Repasses.
create table if not exists public.central_servicos_faturamento_repasses (
  id bigint generated always as identity primary key,
  faturamento_id bigint not null references public.central_servicos_faturamentos(id),
  recurso_id bigint not null references public.central_servicos_recursos(id),
  valor numeric(14,2) not null check (valor > 0),
  created_at timestamptz not null default now(),
  unique (faturamento_id, recurso_id) deferrable initially deferred
);

alter table public.central_servicos_pagamentos
  add column if not exists repasse_id bigint unique
    references public.central_servicos_faturamento_repasses(id) on delete cascade;

alter table public.central_servicos_faturamento_repasses disable row level security;

create or replace function public.central_servicos_listar_repasses(p_faturamento_id bigint)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.central_servicos_faturamentos where id = p_faturamento_id;
  if not found then
    raise exception 'Faturamento não encontrado.';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'recursoId', r.recurso_id, 'recurso', recurso.nome,
      'valor', r.valor, 'pagamentoId', p.id, 'pagamentoStatus', p.status
    ) order by r.id), '[]'::jsonb)
    from public.central_servicos_faturamento_repasses r
    join public.central_servicos_recursos recurso on recurso.id = r.recurso_id
    left join public.central_servicos_pagamentos p on p.repasse_id = r.id
    where r.faturamento_id = p_faturamento_id
  );
end;
$$;

create or replace function public.central_servicos_salvar_repasses(
  p_faturamento_id bigint,
  p_repasses jsonb default null,
  p_confirmar boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  faturamento public.central_servicos_faturamentos%rowtype;
  repasse public.central_servicos_faturamento_repasses%rowtype;
  pagamento public.central_servicos_pagamentos%rowtype;
  recurso public.central_servicos_recursos%rowtype;
  linha jsonb;
  linhas jsonb;
  recebidos bigint[] := '{}'::bigint[];
  recursos bigint[] := '{}'::bigint[];
  repasse_id bigint;
  recurso_id bigint;
  v_valor numeric;
begin
  select * into faturamento from public.central_servicos_faturamentos
    where id = p_faturamento_id for update;
  if not found then
    raise exception 'Faturamento não encontrado.';
  end if;

  perform 1 from public.central_servicos_faturamento_repasses
    where faturamento_id = p_faturamento_id order by id for update;
  perform 1 from public.central_servicos_pagamentos p
    join public.central_servicos_faturamento_repasses r on r.id = p.repasse_id
    where r.faturamento_id = p_faturamento_id order by p.id for update of p;

  linhas := coalesce(p_repasses, (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'recursoId', r.recurso_id, 'valor', r.valor
    ) order by id), '[]'::jsonb)
    from public.central_servicos_faturamento_repasses r where faturamento_id = p_faturamento_id
  ));
  if jsonb_typeof(linhas) <> 'array' then
    raise exception 'Informe uma lista de repasses.';
  end if;
  if p_confirmar and jsonb_array_length(linhas) = 0 then
    raise exception 'Cadastre pelo menos um repasse antes de confirmar.';
  end if;
  if jsonb_array_length(linhas) > 100 then
    raise exception 'O faturamento permite até 100 repasses.';
  end if;

  for linha in select value from jsonb_array_elements(linhas)
  loop
    repasse_id := (linha->>'id')::bigint;
    recurso_id := (linha->>'recursoId')::bigint;
    v_valor := (linha->>'valor')::numeric;
    if recurso_id is null or recurso_id <= 0 or v_valor is null or v_valor <= 0
        or v_valor > 999999999999.99 or v_valor <> round(v_valor, 2)
        or v_valor::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception 'Informe recurso válido e valor positivo com até duas casas decimais.';
    end if;
    if recurso_id = any(recursos) then
      raise exception 'Cada recurso pode ter somente um repasse por faturamento.';
    end if;
    recursos := array_append(recursos, recurso_id);
    select * into recurso from public.central_servicos_recursos where id = recurso_id for share;
    if not found then
      raise exception 'Recurso não encontrado.';
    end if;
    repasse := null;
    pagamento := null;
    if repasse_id is not null then
      if repasse_id = any(recebidos) then
        raise exception 'Repasse repetido na solicitação.';
      end if;
      select * into repasse from public.central_servicos_faturamento_repasses
        where id = repasse_id and faturamento_id = p_faturamento_id;
      if not found then
        raise exception 'O repasse não pertence a este faturamento.';
      end if;
      select * into pagamento from public.central_servicos_pagamentos p where p.repasse_id = repasse.id;
      if pagamento.status = 'Pago' and (repasse.recurso_id <> recurso_id or repasse.valor <> v_valor) then
        raise exception 'Não é possível alterar um repasse com pagamento Pago.';
      end if;
    end if;
    if recurso.status <> 'Ativo' and (repasse.id is null or repasse.recurso_id <> recurso_id) then
      raise exception 'Selecione um recurso Ativo.';
    end if;
    if repasse.id is null then
      insert into public.central_servicos_faturamento_repasses(faturamento_id, recurso_id, valor)
        values (p_faturamento_id, recurso_id, v_valor) returning * into repasse;
    else
      update public.central_servicos_faturamento_repasses r
        set recurso_id = recurso.id, valor = v_valor
        where r.id = repasse.id;
    end if;
    recebidos := array_append(recebidos, repasse.id);

    if pagamento.id is not null and pagamento.status = 'Pendente' then
      update public.central_servicos_pagamentos
        set relaciona = recurso.nome, valor = v_valor,
            tipo = 'Recurso'
        where id = pagamento.id;
    elsif pagamento.id is null and p_confirmar then
      insert into public.central_servicos_pagamentos(
        repasse_id, titulo, nota, emissao, referencia, previsao_pagamento,
        tipo, relaciona, contrato, descricao, valor, status
      ) values (
        repasse.id, 'Repasse - ' || faturamento.titulo || ' - ' || recurso.nome,
        faturamento.nota, faturamento.emissao, faturamento.referencia, faturamento.previsao_pagamento,
        'Recurso', recurso.nome, faturamento.contrato,
        'Repasse do faturamento #' || p_faturamento_id, v_valor, 'Pendente'
      );
    end if;
  end loop;

  if exists (
    select 1 from public.central_servicos_faturamento_repasses r
    join public.central_servicos_pagamentos p on p.repasse_id = r.id
    where r.faturamento_id = p_faturamento_id and not (r.id = any(recebidos)) and p.status = 'Pago'
  ) then
    raise exception 'Não é possível remover um repasse com pagamento Pago.';
  end if;
  delete from public.central_servicos_faturamento_repasses
    where faturamento_id = p_faturamento_id and not (id = any(recebidos));
  return public.central_servicos_listar_repasses(p_faturamento_id);
end;
$$;

create or replace function public.central_servicos_proteger_repasse_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.central_servicos_pagamentos where repasse_id = old.id and status = 'Pago')
      and (tg_op = 'DELETE' or new is distinct from old) then
    raise exception 'Não é possível alterar ou remover um repasse com pagamento Pago.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists proteger_repasse_pago on public.central_servicos_faturamento_repasses;
create trigger proteger_repasse_pago before update or delete on public.central_servicos_faturamento_repasses
  for each row execute function public.central_servicos_proteger_repasse_pago();

create or replace function public.central_servicos_proteger_pagamento_repasse()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  repasse public.central_servicos_faturamento_repasses%rowtype;
  nome_recurso text;
begin
  if tg_op = 'DELETE' then
    if old.repasse_id is not null and exists (
      select 1 from public.central_servicos_faturamento_repasses where id = old.repasse_id
    ) then
      raise exception 'Remova o repasse pela aba Repasses do faturamento.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.repasse_id is not null and new.repasse_id is distinct from old.repasse_id then
    raise exception 'Não é possível desvincular o pagamento do repasse.';
  end if;
  if tg_op = 'UPDATE' and new.repasse_id is not distinct from old.repasse_id
      and new.tipo is not distinct from old.tipo
      and new.relaciona is not distinct from old.relaciona
      and new.valor is not distinct from old.valor then
    return new;
  end if;
  if new.repasse_id is not null then
    select * into repasse from public.central_servicos_faturamento_repasses where id = new.repasse_id;
    select nome into nome_recurso from public.central_servicos_recursos where id = repasse.recurso_id;
    if new.tipo <> 'Recurso' or new.relaciona <> nome_recurso or new.valor is distinct from repasse.valor then
      raise exception 'Altere o recurso e o valor pela aba Repasses do faturamento.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_pagamento_repasse on public.central_servicos_pagamentos;
create trigger proteger_pagamento_repasse before insert or update or delete on public.central_servicos_pagamentos
  for each row execute function public.central_servicos_proteger_pagamento_repasse();

create or replace function public.central_servicos_excluir_faturamento(p_faturamento_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  faturamento public.central_servicos_faturamentos%rowtype;
begin
  select * into faturamento from public.central_servicos_faturamentos
    where id = p_faturamento_id for update;
  if not found then
    raise exception 'Faturamento não encontrado.';
  end if;

  perform 1 from public.central_servicos_faturamento_repasses
    where faturamento_id = p_faturamento_id order by id for update;
  perform 1 from public.central_servicos_pagamentos p
    join public.central_servicos_faturamento_repasses r on r.id = p.repasse_id
    where r.faturamento_id = p_faturamento_id order by p.id for update of p;
  if exists (
    select 1 from public.central_servicos_pagamentos p
    join public.central_servicos_faturamento_repasses r on r.id = p.repasse_id
    where r.faturamento_id = p_faturamento_id and p.status = 'Pago'
  ) then
    raise exception 'Não é possível excluir um faturamento com repasse que possui pagamento Pago.';
  end if;

  -- Os pagamentos Pendentes vinculados sao removidos pela FK ON DELETE CASCADE.
  delete from public.central_servicos_faturamento_repasses where faturamento_id = p_faturamento_id;
  delete from public.central_servicos_faturamentos where id = p_faturamento_id;
  update public.central_servicos_contratos_servicos
    set saldo_quantidade = coalesce(saldo_quantidade, 0) + coalesce(faturamento.quantidade, 0),
        saldo_valor = coalesce(saldo_valor, 0) + coalesce(faturamento.valor, 0)
    where id = faturamento.contrato_id and tipo_contrato = 'Banco de Horas';
end;
$$;

revoke all on function public.central_servicos_listar_repasses(bigint) from public, anon, authenticated;
revoke all on function public.central_servicos_salvar_repasses(bigint, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.central_servicos_excluir_faturamento(bigint) from public, anon, authenticated;
grant execute on function public.central_servicos_listar_repasses(bigint) to service_role;
grant execute on function public.central_servicos_salvar_repasses(bigint, jsonb, boolean) to service_role;
grant execute on function public.central_servicos_excluir_faturamento(bigint) to service_role;
