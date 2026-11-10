'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const YAML = require('yaml');
const swaggerUi = require('swagger-ui-express');

const ARQUIVO_OPENAPI = path.join(__dirname, '..', '..', 'openapi.yaml');

// Documentação interativa: Swagger UI em /docs e a especificação em /openapi.json.
function criarRotasDocs() {
  const especificacao = YAML.parse(fs.readFileSync(ARQUIVO_OPENAPI, 'utf8'));
  const router = express.Router();

  router.get('/openapi.json', (_req, res) => res.json(especificacao));
  router.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(especificacao, { customSiteTitle: 'API de ordens de serviço' }),
  );

  return router;
}

module.exports = { criarRotasDocs };
