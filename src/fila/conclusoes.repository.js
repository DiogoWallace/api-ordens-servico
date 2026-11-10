'use strict';

const { pool } = require('../db/pool');

// Grava o registro da conclusão processada pela fila. ON CONFLICT torna o processamento
// idempotente: se o mesmo job rodar de novo, o registro não é duplicado.
async function registrarConclusao(job, tentativa, db = pool) {
  const { ordemId, solucao, concluidaEm } = job.data;
  await db.query(
    `INSERT INTO conclusoes_registradas (job_id, ordem_id, solucao, concluida_em, tentativas)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (job_id) DO NOTHING`,
    [job.id, ordemId, solucao, concluidaEm, tentativa],
  );
}

module.exports = { registrarConclusao };
