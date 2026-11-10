'use strict';

const { AppError, EntradaInvalida, RegraConclusao, RotaInexistente } = require('./erros');

// Código do PostgreSQL para violação de CHECK.
const CHECK_VIOLATION = '23514';

function corpoDeErro(codigo, mensagem, detalhes = []) {
  return { erro: { codigo, mensagem, detalhes } };
}

// Erros do parser de JSON do Express (corpo malformado, grande demais, charset inválido).
function mensagemDoParser(erro) {
  if (erro.type === 'entity.parse.failed') return 'JSON malformado.';
  if (erro.type === 'entity.too.large') return 'Corpo da requisição excede o limite permitido.';
  return 'Corpo da requisição inválido.';
}

// As constraints do banco repetem as validações da aplicação. Se uma delas barrar a gravação,
// a entrada era inválida: responde 400 e registra o caso, que indica uma brecha na validação.
function erroDeConstraint(erro) {
  if (erro.constraint === 'ordens_conclusao_exige_solucao') return new RegraConclusao();
  return new EntradaInvalida();
}

function rotaInexistente(_req, _res, next) {
  next(new RotaInexistente());
}

// O Express reconhece o tratador de erros pelos quatro parâmetros.
function errorHandler(erro, req, res, _next) {
  if (erro.code === CHECK_VIOLATION) {
    req.log.warn({ err: erro, constraint: erro.constraint }, 'gravação barrada por constraint do banco');
    erro = erroDeConstraint(erro);
  }

  if (erro instanceof AppError) {
    return res.status(erro.status).json(corpoDeErro(erro.codigo, erro.message, erro.detalhes));
  }

  if (erro.type && erro.status >= 400 && erro.status < 500) {
    req.log.warn({ err: erro }, 'corpo da requisição rejeitado');
    return res.status(400).json(corpoDeErro('ENTRADA_INVALIDA', mensagemDoParser(erro)));
  }

  req.log.error({ err: erro }, 'erro não tratado');
  return res.status(500).json(corpoDeErro('ERRO_INTERNO', 'Erro interno do servidor.'));
}

module.exports = { errorHandler, rotaInexistente };
