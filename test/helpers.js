'use strict';

const { pool } = require('../src/db/pool');
const { migrar } = require('../src/db/migrate');
const { criarApp } = require('../src/app');
const { criarLogger } = require('../src/logger');

const logger = criarLogger('silent');
const app = criarApp({ logger });

// Proteção contra apagar dados reais: os testes só rodam em banco cujo nome termina com _test.
function exigirBancoDeTeste() {
  if (!/_test$/.test(process.env.PGDATABASE ?? '')) {
    throw new Error('Os testes só rodam em um banco cujo nome termina com _test (PGDATABASE).');
  }
}

async function prepararBanco() {
  exigirBancoDeTeste();
  await migrar(logger);
}

async function limparBanco() {
  await pool.query('TRUNCATE ordens');
}

async function encerrarBanco() {
  await pool.end();
}

module.exports = { app, prepararBanco, limparBanco, encerrarBanco };
