'use strict';

// Erros esperados da API: carregam o status HTTP e o código exposto ao cliente.
class AppError extends Error {
  constructor(status, codigo, mensagem, detalhes = []) {
    super(mensagem);
    this.name = this.constructor.name;
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

class EntradaInvalida extends AppError {
  constructor(mensagem = 'Entrada inválida.', detalhes = []) {
    super(400, 'ENTRADA_INVALIDA', mensagem, detalhes);
  }
}

class RegraConclusao extends AppError {
  constructor() {
    super(400, 'REGRA_CONCLUSAO', 'Uma ordem só pode ser concluída com uma solução preenchida.', [
      { campo: 'solucao', problema: 'obrigatória para concluir a ordem' },
    ]);
  }
}

class NaoEncontrada extends AppError {
  constructor(mensagem = 'Ordem de serviço não encontrada.') {
    super(404, 'NAO_ENCONTRADA', mensagem);
  }
}

class RotaInexistente extends AppError {
  constructor() {
    super(404, 'ROTA_INEXISTENTE', 'Rota não encontrada.');
  }
}

module.exports = { AppError, EntradaInvalida, RegraConclusao, NaoEncontrada, RotaInexistente };
