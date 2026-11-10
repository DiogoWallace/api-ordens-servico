'use strict';

// Reprocessa os jobs que esgotaram as tentativas: devolve-os à fila com a contagem zerada.
// Uso: docker compose exec worker node src/fila/reprocessar.js

const { criarFila, reprocessarFalhas } = require('./fila');
const { criarLogger } = require('../logger');

async function executar() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL é obrigatória.');

  const logger = criarLogger(process.env.LOG_LEVEL ?? 'info');
  // Só lê e reenvia jobs existentes, que mantêm as próprias opções de tentativas e backoff;
  // os valores abaixo valeriam apenas para jobs novos, que este comando não cria.
  const fila = criarFila({ url, tentativas: 1, atrasoMs: 1, logger });
  try {
    await fila.queue.waitUntilReady();
    const ids = await reprocessarFalhas(fila.queue);
    console.log(
      ids.length === 0 ? 'Nenhum job falho para reprocessar.' : `Jobs devolvidos à fila: ${ids.join(', ')}`,
    );
  } finally {
    await fila.fechar();
  }
}

executar().catch((erro) => {
  console.error('Falha ao reprocessar:', erro.message);
  process.exit(1);
});
