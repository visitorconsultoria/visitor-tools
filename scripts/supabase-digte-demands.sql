-- Tabela de controle de demandas atendidas para a DIGTE
-- Execute este script no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS digte_demands (
  id         bigserial PRIMARY KEY,
  number     text NOT NULL DEFAULT '',
  date       date NOT NULL,
  type       text NOT NULL DEFAULT '',
  requester  text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  responsible text NOT NULL DEFAULT '',
  status     text NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  notes      text NOT NULL DEFAULT '',
  created_at timestamp with time zone DEFAULT now()
);

-- Indice por status para filtros rapidos
CREATE INDEX IF NOT EXISTS idx_digte_demands_status ON digte_demands (status);

-- Indice por data para ordenacao
CREATE INDEX IF NOT EXISTS idx_digte_demands_date ON digte_demands (date DESC);

-- Indice unico para evitar numero duplicado (ignorar vazios)
CREATE UNIQUE INDEX IF NOT EXISTS idx_digte_demands_number_unique
  ON digte_demands (number)
  WHERE number <> '';
