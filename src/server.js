'use strict';

const { carregarConfig } = require('./config');
const { criarLogger } = require('./logger');
const { pool } = require('./db/pool');
const { migrar } = require('./db/migrate');
const { criarCache } = require('./cache/cache');
const { criarApp } = require('./app');

async function iniciar() {
  const config = carregarConfig();
  const logger = criarLogger(config.nivelLog);

  await migrar(logger);

  const cache = criarCache({ url: config.redisUrl, ttlSegundos: config.cacheTtlSegundos, logger });

  const servidor = criarApp({ logger, cache }).listen(config.porta, () => {
    logger.info({ porta: config.porta, cache: Boolean(config.redisUrl) }, 'API em execução');
  });

  const encerrar = (sinal) => {
    logger.info({ sinal }, 'encerrando');
    servidor.close(() => {
      Promise.allSettled([pool.end(), cache.fechar()]).finally(() => process.exit(0));
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
