'use strict';

// As credenciais do banco chegam pelas variáveis PG*, lidas diretamente pelo driver `pg`.
const OBRIGATORIAS = ['PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];

function carregarConfig(env = process.env) {
  const ausentes = OBRIGATORIAS.filter((nome) => !env[nome]);
  if (ausentes.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${ausentes.join(', ')}`);
  }

  return {
    porta: Number(env.PORT ?? 3000),
    nivelLog: env.LOG_LEVEL ?? 'info',
  };
}

module.exports = { carregarConfig };
