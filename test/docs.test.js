'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, pool, prepararBanco, encerrarBanco } = require('./helpers');

before(prepararBanco);
after(encerrarBanco);

describe('Documentação OpenAPI', () => {
  it('serve a especificação em /openapi.json com as cinco operações do contrato', async () => {
    const res = await request(app).get('/openapi.json');

    assert.equal(res.status, 200);
    assert.match(res.body.openapi, /^3\.1\./);
    const operacoes = Object.entries(res.body.paths).flatMap(([caminho, item]) =>
      Object.keys(item)
        .filter((metodo) => ['get', 'post', 'patch', 'delete'].includes(metodo))
        .map((metodo) => `${metodo.toUpperCase()} ${caminho}`),
    );
    assert.deepEqual(operacoes.sort(), [
      'DELETE /ordens/{id}',
      'GET /ordens',
      'GET /ordens/{id}',
      'PATCH /ordens/{id}',
      'POST /ordens',
    ]);
  });

  it('documenta os mesmos status de sucesso que a API devolve', async () => {
    const { paths } = (await request(app).get('/openapi.json')).body;

    assert.ok(paths['/ordens'].post.responses['201']);
    assert.ok(paths['/ordens'].get.responses['200']);
    assert.ok(paths['/ordens/{id}'].get.responses['200']);
    assert.ok(paths['/ordens/{id}'].patch.responses['200']);
    assert.ok(paths['/ordens/{id}'].delete.responses['204']);
    for (const operacao of ['get', 'patch', 'delete']) {
      assert.ok(paths['/ordens/{id}'][operacao].responses['400'], `${operacao} sem 400`);
      assert.ok(paths['/ordens/{id}'][operacao].responses['404'], `${operacao} sem 404`);
    }
  });

  it('serve o Swagger UI em /docs', async () => {
    const res = await request(app).get('/docs/');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.text, /swagger-ui/i);
  });

  it('não envia upgrade-insecure-requests, que quebraria o Swagger UI em HTTP', async () => {
    const res = await request(app).get('/docs/');

    assert.doesNotMatch(res.headers['content-security-policy'], /upgrade-insecure-requests/);
  });
});

describe('Índice da listagem', () => {
  it('existe o índice (criado_em, id), na ordem do ORDER BY de GET /ordens', async () => {
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'ordens' AND indexname = 'ordens_criado_em_id_idx'`,
    );

    assert.equal(rows.length, 1);
    assert.match(rows[0].indexdef, /\(criado_em, id\)/);
  });
});
