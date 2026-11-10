'use strict';

const { Queue, Worker } = require('bullmq');

const NOME_FILA = 'conclusoes';
const JOB_REGISTRAR_CONCLUSAO = 'registrar-conclusao';
const TEMPO_MAXIMO_PUBLICACAO_MS = 1000;

// Converte REDIS_URL nas opções de conexão usadas pelo BullMQ.
function opcoesRedis(url) {
  const endereco = new URL(url);
  return {
    host: endereco.hostname,
    port: Number(endereco.port || 6379),
    username: endereco.username || undefined,
    password: endereco.password ? decodeURIComponent(endereco.password) : undefined,
    db: endereco.pathname.length > 1 ? Number(endereco.pathname.slice(1)) : 0,
  };
}

// Mesma conclusão (ordem + instante da conclusão) gera sempre o mesmo ID: não há job duplicado.
function idDoJob(ordem) {
  return `conclusao-${ordem.id}-${new Date(ordem.atualizado_em).getTime()}`;
}

function comTempoMaximo(promessa, ms) {
  let timer;
  const limite = new Promise((_, rejeitar) => {
    timer = setTimeout(() => rejeitar(new Error(`sem resposta da fila em ${ms} ms`)), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(timer));
}

// Produtor: publica a conclusão de uma ordem para processamento assíncrono.
// Tentativas e backoff ficam definidos no próprio job.
function criarFila({ url, tentativas, atrasoMs, logger }) {
  if (!url) return filaDesativada;

  const queue = new Queue(NOME_FILA, {
    // Sem fila offline: com o Redis fora do ar, a publicação falha na hora.
    connection: { ...opcoesRedis(url), enableOfflineQueue: false },
    defaultJobOptions: {
      attempts: tentativas,
      backoff: { type: 'exponential', delay: atrasoMs },
      removeOnComplete: 1000,
      removeOnFail: false, // jobs que esgotam as tentativas ficam guardados para reprocessamento
    },
  });

  let avisado = false;
  queue.on('error', (erro) => {
    if (avisado) return;
    avisado = true;
    logger.warn({ err: erro }, 'fila indisponível');
  });

  return {
    queue,

    // Nunca derruba a requisição: se a fila não responder, registra o erro e devolve null.
    async publicarConclusao(ordem) {
      const jobId = idDoJob(ordem);
      const dados = { ordemId: ordem.id, solucao: ordem.solucao, concluidaEm: ordem.atualizado_em };
      try {
        await comTempoMaximo(queue.add(JOB_REGISTRAR_CONCLUSAO, dados, { jobId }), TEMPO_MAXIMO_PUBLICACAO_MS);
        return jobId;
      } catch (erro) {
        logger.error({ err: erro, ordemId: ordem.id, jobId }, 'não foi possível enfileirar a conclusão');
        return null;
      }
    },

    fechar: () => queue.close(),
  };
}

const filaDesativada = {
  queue: null,
  publicarConclusao: async () => null,
  fechar: async () => {},
};

// Consumidor: processa os jobs de conclusão. `registrar` grava o resultado (ver worker.js).
// `falhasSimuladas` faz as primeiras N tentativas de cada job falharem, para demonstrar
// as novas tentativas e o reprocessamento.
function criarWorkerConclusoes({ url, logger, registrar, falhasSimuladas = 0 }) {
  const worker = new Worker(
    NOME_FILA,
    async (job) => {
      const tentativa = job.attemptsMade + 1;
      if (job.attemptsMade < falhasSimuladas) {
        throw new Error(`falha simulada na tentativa ${tentativa}`);
      }
      await registrar(job, tentativa);
      return { tentativa };
    },
    { connection: { ...opcoesRedis(url), maxRetriesPerRequest: null } },
  );

  worker.on('completed', (job, resultado) => {
    logger.info({ jobId: job.id, tentativa: resultado.tentativa }, 'conclusão registrada');
  });
  worker.on('failed', (job, erro) => {
    const esgotadas = job.attemptsMade >= job.opts.attempts;
    logger.warn(
      { jobId: job.id, tentativa: job.attemptsMade, de: job.opts.attempts, erro: erro.message },
      esgotadas ? 'tentativas esgotadas; job guardado para reprocessamento' : 'falha; nova tentativa agendada',
    );
  });
  worker.on('error', (erro) => logger.error({ err: erro }, 'erro no worker da fila'));

  return worker;
}

// Devolve à fila os jobs que esgotaram as tentativas, com a contagem de tentativas zerada.
async function reprocessarFalhas(queue) {
  const falhos = await queue.getFailed();
  for (const job of falhos) {
    await job.retry('failed', { resetAttemptsMade: true });
  }
  return falhos.map((job) => job.id);
}

module.exports = {
  criarFila,
  criarWorkerConclusoes,
  reprocessarFalhas,
  idDoJob,
};
