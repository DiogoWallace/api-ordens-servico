'use strict';

const { z } = require('zod');
const { EntradaInvalida } = require('./erros');

z.config(z.locales.ptBR());

// Converte as falhas do zod em detalhes { campo, problema }.
// Campos fora do contrato viram um detalhe por campo.
function detalhar(issues) {
  return issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((campo) => ({ campo, problema: 'campo não permitido' }));
    }
    return [{ campo: issue.path.join('.') || '(corpo)', problema: issue.message }];
  });
}

function validar(schema, dados) {
  const resultado = schema.safeParse(dados);
  if (!resultado.success) {
    throw new EntradaInvalida('Entrada inválida.', detalhar(resultado.error.issues));
  }
  return resultado.data;
}

module.exports = { validar };
