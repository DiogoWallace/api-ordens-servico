'use strict';

// As credenciais do banco chegam pelas variáveis PG*, lidas diretamente pelo driver `pg`.
const OBRIGATORIAS = ['PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];

function carregarConfig(env = process.env) {
  const ausentes = OBRIGATORIAS.filter((nome) => !env[nome]);
  if (ausentes.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${ausentes.join(', ')}`);
  }

  const ttl = Number(env.CACHE_TTL_SEGUNDOS ?? 60);
  if (!Number.isInteger(ttl) || ttl <= 0) {
    throw new Error('CACHE_TTL_SEGUNDOS deve ser um inteiro positivo.');
  }

  return {
    porta: Number(env.PORT ?? 3000),
    nivelLog: env.LOG_LEVEL ?? 'info',
    // Opcional: sem REDIS_URL, a API funciona sem cache.
    redisUrl: env.REDIS_URL || null,
    cacheTtlSegundos: ttl,
  };
}

module.exports = { carregarConfig };
