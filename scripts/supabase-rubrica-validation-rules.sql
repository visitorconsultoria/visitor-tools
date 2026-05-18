create table if not exists public.rubrica_validation_rules (
  id bigserial primary key,
  rule_name text not null,
  trigger_column text not null,
  trigger_value text not null,
  expected_column text not null,
  expected_value text not null,
  expected_conditions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rubrica_validation_rules
  add column if not exists expected_conditions jsonb not null default '[]'::jsonb;

update public.rubrica_validation_rules
set expected_conditions = jsonb_build_array(
  jsonb_build_object('column', expected_column, 'value', expected_value)
)
where coalesce(jsonb_array_length(expected_conditions), 0) = 0
  and coalesce(expected_column, '') <> ''
  and coalesce(expected_value, '') <> '';

create index if not exists idx_rubrica_validation_rules_active
  on public.rubrica_validation_rules (is_active, id desc);

drop index if exists public.uq_rubrica_validation_rules_rule;

create unique index if not exists uq_rubrica_validation_rules_name
  on public.rubrica_validation_rules (rule_name);

create or replace function public.set_rubrica_validation_rules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rubrica_validation_rules_updated_at on public.rubrica_validation_rules;

create trigger trg_rubrica_validation_rules_updated_at
before update on public.rubrica_validation_rules
for each row
execute function public.set_rubrica_validation_rules_updated_at();

insert into public.rubrica_validation_rules (
  rule_name,
  trigger_column,
  trigger_value,
  expected_column,
  expected_value,
  expected_conditions,
  is_active,
  notes
)
values
  (
    'Id.p/Calculo 1285 exige INSS = Sim e FGTS = Sim',
    'Id.p/Calculo',
    '1285',
    'INSS',
    'Sim',
    '[{"column":"INSS","value":"Sim"},{"column":"FGTS","value":"Sim"}]'::jsonb,
    true,
    'Regra composta: quando o gatilho ocorrer, ambos os campos devem estar com Sim.'
  ),
  (
    'Id.p/Calculo 1279 exige INSS = Nao e FGTS = Nao',
    'Id.p/Calculo',
    '1279',
    'INSS',
    'Nao',
    '[{"column":"INSS","value":"Nao"},{"column":"FGTS","value":"Nao"}]'::jsonb,
    true,
    'Regra composta para verbas de desconto.'
  )
on conflict (rule_name)
do update
set
  trigger_column = excluded.trigger_column,
  trigger_value = excluded.trigger_value,
  expected_column = excluded.expected_column,
  expected_value = excluded.expected_value,
  expected_conditions = excluded.expected_conditions,
  rule_name = excluded.rule_name,
  is_active = excluded.is_active,
  notes = excluded.notes,
  updated_at = now();
