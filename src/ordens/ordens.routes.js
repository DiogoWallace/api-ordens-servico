'use strict';

const express = require('express');
const servico = require('./ordens.service');
const { idParam, criarOrdem } = require('./ordens.schemas');
const { validar } = require('../http/validar');

const router = express.Router();

router.post('/', async (req, res) => {
  const dados = validar(criarOrdem, req.body);
  const ordem = await servico.criar(dados);
  res.status(201).location(`/ordens/${ordem.id}`).json(ordem);
});

router.get('/:id', async (req, res) => {
  const { id } = validar(idParam, req.params);
  res.json(await servico.obter(id));
});

module.exports = { ordensRouter: router };
