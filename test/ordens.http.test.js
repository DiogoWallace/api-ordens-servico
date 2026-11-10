'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const repositorio = require('../src/ordens/ordens.repository');
const { app, pool, prepararBanco, limparBanco, encerrarBanco } = require('./helpers');

const EXEMPLO = {
  titulo: 'Inspeção da válvula VLV-OS-73A',
  descricao: 'Verificar vedação e registrar o resultado da inspeção.',
};
const SOLUCAO = 'Vedação substituída e teste de estanqueidade aprovado.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID_INEXISTENTE = '3f2b8c1e-9d4a-4c7b-8e6f-1a2b3c4d5e6f';
const IDS_MALFORMADOS = ['abc', '123', `${UUID_INEXISTENTE}x`];

function assertErro(res, status, codigo) {
  assert.equal(res.status, status);
  assert.equal(res.body.erro.codigo, codigo);
  assert.equal(typeof res.body.erro.mensagem, 'string');
  assert.ok(Array.isArray(res.body.erro.detalhes));
}

function camposComProblema(res) {
  return res.body.erro.detalhes.map((detalhe) => detalhe.campo).sort();
}

async function criarOrdem(dados = EXEMPLO) {
  const res = await request(app).post('/ordens').send(dados);
  assert.equal(res.status, 201);
  return res.body;
}

async function lerOrdem(id) {
  const res = await request(app).get(`/ordens/${id}`);
  assert.equal(res.status, 200);
  return res.body;
}

function patch(id, corpo) {
  return request(app).patch(`/ordens/${id}`).send(corpo);
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
    const criada = await criarOrdem();

    assert.deepEqual(await lerOrdem(criada.id), criada);
  });

  it('grava título e descrição sem os espaços das extremidades', async () => {
    const criada = await criarOrdem({ titulo: '  Troca de filtro  ', descricao: '\tFiltro do compressor\n' });

    assert.equal(criada.titulo, 'Troca de filtro');
    assert.equal(criada.descricao, 'Filtro do compressor');
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

describe('GET /ordens', () => {
  it('retorna [] quando não há ordens (200)', async () => {
    const res = await request(app).get('/ordens');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('lista as ordens em ordem de criação (200)', async () => {
    const primeira = await criarOrdem({ titulo: 'Primeira', descricao: 'A' });
    const segunda = await criarOrdem({ titulo: 'Segunda', descricao: 'B' });

    const res = await request(app).get('/ordens');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [primeira, segunda]);
  });
});

describe('GET /ordens/:id', () => {
  for (const id of IDS_MALFORMADOS) {
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

describe('PATCH /ordens/:id', () => {
  it('atualiza o título e persiste: uma nova leitura reflete a alteração (200)', async () => {
    const criada = await criarOrdem();

    const res = await patch(criada.id, { titulo: '  Inspeção da válvula VLV-OS-73B ' });

    assert.equal(res.status, 200);
    assert.equal(res.body.titulo, 'Inspeção da válvula VLV-OS-73B');
    assert.equal(res.body.descricao, criada.descricao);
    assert.ok(new Date(res.body.atualizado_em) >= new Date(criada.atualizado_em));

    assert.deepEqual(await lerOrdem(criada.id), res.body);
  });

  it('atualiza descrição e status juntos (200)', async () => {
    const criada = await criarOrdem();

    const res = await patch(criada.id, { descricao: 'Nova descrição', status: 'em_andamento' });

    assert.equal(res.status, 200);
    assert.equal(res.body.descricao, 'Nova descrição');
    assert.equal(res.body.status, 'em_andamento');
    assert.equal((await lerOrdem(criada.id)).status, 'em_andamento');
  });

  it('exige ao menos um campo (400)', async () => {
    const criada = await criarOrdem();

    const res = await patch(criada.id, {});

    assertErro(res, 400, 'ENTRADA_INVALIDA');
    assert.deepEqual(camposComProblema(res), ['(corpo)']);
  });

  it('rejeita campos fora do contrato, inclusive id (400)', async () => {
    const criada = await criarOrdem();

    const res = await patch(criada.id, { id: UUID_INEXISTENTE, prioridade: 'alta' });

    assertErro(res, 400, 'ENTRADA_INVALIDA');
    assert.deepEqual(camposComProblema(res), ['id', 'prioridade']);
    assert.deepEqual(await lerOrdem(criada.id), criada);
  });

  const invalidos = [
    ['status fora da lista', { status: 'fechada' }, 'status'],
    ['status que não é texto', { status: 1 }, 'status'],
    ['título só com espaços', { titulo: '   ' }, 'titulo'],
    ['descrição nula', { descricao: null }, 'descricao'],
    ['solução nula', { solucao: null }, 'solucao'],
    ['solução que não é texto', { solucao: 123 }, 'solucao'],
  ];
  for (const [nome, corpo, campo] of invalidos) {
    it(`rejeita ${nome} (400)`, async () => {
      const criada = await criarOrdem();

      const res = await patch(criada.id, corpo);

      assertErro(res, 400, 'ENTRADA_INVALIDA');
      assert.deepEqual(camposComProblema(res), [campo]);
    });
  }

  for (const id of IDS_MALFORMADOS) {
    it(`rejeita ID malformado "${id}" (400)`, async () => {
      assertErro(await patch(id, { titulo: 'x' }), 400, 'ENTRADA_INVALIDA');
    });
  }

  it('responde 404 para um UUID válido sem ordem correspondente', async () => {
    assertErro(await patch(UUID_INEXISTENTE, { titulo: 'x' }), 404, 'NAO_ENCONTRADA');
  });
});

describe('PATCH /ordens/:id — regra de conclusão', () => {
  it('rejeita concluir sem solução, e a ordem continua como estava (400)', async () => {
    const criada = await criarOrdem();

    const res = await patch(criada.id, { status: 'concluida' });

    assertErro(res, 400, 'REGRA_CONCLUSAO');
    assert.deepEqual(await lerOrdem(criada.id), criada);
  });

  for (const vazia of ['', '   ', '\n\t']) {
    it(`rejeita concluir com solução só de espaços (${JSON.stringify(vazia)}) (400)`, async () => {
      const criada = await criarOrdem();

      const res = await patch(criada.id, { status: 'concluida', solucao: vazia });

      assertErro(res, 400, 'REGRA_CONCLUSAO');
      assert.equal((await lerOrdem(criada.id)).status, 'aberta');
    });
  }

  it('aceita concluir com a solução informada no mesmo PATCH (200)', async () => {
    const criada = await criarOrdem();

    const res = await patch(criada.id, { status: 'concluida', solucao: `  ${SOLUCAO}  ` });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'concluida');
    assert.equal(res.body.solucao, SOLUCAO);
    assert.deepEqual(await lerOrdem(criada.id), res.body);
  });

  it('aceita concluir quando a solução foi gravada em um PATCH anterior (200)', async () => {
    const criada = await criarOrdem();
    assert.equal((await patch(criada.id, { solucao: SOLUCAO })).status, 200);

    const res = await patch(criada.id, { status: 'concluida' });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'concluida');
    assert.equal(res.body.solucao, SOLUCAO);
  });

  for (const vazia of ['', '   ']) {
    it(`rejeita apagar a solução (${JSON.stringify(vazia)}) de uma ordem concluída, que mantém a solução (400)`, async () => {
      const criada = await criarOrdem();
      const concluida = (await patch(criada.id, { status: 'concluida', solucao: SOLUCAO })).body;

      const res = await patch(criada.id, { solucao: vazia });

      assertErro(res, 400, 'REGRA_CONCLUSAO');
      assert.deepEqual(await lerOrdem(criada.id), concluida);
    });
  }

  it('permite remover a solução de uma ordem não concluída, gravando null (200)', async () => {
    const criada = await criarOrdem();
    await patch(criada.id, { solucao: SOLUCAO });

    const res = await patch(criada.id, { solucao: '   ' });

    assert.equal(res.status, 200);
    assert.equal(res.body.solucao, null);
  });

  it('permite reabrir uma ordem concluída, mantendo a solução (200)', async () => {
    const criada = await criarOrdem();
    await patch(criada.id, { status: 'concluida', solucao: SOLUCAO });

    const res = await patch(criada.id, { status: 'aberta' });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'aberta');
    assert.equal(res.body.solucao, SOLUCAO);
  });

  it('reabrir e apagar a solução no mesmo PATCH é aceito (200)', async () => {
    const criada = await criarOrdem();
    await patch(criada.id, { status: 'concluida', solucao: SOLUCAO });

    const res = await patch(criada.id, { status: 'em_andamento', solucao: '' });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'em_andamento');
    assert.equal(res.body.solucao, null);
  });
});

describe('DELETE /ordens/:id', () => {
  it('exclui a ordem e responde 204 sem corpo; a ordem deixa de existir', async () => {
    const criada = await criarOrdem();

    const res = await request(app).delete(`/ordens/${criada.id}`);

    assert.equal(res.status, 204);
    assert.equal(res.text, '');
    assertErro(await request(app).get(`/ordens/${criada.id}`), 404, 'NAO_ENCONTRADA');
    assertErro(await request(app).delete(`/ordens/${criada.id}`), 404, 'NAO_ENCONTRADA');
  });

  for (const id of IDS_MALFORMADOS) {
    it(`rejeita ID malformado "${id}" (400)`, async () => {
      assertErro(await request(app).delete(`/ordens/${id}`), 400, 'ENTRADA_INVALIDA');
    });
  }

  it('responde 404 para um UUID válido sem ordem correspondente', async () => {
    assertErro(await request(app).delete(`/ordens/${UUID_INEXISTENTE}`), 404, 'NAO_ENCONTRADA');
  });
});

describe('Constraints do banco', () => {
  it('recusa ordem concluída com solução NULL mesmo sem passar pela API', async () => {
    await assert.rejects(
      pool.query(`INSERT INTO ordens (titulo, descricao, status) VALUES ('t', 'd', 'concluida')`),
      { code: '23514', constraint: 'ordens_conclusao_exige_solucao' },
    );
  });

  it('recusa status fora da lista e textos só com espaços', async () => {
    await assert.rejects(pool.query(`INSERT INTO ordens (titulo, descricao, status) VALUES ('t', 'd', 'x')`), {
      code: '23514',
    });
    await assert.rejects(pool.query(`INSERT INTO ordens (titulo, descricao) VALUES (E' \\t', 'd')`), {
      code: '23514',
    });
  });

  it('se a constraint de conclusão barrar a gravação, a API responde 400', async (t) => {
    const criada = await criarOrdem();
    // Simula uma brecha na validação da aplicação: a gravação chega ao banco com a solução nula.
    t.mock.method(repositorio, 'atualizar', async (id, ordem, db) => {
      await db.query(`UPDATE ordens SET status = 'concluida', solucao = NULL WHERE id = $1`, [id]);
    });

    const res = await patch(criada.id, { status: 'concluida', solucao: SOLUCAO });

    assertErro(res, 400, 'REGRA_CONCLUSAO');
    assert.deepEqual(await lerOrdem(criada.id), criada);
  });
});

describe('Rotas e formato de erro', () => {
  it('responde 404 no formato padrão para rota inexistente', async () => {
    assertErro(await request(app).get('/inexistente'), 404, 'ROTA_INEXISTENTE');
  });

  it('identifica cada resposta com X-Request-Id', async () => {
    const res = await request(app).get(`/ordens/${UUID_INEXISTENTE}`);

    assert.match(res.headers['x-request-id'], UUID);
  });

  it('erro inesperado responde 500 genérico, sem stack nem detalhes internos', async (t) => {
    t.mock.method(repositorio, 'listar', async () => {
      throw new Error('falha simulada: conexão recusada em db:5432');
    });

    const res = await request(app).get('/ordens');

    assertErro(res, 500, 'ERRO_INTERNO');
    assert.equal(res.body.erro.mensagem, 'Erro interno do servidor.');
    assert.doesNotMatch(res.text, /falha simulada|db:5432|at .*\.js/);
  });
});
