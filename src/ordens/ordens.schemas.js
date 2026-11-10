'use strict';

const { z } = require('zod');

// Formato canônico de UUID aceito pelo PostgreSQL (qualquer versão).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS = ['aberta', 'em_andamento', 'concluida'];

const texto = () =>
  z.string({
    error: (issue) => (issue.input === undefined ? 'campo obrigatório' : 'deve ser um texto'),
  });

// Remove espaços nas extremidades e exige ao menos um caractere.
const textoObrigatorio = () => texto().trim().min(1, 'não pode ficar vazio');

// Solução: precisa ser texto quando enviada (null é rejeitado). É gravada sem os espaços das
// extremidades, e uma solução vazia é gravada como NULL ("sem solução").
const solucao = () =>
  texto()
    .trim()
    .transform((valor) => (valor === '' ? null : valor));

// O ID é normalizado para minúsculas: o PostgreSQL trata as duas grafias como o mesmo UUID,
// e a chave do cache (ordem:{id}) precisa ser a mesma para as duas.
const idParam = z.object({
  id: z
    .string()
    .regex(UUID, 'deve ser um UUID válido')
    .transform((id) => id.toLowerCase()),
});

const criarOrdem = z.strictObject({
  titulo: textoObrigatorio(),
  descricao: textoObrigatorio(),
});

const atualizarOrdem = z
  .strictObject({
    titulo: textoObrigatorio().optional(),
    descricao: textoObrigatorio().optional(),
    status: z.enum(STATUS, { error: `deve ser um destes valores: ${STATUS.join(', ')}` }).optional(),
    solucao: solucao().optional(),
  })
  .refine((campos) => Object.keys(campos).length > 0, {
    message: 'informe ao menos um campo: titulo, descricao, status ou solucao',
    // Só acusa o corpo vazio se não houver outro problema (ex.: apenas campos fora do contrato).
    when: (payload) => payload.issues.length === 0,
  });

module.exports = { idParam, criarOrdem, atualizarOrdem };
