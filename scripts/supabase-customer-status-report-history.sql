create table if not exists public.customer_hub_status_report_history (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.customer_hub_clients(id) on delete cascade,
  created_by_username text not null,
  created_by_display_name text not null default '',
  sent_at timestamptz not null default now(),
  total_tickets integer not null default 0,
  tickets_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ch_status_report_history_cliente_id
  on public.customer_hub_status_report_history (cliente_id);

create index if not exists idx_ch_status_report_history_sent_at
  on public.customer_hub_status_report_history (sent_at desc);
