'use strict';

const { carregarConfig } = require('./config');
const { criarLogger } = require('./logger');
const { pool } = require('./db/pool');
const { migrar } = require('./db/migrate');
const { criarCache } = require('./cache/cache');
const { criarFila } = require('./fila/fila');
const { criarApp } = require('./app');

async function iniciar() {
  const config = carregarConfig();
  const logger = criarLogger(config.nivelLog);

  await migrar(logger);

  const cache = criarCache({ url: config.redisUrl, ttlSegundos: config.cacheTtlSegundos, logger });
  const fila = criarFila({
    url: config.redisUrl,
    tentativas: config.filaTentativas,
    atrasoMs: config.filaAtrasoMs,
    logger,
  });

  const servidor = criarApp({ logger, cache, fila }).listen(config.porta, () => {
    logger.info({ porta: config.porta, redis: Boolean(config.redisUrl) }, 'API em execução');
  });

  const encerrar = (sinal) => {
    logger.info({ sinal }, 'encerrando');
    servidor.close(() => {
      Promise.allSettled([pool.end(), cache.fechar(), fila.fechar()]).finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', encerrar);
  process.once('SIGINT', encerrar);
}

iniciar().catch((erro) => {
  console.error('Falha ao iniciar a API:', erro);
  process.exit(1);
});
