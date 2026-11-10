'use strict';

const { RegraConclusao } = require('../http/erros');

function temSolucao(solucao) {
  return typeof solucao === 'string' && solucao.trim() !== '';
}

// Regra de conclusão: avaliada sobre o estado resultante da ordem (estado atual + alterações),
// não só sobre os campos enviados.
function validarEstado(ordem) {
  if (ordem.status === 'concluida' && !temSolucao(ordem.solucao)) {
    throw new RegraConclusao();
  }
}

module.exports = { temSolucao, validarEstado };
