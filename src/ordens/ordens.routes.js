'use strict';

const express = require('express');
const { idParam, criarOrdem, atualizarOrdem } = require('./ordens.schemas');
const { validar } = require('../http/validar');

function criarOrdensRouter(servico) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const dados = validar(criarOrdem, req.body);
    const ordem = await servico.criar(dados);
    res.status(201).location(`/ordens/${ordem.id}`).json(ordem);
  });

  router.get('/', async (_req, res) => {
    res.json(await servico.listar());
  });

  router.get('/:id', async (req, res) => {
    const { id } = validar(idParam, req.params);
    const { ordem, origem } = await servico.obter(id);
    res.set('X-Cache', origem).json(ordem);
  });

  router.patch('/:id', async (req, res) => {
    const { id } = validar(idParam, req.params);
    const alteracoes = validar(atualizarOrdem, req.body);
    res.json(await servico.atualizar(id, alteracoes));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = validar(idParam, req.params);
    await servico.excluir(id);
    res.status(204).end();
  });

  return router;
}

module.exports = { criarOrdensRouter };
