'use strict';

const { createClient } = require('redis');
const { pool } = require('../src/db/pool');
const { migrar } = require('../src/db/migrate');
const { criarCache } = require('../src/cache/cache');
const { criarApp } = require('../src/app');
const { criarLogger } = require('../src/logger');

const logger = criarLogger('silent');
const cache = criarCache({ url: process.env.REDIS_URL, ttlSegundos: 60, logger });
const app = criarApp({ logger, cache });

// Conexão própria dos testes com o Redis, para limpar e inspecionar o cache.
const redis = process.env.REDIS_URL ? createClient({ url: process.env.REDIS_URL }) : null;

// Proteção contra apagar dados reais: os testes só rodam em banco cujo nome termina com _test.
function exigirBancoDeTeste() {
  if (!/_test$/.test(process.env.PGDATABASE ?? '')) {
    throw new Error('Os testes só rodam em um banco cujo nome termina com _test (PGDATABASE).');
  }
}

async function prepararBanco() {
  exigirBancoDeTeste();
  await migrar(logger);
  if (redis) await redis.connect();
  await esperarCache();
}

// O cache da aplicação conecta em segundo plano; espera ele ficar pronto para os testes de HIT.
async function esperarCache() {
  if (!redis) return;
  for (let tentativa = 0; tentativa < 50; tentativa += 1) {
    await cache.gravar({ id: 'pronto' });
    if ((await redis.get('ordem:pronto')) !== null) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('O cache não ficou disponível para os testes.');
}

async function limparBanco() {
  await pool.query('TRUNCATE ordens');
  if (redis) await redis.flushDb();
}

async function encerrarBanco() {
  await Promise.all([pool.end(), cache.fechar(), redis?.close()]);
}

module.exports = { app, pool, redis, prepararBanco, limparBanco, encerrarBanco };
