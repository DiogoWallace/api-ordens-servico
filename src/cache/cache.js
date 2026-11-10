'use strict';

const { createClient } = require('redis');

const chave = (id) => `ordem:${id}`;

// Cache das ordens no Redis, no padrão cache-aside: a aplicação consulta o cache, vai ao banco
// no MISS e grava o resultado. Uma falha do Redis nunca derruba a requisição: a leitura vira MISS
// e a gravação ou a invalidação só é registrada no log.
function criarCacheRedis({ url, ttlSegundos, logger }) {
  const client = createClient({
    url,
    // Sem fila offline: com o Redis fora do ar, os comandos falham na hora em vez de esperar.
    disableOfflineQueue: true,
    socket: { connectTimeout: 2000 },
  });

  // Registra só as mudanças de estado, não cada tentativa de reconexão.
  let avisado = false;
  client.on('ready', () => {
    avisado = false;
    logger.info('cache conectado');
  });
  client.on('error', (erro) => {
    if (avisado) return;
    avisado = true;
    logger.warn({ err: erro }, 'cache indisponível; seguindo só com o banco');
  });
  client.connect().catch(() => {}); // a falha já chega pelo evento 'error'

  async function tentar(descricao, operacao, padrao) {
    if (!client.isReady) return padrao;
    try {
      return await operacao();
    } catch (erro) {
      logger.warn({ err: erro }, `falha no cache ao ${descricao}`);
      return padrao;
    }
  }

  return {
    obter: (id) =>
      tentar('ler', async () => {
        const valor = await client.get(chave(id));
        return valor === null ? null : JSON.parse(valor);
      }, null),

    gravar: (ordem) =>
      tentar('gravar', () =>
        client.set(chave(ordem.id), JSON.stringify(ordem), {
          expiration: { type: 'EX', value: ttlSegundos },
        }),
      ),

    invalidar: (id) => tentar('invalidar', () => client.del(chave(id))),

    // Conectado: encerra esperando os comandos pendentes. Ainda tentando conectar: interrompe.
    fechar: async () => {
      if (client.isReady) await client.close();
      else if (client.isOpen) client.destroy();
    },
  };
}

// Usado quando REDIS_URL não está definida: a API funciona só com o banco.
const cacheDesativado = {
  obter: async () => null,
  gravar: async () => {},
  invalidar: async () => {},
  fechar: async () => {},
};

function criarCache({ url, ttlSegundos, logger }) {
  return url ? criarCacheRedis({ url, ttlSegundos, logger }) : cacheDesativado;
}

module.exports = { criarCache, chave };
