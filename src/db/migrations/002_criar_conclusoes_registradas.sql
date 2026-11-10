-- Histórico das conclusões processadas de forma assíncrona pela fila (job registrar-conclusao).
-- Sem chave estrangeira: o registro permanece mesmo que a ordem seja excluída depois.
-- job_id como chave torna o processamento idempotente.
CREATE TABLE conclusoes_registradas (
  job_id        text        PRIMARY KEY,
  ordem_id      uuid        NOT NULL,
  solucao       text        NOT NULL,
  concluida_em  timestamptz NOT NULL,
  tentativas    integer     NOT NULL CHECK (tentativas > 0),
  registrado_em timestamptz NOT NULL DEFAULT now()
);
