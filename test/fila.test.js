'use strict';

const { describe, it, before, beforeEach, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const {
  criarFila,
  criarWorkerConclusoes,
  reprocessarFalhas,
  idDoJob,
} = require('../src/fila/fila');
const { registrarConclusao } = require('../src/fila/conclusoes.repository');
const { app, pool, fila, logger, prepararBanco, limparBanco, encerrarBanco } = require('./helpers');

const EXEMPLO = {
  titulo: 'Inspeção da válvula VLV-OS-73A',
  descricao: 'Verificar vedação e registrar o resultado da inspeção.',
};
const SOLUCAO = 'Vedação substituída e teste de estanqueidade aprovado.';

async function criarOrdem() {
  const res = await request(app).post('/ordens').send(EXEMPLO);
  assert.equal(res.status, 201);
  return res.body;
}

async function concluir(id) {
  const res = await request(app).patch(`/ordens/${id}`).send({ status: 'concluida', solucao: SOLUCAO });
  assert.equal(res.status, 200);
  return res.body;
}

async function contarJobs() {
  const contagem = await fila.queue.getJobCounts('waiting', 'delayed', 'active', 'completed', 'failed');
  return Object.values(contagem).reduce((total, n) => total + n, 0);
}

async function registros(ordemId) {
  const { rows } = await pool.query(
    'SELECT job_id, solucao, tentativas FROM conclusoes_registradas WHERE ordem_id = $1',
    [ordemId],
  );
  return rows;
}

// Resolve no primeiro evento do worker que satisfaz o filtro (ou falha após o limite).
function esperarEvento(worker, evento, filtro = () => true, limiteMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`evento ${evento} não ocorreu`)), limiteMs);
    worker.on(evento, (...args) => {
      if (filtro(...args)) {
        clearTimeout(timer);
        resolve(args);
      }
    });
  });
}

let workers = [];
function iniciarWorker(falhasSimuladas = 0) {
  const worker = criarWorkerConclusoes({
    url: process.env.REDIS_URL,
    logger,
    registrar: registrarConclusao,
    falhasSimuladas,
  });
  workers.push(worker);
  return worker;
}

before(prepararBanco);
beforeEach(limparBanco);
afterEach(async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  workers = [];
});
after(encerrarBanco);

describe('Fila: publicação da conclusão', () => {
  it('concluir uma ordem publica um job com os dados da conclusão', async () => {
    const criada = await criarOrdem();

    const concluida = await concluir(criada.id);

    const job = await fila.queue.getJob(idDoJob(concluida));
    assert.ok(job, 'o job deveria estar na fila');
    assert.equal(job.name, 'registrar-conclusao');
    assert.deepEqual(job.data, {
      ordemId: criada.id,
      solucao: SOLUCAO,
      concluidaEm: concluida.atualizado_em,
    });
    assert.equal(job.opts.attempts, 3);
  });

  it('não publica nada em atualizações que não concluem a ordem', async () => {
    const criada = await criarOrdem();
    await request(app).patch(`/ordens/${criada.id}`).send({ status: 'em_andamento' });
    await request(app).patch(`/ordens/${criada.id}`).send({ status: 'concluida' }); // rejeitado: sem solução

    assert.equal(await contarJobs(), 0);
  });

  it('alterar uma ordem já concluída não publica outra conclusão', async () => {
    const criada = await criarOrdem();
    await concluir(criada.id);

    await request(app).patch(`/ordens/${criada.id}`).send({ titulo: 'Novo título' });

    assert.equal(await contarJobs(), 1);
  });

  it('reabrir e concluir de novo publica uma nova conclusão', async () => {
    const criada = await criarOrdem();
    await concluir(criada.id);
    await request(app).patch(`/ordens/${criada.id}`).send({ status: 'aberta' });

    await concluir(criada.id);

    assert.equal(await contarJobs(), 2);
  });
});

describe('Fila: processamento assíncrono', () => {
  it('o worker registra a conclusão fora da requisição', async () => {
    const criada = await criarOrdem();
    const concluida = await concluir(criada.id);
    assert.deepEqual(await registros(criada.id), [], 'nada é registrado durante a requisição');

    const worker = iniciarWorker();
    await esperarEvento(worker, 'completed');

    assert.deepEqual(await registros(criada.id), [
      { job_id: idDoJob(concluida), solucao: SOLUCAO, tentativas: 1 },
    ]);
  });

  it('faz novas tentativas quando o processamento falha e conclui na terceira', async () => {
    const worker = iniciarWorker(2);
    const falhas = [];
    worker.on('failed', (job) => falhas.push(job.attemptsMade));
    const criada = await criarOrdem();

    await concluir(criada.id);
    await esperarEvento(worker, 'completed');

    assert.deepEqual(falhas, [1, 2]);
    assert.equal((await registros(criada.id))[0].tentativas, 3);
  });

  it('job que esgota as tentativas fica como falho e é reprocessado com sucesso', async () => {
    const criada = await criarOrdem();
    const concluida = await concluir(criada.id);

    const quebrado = iniciarWorker(99);
    await esperarEvento(quebrado, 'failed', (job) => job.attemptsMade === 3);
    await quebrado.close();
    assert.equal(await fila.queue.getJobState(idDoJob(concluida)), 'failed');
    assert.deepEqual(await registros(criada.id), []);

    const reprocessados = await reprocessarFalhas(fila.queue);
    assert.deepEqual(reprocessados, [idDoJob(concluida)]);

    const consertado = iniciarWorker(0);
    await esperarEvento(consertado, 'completed');
    assert.equal(await fila.queue.getJobState(idDoJob(concluida)), 'completed');
    assert.equal((await registros(criada.id)).length, 1);
  });

  it('reprocessar sem jobs falhos não faz nada', async () => {
    assert.deepEqual(await reprocessarFalhas(fila.queue), []);
  });
});

describe('Fila indisponível', () => {
  it('publicar falha rápido, sem lançar erro, e devolve null', async () => {
    const indisponivel = criarFila({ url: 'redis://127.0.0.1:1', tentativas: 3, atrasoMs: 10, logger });
    try {
      const inicio = Date.now();
      const jobId = await indisponivel.publicarConclusao({
        id: '3f2b8c1e-9d4a-4c7b-8e6f-1a2b3c4d5e6f',
        solucao: SOLUCAO,
        atualizado_em: new Date().toISOString(),
      });
      assert.equal(jobId, null);
      assert.ok(Date.now() - inicio < 1500, 'a publicação deve desistir em até 1 s');
    } finally {
      await indisponivel.fechar();
    }
  });

  it('sem REDIS_URL a publicação é ignorada', async () => {
    const semFila = criarFila({ url: null, tentativas: 3, atrasoMs: 10, logger });
    assert.equal(await semFila.publicarConclusao({ id: 'x', atualizado_em: new Date() }), null);
  });
});
