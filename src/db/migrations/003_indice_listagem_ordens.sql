-- Índice da listagem: GET /ordens executa
--   SELECT ... FROM ordens ORDER BY criado_em, id
-- Com o índice nas mesmas colunas e na mesma ordem, o PostgreSQL lê as linhas já ordenadas
-- (Index Scan) em vez de ler a tabela inteira e ordenar em memória (Seq Scan + Sort).
-- Medições com EXPLAIN ANALYZE no README.
CREATE INDEX ordens_criado_em_id_idx ON ordens (criado_em, id);
