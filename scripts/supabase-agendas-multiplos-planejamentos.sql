-- Executar no Supabase SQL Editor para permitir novos contratos e vigencias
-- do mesmo recurso e cliente, preservando os planejamentos anteriores.
alter table public.central_servicos_agendas
  drop constraint if exists central_servicos_agendas_recurso_cliente_key;
