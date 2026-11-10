'use strict';

const pino = require('pino');

function criarLogger(nivel = process.env.LOG_LEVEL ?? 'info') {
  return pino({ level: nivel });
}

module.exports = { criarLogger };
