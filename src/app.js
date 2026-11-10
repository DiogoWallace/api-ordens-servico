'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const { criarOrdensRouter } = require('./ordens/ordens.routes');
const { criarServicoOrdens } = require('./ordens/ordens.service');
const { errorHandler, rotaInexistente } = require('./http/errorHandler');
const { criarRotasDocs } = require('./http/docs');

function criarApp({ logger, cache, fila }) {
  const app = express();

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      // Registra só o necessário para rastrear a requisição, sem headers nem corpo.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(
    helmet({
      // Sem upgrade-insecure-requests: a API roda em HTTP local, e a diretiva faria o navegador
      // pedir os arquivos do Swagger UI por HTTPS.
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );
  app.use(express.json({ limit: '10kb' }));

  app.use(criarRotasDocs());
  app.use('/ordens', criarOrdensRouter(criarServicoOrdens({ cache, fila })));

  app.use(rotaInexistente);
  app.use(errorHandler);

  return app;
}

module.exports = { criarApp };
