'use strict';

const { pool } = require('../db/pool');

const COLUNAS = 'id, titulo, descricao, status, solucao, criado_em, atualizado_em';

// Toda consulta usa parâmetros ($1, $2…); nenhum valor é concatenado ao SQL.
async function inserir({ titulo, descricao }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO ordens (titulo, descricao) VALUES ($1, $2) RETURNING ${COLUNAS}`,
    [titulo, descricao],
  );
  return rows[0];
}

async function buscarPorId(id, db = pool) {
  const { rows } = await db.query(`SELECT ${COLUNAS} FROM ordens WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

module.exports = { inserir, buscarPorId };
