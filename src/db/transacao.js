'use strict';

const { pool } = require('./pool');

// Executa `trabalho` com um client dedicado dentro de BEGIN/COMMIT.
// Qualquer erro desfaz a transação e é repassado.
async function emTransacao(trabalho) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await trabalho(client);
    await client.query('COMMIT');
    return resultado;
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    throw erro;
  } finally {
    client.release();
  }
}

module.exports = { emTransacao };
