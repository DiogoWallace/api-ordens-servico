'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, prepararBanco, limparBanco, encerrarBanco } = require('./helpers');

const EXEMPLO = {
  titulo: 'Inspeção da válvula VLV-OS-73A',
  descricao: 'Verificar vedação e registrar o resultado da inspeção.',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID_INEXISTENTE = '3f2b8c1e-9d4a-4c7b-8e6f-1a2b3c4d5e6f';

function assertErro(res, status, codigo) {
  assert.equal(res.status, status);
  assert.equal(res.body.erro.codigo, codigo);
  assert.equal(typeof res.body.erro.mensagem, 'string');
  assert.ok(Array.isArray(res.body.erro.detalhes));
}

function camposComProblema(res) {
  return res.body.erro.detalhes.map((detalhe) => detalhe.campo).sort();
}

before(prepararBanco);
beforeEach(limparBanco);
after(encerrarBanco);

describe('POST /ordens', () => {
  it('cria a ordem aberta, sem solução e com id gerado pelo servidor (201)', async () => {
    const res = await request(app).post('/ordens').send(EXEMPLO);

    assert.equal(res.status, 201);
    assert.match(res.body.id, UUID);
    assert.equal(res.body.titulo, EXEMPLO.titulo);
    assert.equal(res.body.descricao, EXEMPLO.descricao);
    assert.equal(res.body.status, 'aberta');
    assert.equal(res.body.solucao, null);
    assert.equal(res.headers.location, `/ordens/${res.body.id}`);
  });

  it('persiste a criação: a consulta pelo id retornado devolve a mesma ordem', async () => {
    const criada = await request(app).post('/ordens').send(EXEMPLO);

    const res = await request(app).get(`/ordens/${criada.body.id}`);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, criada.body);
  });

  it('grava título e descrição sem os espaços das extremidades', async () => {
    const res = await request(app)
      .post('/ordens')
      .send({ titulo: '  Troca de filtro  ', descricao: '\tFiltro do compressor\n' });

    assert.equal(res.status, 201);
    assert.equal(res.body.titulo, 'Troca de filtro');
    assert.equal(res.body.descricao, 'Filtro do compressor');
  });

  it('rejeita título e descrição ausentes (400)', async () => {
    const res = await request(app).post('/ordens').send({});

    assertErro(res, 400, 'ENTRADA_INVALIDA');
    assert.deepEqual(camposComProblema(res), ['descricao', 'titulo']);
  });

  for (const vazio of ['', '   ', '\t\n']) {
    it(`rejeita título só com espaços (${JSON.stringify(vazio)}) (400)`, async () => {
      const res = await request(app).post('/ordens').send({ ...EXEMPLO, titulo: vazio });

      assertErro(res, 400, 'ENTRADA_INVALIDA');
      assert.deepEqual(camposComProblema(res), ['titulo']);
    });
  }

  it('rejeita título e descrição que não são texto (400)', async () => {
    const res = await request(app).post('/ordens').send({ titulo: 123, descricao: null });

    assertErro(res, 400, 'ENTRADA_INVALIDA');
    assert.deepEqual(camposComProblema(res), ['descricao', 'titulo']);
  });

  it('rejeita campos fora do contrato, como id, status e solucao (400)', async () => {
    const res = await request(app)
      .post('/ordens')
      .send({ ...EXEMPLO, id: UUID_INEXISTENTE, status: 'concluida', solucao: 'x' });

    assertErro(res, 400, 'ENTRADA_INVALIDA');
    assert.deepEqual(camposComProblema(res), ['id', 'solucao', 'status']);
  });

  it('rejeita JSON malformado (400)', async () => {
    const res = await request(app)
      .post('/ordens')
      .set('Content-Type', 'application/json')
      .send('{"titulo": "sem fechar"');

    assertErro(res, 400, 'ENTRADA_INVALIDA');
  });

  it('rejeita corpo que não é um objeto JSON (400)', async () => {
    const res = await request(app).post('/ordens').send([EXEMPLO]);

    assertErro(res, 400, 'ENTRADA_INVALIDA');
  });

  it('rejeita corpo sem Content-Type JSON (400)', async () => {
    const res = await request(app).post('/ordens').set('Content-Type', 'text/plain').send('titulo=x');

    assertErro(res, 400, 'ENTRADA_INVALIDA');
  });

  it('rejeita corpo acima do limite (400)', async () => {
    const res = await request(app)
      .post('/ordens')
      .send({ titulo: 'x', descricao: 'a'.repeat(20 * 1024) });

    assertErro(res, 400, 'ENTRADA_INVALIDA');
  });
});

describe('GET /ordens/:id', () => {
  for (const id of ['abc', '123', `${UUID_INEXISTENTE}x`]) {
    it(`rejeita ID malformado "${id}" (400)`, async () => {
      const res = await request(app).get(`/ordens/${id}`);

      assertErro(res, 400, 'ENTRADA_INVALIDA');
      assert.deepEqual(camposComProblema(res), ['id']);
    });
  }

  it('responde 404 para um UUID válido sem ordem correspondente', async () => {
    const res = await request(app).get(`/ordens/${UUID_INEXISTENTE}`);

    assertErro(res, 404, 'NAO_ENCONTRADA');
  });
});

describe('Rotas e formato de erro', () => {
  it('responde 404 no formato padrão para rota inexistente', async () => {
    const res = await request(app).get('/inexistente');

    assertErro(res, 404, 'ROTA_INEXISTENTE');
  });

  it('identifica cada resposta com X-Request-Id', async () => {
    const res = await request(app).get(`/ordens/${UUID_INEXISTENTE}`);

    assert.match(res.headers['x-request-id'], UUID);
  });
});
