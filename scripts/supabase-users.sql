create table if not exists public.app_users (
  id bigint generated always as identity primary key,
  username text not null unique,
  password text not null,
  display_name text not null default '',
  is_active boolean not null default true,
  allowed_menus text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

create index if not exists idx_app_users_username on public.app_users (username);
create index if not exists idx_app_users_active on public.app_users (is_active);

insert into public.app_users (username, password, display_name, is_active, allowed_menus)
values ('visitor', 'Visitor@2026', 'Visitor Admin', true, array['process', 'xml-excel', 'resume-ranking', 'estimativas', 'daily-activities'])
on conflict (username) do update
set
  password = excluded.password,
  display_name = excluded.display_name,
  is_active = excluded.is_active,
  allowed_menus = excluded.allowed_menus;
