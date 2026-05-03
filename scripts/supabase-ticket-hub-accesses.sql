create table if not exists public.ticket_hub_accesses (
  id bigint generated always as identity primary key,
  user_id bigint not null unique references public.app_users(id) on delete cascade,
  organizations text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ticket_hub_accesses_user_id on public.ticket_hub_accesses (user_id);

create or replace function public.set_ticket_hub_accesses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ticket_hub_accesses_updated_at on public.ticket_hub_accesses;

create trigger trg_ticket_hub_accesses_updated_at
before update on public.ticket_hub_accesses
for each row
execute function public.set_ticket_hub_accesses_updated_at();
