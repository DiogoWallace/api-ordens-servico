'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const { criarOrdensRouter } = require('./ordens/ordens.routes');
const { criarServicoOrdens } = require('./ordens/ordens.service');
const { errorHandler, rotaInexistente } = require('./http/errorHandler');

function criarApp({ logger, cache }) {
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
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));

  app.use('/ordens', criarOrdensRouter(criarServicoOrdens({ cache })));

  app.use(rotaInexistente);
  app.use(errorHandler);

  return app;
}

module.exports = { criarApp };
