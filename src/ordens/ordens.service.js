'use strict';

const repositorio = require('./ordens.repository');
const { emTransacao } = require('../db/transacao');
const { validarEstado } = require('./regras');
const { NaoEncontrada } = require('../http/erros');

function criarServicoOrdens({ cache }) {
  async function criar(dados) {
    return repositorio.inserir(dados);
  }

  async function listar() {
    return repositorio.listar();
  }

  // Cache-aside: HIT devolve do cache; MISS lê do banco e grava no cache.
  // Ordem inexistente não é cacheada.
  async function obter(id) {
    const emCache = await cache.obter(id);
    if (emCache) return { ordem: emCache, origem: 'HIT' };

    const ordem = await repositorio.buscarPorId(id);
    if (!ordem) throw new NaoEncontrada();

    await cache.gravar(ordem);
    return { ordem, origem: 'MISS' };
  }

  // Lê a ordem travada, aplica só os campos enviados, valida o estado resultante e grava.
  // O cache só é invalidado depois do COMMIT, para não ser repovoado com o estado antigo.
  async function atualizar(id, alteracoes) {
    const ordem = await emTransacao(async (db) => {
      const atual = await repositorio.buscarParaAtualizar(id, db);
      if (!atual) throw new NaoEncontrada();

      const resultante = { ...atual, ...alteracoes };
      validarEstado(resultante);

      return repositorio.atualizar(id, resultante, db);
    });

    await cache.invalidar(id);
    return ordem;
  }

  async function excluir(id) {
    const excluida = await repositorio.excluir(id);
    if (!excluida) throw new NaoEncontrada();
    await cache.invalidar(id);
  }

  return { criar, listar, obter, atualizar, excluir };
}

module.exports = { criarServicoOrdens };
