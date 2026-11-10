'use strict';

// Processo do worker: consome a fila de conclusões. Roda separado da API (serviço `worker`
// no Compose). As migrations são aplicadas pela API, que o worker espera ficar saudável.

const { carregarConfig } = require('./config');
const { criarLogger } = require('./logger');
const { pool } = require('./db/pool');
const { criarWorkerConclusoes } = require('./fila/fila');
const { registrarConclusao } = require('./fila/conclusoes.repository');

function iniciar() {
  const config = carregarConfig();
  if (!config.redisUrl) throw new Error('REDIS_URL é obrigatória para o worker.');

  const logger = criarLogger(config.nivelLog).child({ processo: 'worker' });
  const worker = criarWorkerConclusoes({
    url: config.redisUrl,
    logger,
    registrar: registrarConclusao,
    falhasSimuladas: config.filaFalhasSimuladas,
  });
  logger.info({ falhasSimuladas: config.filaFalhasSimuladas }, 'worker da fila em execução');

  const encerrar = (sinal) => {
    logger.info({ sinal }, 'encerrando');
    Promise.allSettled([worker.close(), pool.end()]).finally(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', encerrar);
  process.once('SIGINT', encerrar);
}

try {
  iniciar();
} catch (erro) {
  console.error('Falha ao iniciar o worker:', erro);
  process.exit(1);
}
