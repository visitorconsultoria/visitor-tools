create table if not exists public.data_dictionary (
  id bigint generated always as identity primary key,
  field_name text not null unique,
  field_type varchar(1) not null,
  source_file_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_data_dictionary_field_name
  on public.data_dictionary (field_name);
