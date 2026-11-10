'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('./pool');

const PASTA = path.join(__dirname, 'migrations');

// Aplica, em ordem alfabética, cada arquivo .sql ainda não registrado em schema_migrations.
// Cada migration roda na própria transação.
async function migrar(logger) {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        nome       text        PRIMARY KEY,
        aplicada_em timestamptz NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query('SELECT nome FROM schema_migrations');
    const aplicadas = new Set(rows.map((linha) => linha.nome));
    const arquivos = (await fs.readdir(PASTA)).filter((nome) => nome.endsWith('.sql')).sort();

    for (const nome of arquivos) {
      if (aplicadas.has(nome)) continue;

      const sql = await fs.readFile(path.join(PASTA, nome), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [nome]);
        await client.query('COMMIT');
      } catch (erro) {
        await client.query('ROLLBACK');
        throw erro;
      }
      logger.info({ migration: nome }, 'migration aplicada');
    }
  } finally {
    client.release();
  }
}

module.exports = { migrar };
