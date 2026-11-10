'use strict';

// As credenciais do banco chegam pelas variáveis PG*, lidas diretamente pelo driver `pg`.
const OBRIGATORIAS = ['PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];

function inteiro(env, nome, padrao, minimo) {
  const valor = Number(env[nome] ?? padrao);
  if (!Number.isInteger(valor) || valor < minimo) {
    throw new Error(`${nome} deve ser um inteiro maior ou igual a ${minimo}.`);
  }
  return valor;
}

function carregarConfig(env = process.env) {
  const ausentes = OBRIGATORIAS.filter((nome) => !env[nome]);
  if (ausentes.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${ausentes.join(', ')}`);
  }

  return {
    porta: Number(env.PORT ?? 3000),
    nivelLog: env.LOG_LEVEL ?? 'info',
    // Opcional: sem REDIS_URL, a API funciona sem cache e sem fila.
    redisUrl: env.REDIS_URL || null,
    cacheTtlSegundos: inteiro(env, 'CACHE_TTL_SEGUNDOS', 60, 1),
    filaTentativas: inteiro(env, 'FILA_TENTATIVAS', 3, 1),
    filaAtrasoMs: inteiro(env, 'FILA_ATRASO_MS', 1000, 0),
    filaFalhasSimuladas: inteiro(env, 'FILA_FALHAS_SIMULADAS', 0, 0),
  };
}

module.exports = { carregarConfig };
