'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { temSolucao, validarEstado } = require('../src/ordens/regras');
const { RegraConclusao } = require('../src/http/erros');

describe('temSolucao', () => {
  it('aceita texto com conteúdo', () => {
    assert.equal(temSolucao('Vedação trocada'), true);
    assert.equal(temSolucao('  x  '), true);
  });

  for (const valor of [null, undefined, '', '   ', '\t\n', 42]) {
    it(`recusa ${JSON.stringify(valor) ?? 'undefined'}`, () => {
      assert.equal(temSolucao(valor), false);
    });
  }
});

describe('validarEstado', () => {
  it('permite qualquer estado que não seja concluida, com ou sem solução', () => {
    for (const status of ['aberta', 'em_andamento']) {
      assert.doesNotThrow(() => validarEstado({ status, solucao: null }));
      assert.doesNotThrow(() => validarEstado({ status, solucao: 'ok' }));
    }
  });

  it('permite concluida com solução preenchida', () => {
    assert.doesNotThrow(() => validarEstado({ status: 'concluida', solucao: 'Vedação trocada' }));
  });

  it('recusa concluida sem solução ou com solução só de espaços', () => {
    for (const solucao of [null, '', '   ']) {
      assert.throws(() => validarEstado({ status: 'concluida', solucao }), RegraConclusao);
    }
  });
});
