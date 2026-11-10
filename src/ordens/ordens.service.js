'use strict';

const repositorio = require('./ordens.repository');
const { emTransacao } = require('../db/transacao');
const { validarEstado } = require('./regras');
const { NaoEncontrada } = require('../http/erros');

async function criar(dados) {
  return repositorio.inserir(dados);
}

async function listar() {
  return repositorio.listar();
}

async function obter(id) {
  const ordem = await repositorio.buscarPorId(id);
  if (!ordem) throw new NaoEncontrada();
  return ordem;
}

// Lê a ordem travada, aplica só os campos enviados, valida o estado resultante e grava.
async function atualizar(id, alteracoes) {
  return emTransacao(async (db) => {
    const atual = await repositorio.buscarParaAtualizar(id, db);
    if (!atual) throw new NaoEncontrada();

    const resultante = { ...atual, ...alteracoes };
    validarEstado(resultante);

    return repositorio.atualizar(id, resultante, db);
  });
}

async function excluir(id) {
  const excluida = await repositorio.excluir(id);
  if (!excluida) throw new NaoEncontrada();
}

module.exports = { criar, listar, obter, atualizar, excluir };
