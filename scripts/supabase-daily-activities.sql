create table if not exists public.daily_activities (
  id bigint generated always as identity primary key,
  date date not null,
  resource text not null,
  activity text not null,
  hours numeric(10,2) not null check (hours > 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_daily_activities_date on public.daily_activities (date desc);
create index if not exists idx_daily_activities_resource on public.daily_activities (resource);
