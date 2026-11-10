'use strict';

const { carregarConfig } = require('./config');
const { criarLogger } = require('./logger');
const { pool } = require('./db/pool');
const { migrar } = require('./db/migrate');
const { criarApp } = require('./app');

async function iniciar() {
  const config = carregarConfig();
  const logger = criarLogger(config.nivelLog);

  await migrar(logger);

  const servidor = criarApp({ logger }).listen(config.porta, () => {
    logger.info({ porta: config.porta }, 'API em execução');
  });

  const encerrar = (sinal) => {
    logger.info({ sinal }, 'encerrando');
    servidor.close(() => {
      pool.end().finally(() => process.exit(0));
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
