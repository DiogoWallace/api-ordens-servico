'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const { ordensRouter } = require('./ordens/ordens.routes');
const { errorHandler, rotaInexistente } = require('./http/errorHandler');

function criarApp({ logger }) {
  const app = express();

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
    }),
  );
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));

  app.use('/ordens', ordensRouter);

  app.use(rotaInexistente);
  app.use(errorHandler);

  return app;
}

module.exports = { criarApp };
