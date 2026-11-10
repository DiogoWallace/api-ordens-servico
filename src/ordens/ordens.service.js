'use strict';

const repositorio = require('./ordens.repository');
const { NaoEncontrada } = require('../http/erros');

async function criar(dados) {
  return repositorio.inserir(dados);
}

async function obter(id) {
  const ordem = await repositorio.buscarPorId(id);
  if (!ordem) throw new NaoEncontrada();
  return ordem;
}

module.exports = { criar, obter };
