-- Execute antes de disponibilizar a aba Detalhes para Faturamento.
alter table public.central_servicos_faturamentos
  add column if not exists faturamento_corpo_nota text not null default '',
  add column if not exists faturamento_documentos text not null default '',
  add column if not exists faturamento_prazo_emissao text not null default '',
  add column if not exists faturamento_data_vencimento date,
  add column if not exists faturamento_codigo_servico text not null default '';
