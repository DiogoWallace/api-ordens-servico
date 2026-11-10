-- Ordens de serviço.
-- A aplicação grava textos já sem espaços nas extremidades e grava solução vazia como NULL;
-- as constraints repetem essas regras como última linha de defesa.
CREATE TABLE ordens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        text        NOT NULL CHECK (titulo ~ '\S'),
  descricao     text        NOT NULL CHECK (descricao ~ '\S'),
  status        text        NOT NULL DEFAULT 'aberta'
                            CHECK (status IN ('aberta', 'em_andamento', 'concluida')),
  solucao       text        CHECK (solucao IS NULL OR solucao ~ '\S'),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  -- Com status NOT NULL, a expressão nunca resulta em NULL: uma ordem concluída
  -- sem solução é sempre rejeitada.
  CONSTRAINT ordens_conclusao_exige_solucao
    CHECK (status <> 'concluida' OR solucao IS NOT NULL)
);
