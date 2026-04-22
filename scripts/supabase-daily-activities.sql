create table if not exists public.daily_activities (
  id bigint generated always as identity primary key,
  date date not null,
  resource text not null,
  activity text not null,
  hours numeric(10,2) not null check (hours > 0),
  notes text not null default '',
  demand text not null default '',
  created_at timestamptz not null default now()
);

-- Migration: add demand column to existing tables
alter table public.daily_activities add column if not exists demand text not null default '';

create index if not exists idx_daily_activities_date on public.daily_activities (date desc);
create index if not exists idx_daily_activities_resource on public.daily_activities (resource);
