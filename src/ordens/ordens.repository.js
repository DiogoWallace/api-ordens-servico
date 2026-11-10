'use strict';

const { pool } = require('../db/pool');

const COLUNAS = 'id, titulo, descricao, status, solucao, criado_em, atualizado_em';

// Toda consulta usa parâmetros ($1, $2…); nenhum valor é concatenado ao SQL.
// Cada função aceita um client opcional para participar de uma transação.

async function inserir({ titulo, descricao }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO ordens (titulo, descricao) VALUES ($1, $2) RETURNING ${COLUNAS}`,
    [titulo, descricao],
  );
  return rows[0];
}

async function listar(db = pool) {
  const { rows } = await db.query(`SELECT ${COLUNAS} FROM ordens ORDER BY criado_em, id`);
  return rows;
}

async function buscarPorId(id, db = pool) {
  const { rows } = await db.query(`SELECT ${COLUNAS} FROM ordens WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// Trava a linha até o fim da transação: atualizações concorrentes da mesma ordem esperam a vez.
async function buscarParaAtualizar(id, db) {
  const { rows } = await db.query(`SELECT ${COLUNAS} FROM ordens WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] ?? null;
}

async function atualizar(id, { titulo, descricao, status, solucao }, db = pool) {
  const { rows } = await db.query(
    `UPDATE ordens
        SET titulo = $2, descricao = $3, status = $4, solucao = $5, atualizado_em = now()
      WHERE id = $1
  RETURNING ${COLUNAS}`,
    [id, titulo, descricao, status, solucao],
  );
  return rows[0];
}

async function excluir(id, db = pool) {
  const { rowCount } = await db.query('DELETE FROM ordens WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { inserir, listar, buscarPorId, buscarParaAtualizar, atualizar, excluir };
