'use strict';

const { z } = require('zod');

// Formato canônico de UUID aceito pelo PostgreSQL (qualquer versão).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const texto = () =>
  z.string({
    error: (issue) => (issue.input === undefined ? 'campo obrigatório' : 'deve ser um texto'),
  });

// Remove espaços nas extremidades e exige ao menos um caractere.
const textoObrigatorio = () => texto().trim().min(1, 'não pode ficar vazio');

const idParam = z.object({
  id: z.string().regex(UUID, 'deve ser um UUID válido'),
});

const criarOrdem = z.strictObject({
  titulo: textoObrigatorio(),
  descricao: textoObrigatorio(),
});

module.exports = { idParam, criarOrdem };
