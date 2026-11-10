'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const repositorio = require('../src/ordens/ordens.repository');
const { criarCache, chave } = require('../src/cache/cache');
const { criarLogger } = require('../src/logger');
const { app, redis, prepararBanco, limparBanco, encerrarBanco } = require('./helpers');

const EXEMPLO = {
  titulo: 'Inspeção da válvula VLV-OS-73A',
  descricao: 'Verificar vedação e registrar o resultado da inspeção.',
};
const UUID_INEXISTENTE = '3f2b8c1e-9d4a-4c7b-8e6f-1a2b3c4d5e6f';

async function criarOrdem() {
  const res = await request(app).post('/ordens').send(EXEMPLO);
  assert.equal(res.status, 201);
  return res.body;
}

const ler = (id) => request(app).get(`/ordens/${id}`);

before(prepararBanco);
beforeEach(limparBanco);
after(encerrarBanco);

describe('Cache de GET /ordens/:id', () => {
  it('a primeira leitura vem do banco (MISS) e a seguinte, do cache (HIT), com o mesmo corpo', async () => {
    const criada = await criarOrdem();

    const primeira = await ler(criada.id);
    const segunda = await ler(criada.id);

    assert.equal(primeira.headers['x-cache'], 'MISS');
    assert.equal(segunda.headers['x-cache'], 'HIT');
    assert.deepEqual(segunda.body, primeira.body);
    assert.deepEqual(segunda.body, criada);
  });

  it('o HIT não consulta o banco', async (t) => {
    const criada = await criarOrdem();
    await ler(criada.id);
    const buscarPorId = t.mock.method(repositorio, 'buscarPorId');

    const res = await ler(criada.id);

    assert.equal(res.headers['x-cache'], 'HIT');
    assert.equal(buscarPorId.mock.callCount(), 0);
  });

  it('grava a ordem com tempo de vida', async () => {
    const criada = await criarOrdem();
    await ler(criada.id);

    const ttl = await redis.ttl(chave(criada.id));

    assert.ok(ttl > 0 && ttl <= 60, `TTL inesperado: ${ttl}`);
  });

  it('o PATCH invalida o cache: a leitura seguinte é MISS e traz o dado novo', async () => {
    const criada = await criarOrdem();
    await ler(criada.id);
    assert.equal((await ler(criada.id)).headers['x-cache'], 'HIT');

    const patch = await request(app).patch(`/ordens/${criada.id}`).send({ status: 'em_andamento' });
    assert.equal(patch.status, 200);
    assert.equal(await redis.exists(chave(criada.id)), 0);

    const depois = await ler(criada.id);
    assert.equal(depois.headers['x-cache'], 'MISS');
    assert.equal(depois.body.status, 'em_andamento');
    assert.equal((await ler(criada.id)).headers['x-cache'], 'HIT');
  });

  it('PATCH rejeitado não altera o cache', async () => {
    const criada = await criarOrdem();
    await ler(criada.id);

    const patch = await request(app).patch(`/ordens/${criada.id}`).send({ status: 'concluida' });
    assert.equal(patch.status, 400);

    const depois = await ler(criada.id);
    assert.equal(depois.headers['x-cache'], 'HIT');
    assert.equal(depois.body.status, 'aberta');
  });

  it('o DELETE invalida o cache: a leitura seguinte responde 404', async () => {
    const criada = await criarOrdem();
    await ler(criada.id);
    assert.equal((await ler(criada.id)).headers['x-cache'], 'HIT');

    assert.equal((await request(app).delete(`/ordens/${criada.id}`)).status, 204);

    assert.equal(await redis.exists(chave(criada.id)), 0);
    assert.equal((await ler(criada.id)).status, 404);
  });

  it('não cacheia ordem inexistente', async () => {
    assert.equal((await ler(UUID_INEXISTENTE)).status, 404);
    assert.equal((await ler(UUID_INEXISTENTE)).status, 404);

    assert.equal(await redis.exists(chave(UUID_INEXISTENTE)), 0);
  });
});

describe('Cache indisponível', () => {
  it('leitura vira MISS e gravação e invalidação não lançam erro', async () => {
    // Porta sem Redis: o cliente nunca fica pronto.
    const indisponivel = criarCache({
      url: 'redis://127.0.0.1:1',
      ttlSegundos: 60,
      logger: criarLogger('silent'),
    });
    try {
      const inicio = Date.now();
      assert.equal(await indisponivel.obter(UUID_INEXISTENTE), null);
      await indisponivel.gravar({ id: UUID_INEXISTENTE });
      await indisponivel.invalidar(UUID_INEXISTENTE);
      assert.ok(Date.now() - inicio < 500, 'as operações devem falhar rápido, sem esperar o Redis');
    } finally {
      await indisponivel.fechar();
    }
  });

  it('sem REDIS_URL a API funciona sem cache', async () => {
    const semCache = criarCache({ url: null, ttlSegundos: 60, logger: criarLogger('silent') });

    assert.equal(await semCache.obter(UUID_INEXISTENTE), null);
    await semCache.gravar({ id: UUID_INEXISTENTE });
    await semCache.invalidar(UUID_INEXISTENTE);
  });
});
