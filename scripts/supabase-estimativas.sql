do $$
declare
  estimativas_id_is_uuid boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'estimativas'
      and column_name = 'id'
      and udt_name = 'uuid'
  ) into estimativas_id_is_uuid;

  if estimativas_id_is_uuid then
    drop table if exists public.estimativa_items_migracao;
    drop table if exists public.estimativas_migracao;

    create table public.estimativas_migracao (
      id bigint generated always as identity primary key,
      partner text not null,
      client text not null,
      date date not null,
      demand text not null,
      notes text not null default '',
      status text not null default 'pending' check (status in ('pending', 'sent')),
      created_at timestamptz not null default now()
    );

    insert into public.estimativas_migracao (partner, client, date, demand, notes, status, created_at)
    select partner, client, date, demand, notes, status, created_at
    from public.estimativas
    order by created_at, id;

    create table public.estimativa_items_migracao (
      id bigint generated always as identity primary key,
      estimativa_id bigint not null references public.estimativas_migracao(id) on delete cascade,
      detail text not null,
      hours numeric(10,2) not null,
      sort_order integer not null default 1,
      created_at timestamptz not null default now()
    );

    insert into public.estimativa_items_migracao (estimativa_id, detail, hours, sort_order, created_at)
    with old_rows as (
      select id as old_id, row_number() over (order by created_at, id) as rn
      from public.estimativas
    ),
    new_rows as (
      select id as new_id, row_number() over (order by id) as rn
      from public.estimativas_migracao
    ),
    map_rows as (
      select o.old_id, n.new_id
      from old_rows o
      join new_rows n on n.rn = o.rn
    )
    select m.new_id, i.detail, i.hours, i.sort_order, i.created_at
    from public.estimativa_items i
    join map_rows m on m.old_id = i.estimativa_id
    order by m.new_id, i.sort_order, i.id;

    drop table public.estimativa_items;
    drop table public.estimativas;

    alter table public.estimativas_migracao rename to estimativas;
    alter table public.estimativa_items_migracao rename to estimativa_items;
  end if;
end $$;

create table if not exists public.estimativas (
  id bigint generated always as identity primary key,
  partner text not null,
  client text not null,
  date date not null,
  demand text not null,
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending', 'sent')),
  created_at timestamptz not null default now()
);

create table if not exists public.estimativa_items (
  id bigint generated always as identity primary key,
  estimativa_id bigint not null references public.estimativas(id) on delete cascade,
  detail text not null,
  hours numeric(10,2) not null,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_estimativas_date on public.estimativas (date desc);
create index if not exists idx_estimativas_status on public.estimativas (status);
create index if not exists idx_estimativa_items_parent on public.estimativa_items (estimativa_id, sort_order);
