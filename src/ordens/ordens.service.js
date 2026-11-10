'use strict';

const repositorio = require('./ordens.repository');
const { emTransacao } = require('../db/transacao');
const { validarEstado } = require('./regras');
const { NaoEncontrada } = require('../http/erros');

function criarServicoOrdens({ cache, fila }) {
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
  // Depois do COMMIT: invalida o cache (para não ser repovoado com o estado antigo) e, se a
  // ordem acabou de ser concluída, publica a conclusão na fila para processamento assíncrono.
  async function atualizar(id, alteracoes) {
    const { anterior, ordem } = await emTransacao(async (db) => {
      const atual = await repositorio.buscarParaAtualizar(id, db);
      if (!atual) throw new NaoEncontrada();

      const resultante = { ...atual, ...alteracoes };
      validarEstado(resultante);

      return { anterior: atual, ordem: await repositorio.atualizar(id, resultante, db) };
    });

    await cache.invalidar(id);
    if (anterior.status !== 'concluida' && ordem.status === 'concluida') {
      await fila.publicarConclusao(ordem);
    }
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
