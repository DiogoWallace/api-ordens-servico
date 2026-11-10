# API de ordens de serviço

API RESTful em Node.js e Express para cadastrar, consultar, atualizar e excluir ordens de serviço,
com persistência em PostgreSQL e cache em Redis. Tudo roda em Docker: não é preciso instalar Node.js,
PostgreSQL nem Redis.

- [Pré-requisitos](#pré-requisitos)
- [Configuração](#configuração)
- [Execução](#execução)
- [Testes](#testes)
- [Contrato da API](#contrato-da-api)
- [Exemplos de requisição e resposta](#exemplos-de-requisição-e-resposta)
- [Cache](#cache)
- [Escolha do banco: PostgreSQL](#escolha-do-banco-postgresql)
- [Decisões técnicas](#decisões-técnicas)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Limitações](#limitações)
- [Uso de IA](#uso-de-ia)

## Pré-requisitos

- Git
- Docker com Docker Compose v2 (comando `docker compose`)
- `curl`, para os exemplos (opcional)

## Configuração

As credenciais ficam em variáveis de ambiente, num arquivo `.env` que não é versionado. Crie-o a
partir do exemplo:

```bash
cp .env.example .env
```

| Variável | Uso | Valor de exemplo |
|---|---|---|
| `API_PORT` | Porta da API no host | `3000` |
| `POSTGRES_USER` | Usuário do PostgreSQL, usado pelo banco e pela API | `ordens` |
| `POSTGRES_PASSWORD` | Senha do PostgreSQL. **Troque o valor de exemplo.** | `troque-esta-senha` |
| `POSTGRES_DB` | Nome do banco | `ordens` |
| `LOG_LEVEL` | Nível de log da API (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`) | `info` |
| `CACHE_TTL_SEGUNDOS` | Tempo de vida de uma ordem no cache de `GET /ordens/:id` | `60` |

Sem o `.env`, o Compose para antes de subir e informa qual variável falta.

## Execução

```bash
docker compose up --build
```

O Compose sobe o PostgreSQL e o Redis, espera os dois ficarem saudáveis e inicia a API, que aplica
as migrations pendentes antes de aceitar requisições. A API fica em `http://localhost:3000` (ou na porta definida
em `API_PORT`). Para rodar em segundo plano, use `docker compose up --build -d --wait`: o comando
só termina quando banco, cache e API estão saudáveis (o healthcheck da API confirma que ela já aceita
conexões, o que só acontece depois das migrations).

Para encerrar:

```bash
docker compose down      # para os containers e mantém os dados
docker compose down -v   # para os containers e apaga o volume do banco
```

## Testes

Os testes exercitam as rotas HTTP contra um PostgreSQL e um Redis de teste isolados: outro projeto
do Compose, com o banco em memória (`tmpfs`), descartado ao final. O ambiente de desenvolvimento não é
tocado.

```bash
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
docker compose -f compose.test.yaml down -v
```

O primeiro comando termina com o código de saída dos testes. Como proteção, a suíte se recusa a
rodar se o nome do banco não terminar em `_test`.

A suíte (`node:test` + `supertest`) cobre:

- o fluxo de sucesso das cinco operações, com uma nova leitura confirmando a persistência da criação,
  da atualização e da exclusão;
- entrada inválida (campos ausentes, vazios ou de tipo errado, `status` fora da lista, JSON malformado,
  corpo que não é objeto, Content-Type errado, corpo acima do limite) e campos fora do contrato;
- ID malformado (400) e UUID válido sem ordem (404) em `GET`, `PATCH` e `DELETE`;
- a regra de conclusão: rejeitada sem solução ou com solução só de espaços; aceita com a solução no
  mesmo `PATCH` ou gravada antes; tentativa de apagar a solução de uma ordem concluída; reabertura;
- as constraints do banco diretamente em SQL, e a resposta 400 quando uma delas barra a gravação;
- resposta 500 genérica, sem stack nem detalhes internos;
- o cache: MISS seguido de HIT sem consultar o banco, tempo de vida, invalidação após `PATCH` e
  `DELETE`, `PATCH` rejeitado sem efeito no cache, 404 não cacheado e funcionamento com o Redis
  indisponível;
- testes unitários da regra de conclusão.

A CI (GitHub Actions) roda a mesma suíte e um smoke test do `compose.yaml` a partir de um clone limpo:
copia o `.env.example`, sobe a stack, cria uma ordem, a consulta pelo ID retornado e confere o HIT e a
invalidação do cache.

## Contrato da API

| Rota | Corpo aceito | Sucesso |
|---|---|---|
| `POST /ordens` | `titulo`, `descricao` | `201` com a ordem criada e header `Location` |
| `GET /ordens` | — | `200` com a lista (`[]` quando vazia), em ordem de criação |
| `GET /ordens/:id` | — | `200` com a ordem |
| `PATCH /ordens/:id` | ao menos um de `titulo`, `descricao`, `status`, `solucao` | `200` com a ordem atualizada |
| `DELETE /ordens/:id` | — | `204` sem corpo |

**Ordem de serviço**

| Campo | Tipo | Regras |
|---|---|---|
| `id` | UUID | Gerado pelo servidor; não pode ser enviado nem alterado. |
| `titulo` | texto | Obrigatório; gravado sem os espaços das extremidades; não pode ficar vazio. |
| `descricao` | texto | Mesmas regras do `titulo`. |
| `status` | texto | `aberta`, `em_andamento` ou `concluida`. Toda ordem nasce `aberta`. |
| `solucao` | texto ou `null` | Opcional; `null` quando não há solução. Só pode ficar `concluida` com solução preenchida. |
| `criado_em`, `atualizado_em` | data e hora ISO 8601 (UTC) | Mantidos pelo servidor. |

**Erros.** Toda resposta de erro tem o mesmo formato:

```json
{ "erro": { "codigo": "ENTRADA_INVALIDA", "mensagem": "Entrada inválida.", "detalhes": [{ "campo": "titulo", "problema": "não pode ficar vazio" }] } }
```

| Código | HTTP | Quando |
|---|---|---|
| `ENTRADA_INVALIDA` | 400 | Corpo ou ID inválido, campo fora do contrato, JSON malformado, Content-Type diferente de JSON, corpo acima de 10 KB |
| `REGRA_CONCLUSAO` | 400 | O estado resultante seria `concluida` sem solução |
| `NAO_ENCONTRADA` | 404 | ID válido sem ordem correspondente |
| `ROTA_INEXISTENTE` | 404 | Rota não existe |
| `ERRO_INTERNO` | 500 | Erro inesperado; o detalhe fica só no log do servidor |

Toda resposta traz o header `X-Request-Id`, o mesmo registrado no log da requisição. `GET /ordens/:id`
traz também `X-Cache: HIT` ou `X-Cache: MISS` (veja [Cache](#cache)).

## Exemplos de requisição e resposta

Os exemplos usam `http://localhost:3000`. Os IDs e as datas variam a cada execução.

### Criar uma ordem

```bash
curl -i -X POST http://localhost:3000/ordens \
  -H 'Content-Type: application/json' \
  -d '{"titulo":"Inspeção da válvula VLV-OS-73A","descricao":"Verificar vedação e registrar o resultado da inspeção."}'
```

```http
HTTP/1.1 201 Created
Location: /ordens/612f32fc-9c29-43d4-b796-889aeae479a3
Content-Type: application/json; charset=utf-8
```

```json
{
  "id": "612f32fc-9c29-43d4-b796-889aeae479a3",
  "titulo": "Inspeção da válvula VLV-OS-73A",
  "descricao": "Verificar vedação e registrar o resultado da inspeção.",
  "status": "aberta",
  "solucao": null,
  "criado_em": "2026-11-10T15:19:53.002Z",
  "atualizado_em": "2026-11-10T15:19:53.002Z"
}
```

### Listar as ordens

```bash
curl http://localhost:3000/ordens
```

`200 OK` com um array de ordens no formato acima, em ordem de criação, ou `[]` quando não há nenhuma.

### Consultar uma ordem

```bash
curl http://localhost:3000/ordens/612f32fc-9c29-43d4-b796-889aeae479a3
```

`200 OK` com a ordem.

### Atualizar campos

```bash
curl -X PATCH http://localhost:3000/ordens/612f32fc-9c29-43d4-b796-889aeae479a3 \
  -H 'Content-Type: application/json' \
  -d '{"status":"em_andamento"}'
```

```json
{
  "id": "612f32fc-9c29-43d4-b796-889aeae479a3",
  "titulo": "Inspeção da válvula VLV-OS-73A",
  "descricao": "Verificar vedação e registrar o resultado da inspeção.",
  "status": "em_andamento",
  "solucao": null,
  "criado_em": "2026-11-10T15:19:53.002Z",
  "atualizado_em": "2026-11-10T15:19:53.047Z"
}
```

### Concluir sem solução (rejeitado)

```bash
curl -X PATCH http://localhost:3000/ordens/612f32fc-9c29-43d4-b796-889aeae479a3 \
  -H 'Content-Type: application/json' \
  -d '{"status":"concluida"}'
```

`400 Bad Request`:

```json
{
  "erro": {
    "codigo": "REGRA_CONCLUSAO",
    "mensagem": "Uma ordem só pode ser concluída com uma solução preenchida.",
    "detalhes": [{ "campo": "solucao", "problema": "obrigatória para concluir a ordem" }]
  }
}
```

### Concluir com solução

```bash
curl -X PATCH http://localhost:3000/ordens/612f32fc-9c29-43d4-b796-889aeae479a3 \
  -H 'Content-Type: application/json' \
  -d '{"status":"concluida","solucao":"Vedação substituída e teste de estanqueidade aprovado."}'
```

`200 OK`:

```json
{
  "id": "612f32fc-9c29-43d4-b796-889aeae479a3",
  "titulo": "Inspeção da válvula VLV-OS-73A",
  "descricao": "Verificar vedação e registrar o resultado da inspeção.",
  "status": "concluida",
  "solucao": "Vedação substituída e teste de estanqueidade aprovado.",
  "criado_em": "2026-11-10T15:19:53.002Z",
  "atualizado_em": "2026-11-10T15:19:53.072Z"
}
```

A solução também pode ser gravada num `PATCH` anterior; nesse caso, `{"status":"concluida"}` é aceito.
Já `{"solucao":"   "}` numa ordem concluída é rejeitado com o mesmo `REGRA_CONCLUSAO`.

### Entrada inválida

```bash
curl -X PATCH http://localhost:3000/ordens/612f32fc-9c29-43d4-b796-889aeae479a3 \
  -H 'Content-Type: application/json' \
  -d '{"status":"fechada","solucao":null,"prioridade":"alta"}'
```

`400 Bad Request`:

```json
{
  "erro": {
    "codigo": "ENTRADA_INVALIDA",
    "mensagem": "Entrada inválida.",
    "detalhes": [
      { "campo": "status", "problema": "deve ser um destes valores: aberta, em_andamento, concluida" },
      { "campo": "solucao", "problema": "deve ser um texto" },
      { "campo": "prioridade", "problema": "campo não permitido" }
    ]
  }
}
```

Outros casos de 400 com o mesmo formato:

| Requisição | `detalhes` |
|---|---|
| `POST /ordens` com `{"titulo":"   ","status":"aberta"}` | `titulo`: não pode ficar vazio · `descricao`: campo obrigatório · `status`: campo não permitido |
| `PATCH /ordens/:id` com `{}` | `(corpo)`: informe ao menos um campo: titulo, descricao, status ou solucao |
| `POST /ordens` com JSON malformado | `mensagem`: JSON malformado., sem `detalhes` |
| `GET /ordens/abc` | `id`: deve ser um UUID válido |

### ID válido sem ordem

```bash
curl http://localhost:3000/ordens/3f2b8c1e-9d4a-4c7b-8e6f-1a2b3c4d5e6f
```

`404 Not Found`:

```json
{ "erro": { "codigo": "NAO_ENCONTRADA", "mensagem": "Ordem de serviço não encontrada.", "detalhes": [] } }
```

### Excluir uma ordem

```bash
curl -i -X DELETE http://localhost:3000/ordens/612f32fc-9c29-43d4-b796-889aeae479a3
```

`204 No Content`, sem corpo. Uma nova consulta ou exclusão do mesmo ID responde `404`.

## Cache

`GET /ordens/:id` usa cache em Redis no padrão cache-aside:

- **MISS:** a ordem não está no cache; a API lê do banco, grava no cache por `CACHE_TTL_SEGUNDOS` e
  responde com `X-Cache: MISS`.
- **HIT:** a ordem está no cache; a API responde sem consultar o banco, com `X-Cache: HIT`.
- **Invalidação:** `PATCH` e `DELETE` removem a ordem do cache depois do `COMMIT`. A leitura seguinte é
  um MISS e traz o dado atualizado (ou 404, depois da exclusão). Um `PATCH` rejeitado não mexe no cache.
- Ordem inexistente (404) não é cacheada. A listagem `GET /ordens` não usa cache.

### Demonstração

Com a API no ar e uma ordem criada (troque `$ID` pelo ID retornado no `POST`):

```bash
curl -s -o /dev/null -D - http://localhost:3000/ordens/$ID | grep -i x-cache   # X-Cache: MISS
curl -s -o /dev/null -D - http://localhost:3000/ordens/$ID | grep -i x-cache   # X-Cache: HIT

curl -s -X PATCH http://localhost:3000/ordens/$ID \
  -H 'Content-Type: application/json' -d '{"status":"em_andamento"}' > /dev/null

curl -s -D - http://localhost:3000/ordens/$ID | grep -i -e x-cache -e em_andamento
# X-Cache: MISS, já com "status":"em_andamento"
curl -s -o /dev/null -D - http://localhost:3000/ordens/$ID | grep -i x-cache   # X-Cache: HIT

curl -s -o /dev/null -X DELETE http://localhost:3000/ordens/$ID
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/ordens/$ID         # 404
```

Para ver a chave e o tempo de vida direto no Redis:

```bash
docker compose exec cache redis-cli TTL ordem:$ID
```

## Escolha do banco: PostgreSQL

- **O domínio é relacional e de esquema fixo.** Uma ordem tem campos conhecidos e tipados, e não há
  documentos de estrutura variável que justifiquem um banco orientado a documentos.
- **As regras do domínio viram constraints.** `status` restrito aos três estados, textos com conteúdo
  e "concluída exige solução" são `CHECK`s no próprio banco. Mesmo um erro na aplicação ou uma escrita
  feita fora dela não grava uma ordem inválida.
- **A regra de conclusão depende do estado atual.** A atualização precisa ler a ordem, combinar com o
  que foi enviado e validar o resultado sem interferência de outra atualização simultânea. Transações
  com trava de linha (`SELECT ... FOR UPDATE`) resolvem isso diretamente.
- **UUID nativo** (`gen_random_uuid()`) para o ID gerado pelo servidor, e consultas parametrizadas
  (`$1`, `$2`…) no driver `pg`, que protegem contra SQL Injection.

## Decisões técnicas

**Stack.** Node.js 24 (LTS) com Express 5, que encaminha erros de handlers `async` ao tratador central
sem código extra. Acesso ao banco com `pg` e SQL escrito à mão, sem ORM: são poucas consultas, e o SQL
explícito deixa claro o que cada operação faz no banco.

**Validação na borda.** Cada corpo e cada ID passam por um schema `zod` estrito antes de chegar ao
serviço. Campos fora do contrato são rejeitados, inclusive `id`. O ID é validado como UUID **antes** da
consulta; assim um ID malformado responde 400, e um UUID válido sem ordem responde 404.

**Normalização dos textos.** `titulo`, `descricao` e `solucao` são gravados sem os espaços das
extremidades. Uma `solucao` vazia depois disso é gravada como `NULL`, de modo que "sem solução" tem uma
única representação.

**Contrato de `solucao`.**

- Quando enviada, precisa ser texto. `null` explícito é rejeitado, porque o contrato define o campo
  como texto.
- Para remover a solução, envie `""`. Isso só é aceito se a ordem não ficar `concluida`.
- **Reabertura permitida:** uma ordem `concluida` pode voltar para `aberta` ou `em_andamento`, porque o
  enunciado não proíbe. A solução é mantida.

**Regra de conclusão sobre o estado resultante.** O `PATCH` roda numa transação:

1. `SELECT ... FOR UPDATE` lê e trava a ordem (ou responde 404);
2. os campos enviados são aplicados sobre o estado atual;
3. `validarEstado` (`src/ordens/regras.js`, função pura) verifica a regra no resultado;
4. `UPDATE ... RETURNING` grava e devolve a ordem.

A trava evita que duas atualizações simultâneas da mesma ordem leiam o mesmo estado e uma sobrescreva
a outra; por exemplo, uma conclusão aprovada com base numa solução que outra requisição está apagando.

**Constraints como última linha de defesa.**

```sql
status  text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'em_andamento', 'concluida')),
solucao text CHECK (solucao IS NULL OR solucao ~ '\S'),
CONSTRAINT ordens_conclusao_exige_solucao CHECK (status <> 'concluida' OR solucao IS NOT NULL)
```

Um `CHECK` só rejeita quando a expressão é `false`; quando ela resulta em `NULL`, o PostgreSQL aceita
a linha. Por isso a regra de conclusão testa `solucao IS NOT NULL` explicitamente (com `status NOT NULL`,
a expressão nunca dá `NULL`), e o "tem conteúdo além de espaços" fica no `CHECK` da coluna. Uma
expressão como `btrim(solucao) <> ''` deixaria passar uma ordem concluída com `solucao` nula. Se uma
constraint barrar uma gravação, a API responde 400 e registra o caso no log como aviso, porque indica
uma brecha na validação da aplicação.

**Erros e segurança.**

- Formato único de erro; todo problema de entrada responde 400, como pede o enunciado, inclusive
  Content-Type errado e corpo acima de 10 KB.
- Erros inesperados respondem 500 genérico; stack e detalhes ficam só no log.
- `helmet` para os headers de segurança.
- Log estruturado (`pino`) com `X-Request-Id`, registrando só id, método, URL e status (sem headers nem
  corpo).
- Credenciais só em variáveis de ambiente; o `.env` não é versionado.
- A imagem da API roda com um usuário sem privilégios.

**Banco e migrations.** As migrations são arquivos SQL em `src/db/migrations`, aplicados em ordem pela
própria API na inicialização, cada um na sua transação, e registrados em `schema_migrations`. Isso
mantém a criação do banco dentro do `docker compose up`, sem passo manual. O healthcheck do PostgreSQL
usa TCP: durante a inicialização, o servidor temporário do container aceita só conexões locais por
socket, e um healthcheck por socket liberaria a API cedo demais.

**Cache.** Redis com cliente `redis`, injetado no serviço de ordens (`criarApp({ logger, cache })`).

- O cache só é invalidado **depois do `COMMIT`**. Invalidar dentro da transação abriria uma janela em
  que uma leitura concorrente repovoaria o cache com o estado ainda não alterado.
- Invalidar em vez de regravar mantém um único caminho de escrita no cache (a leitura) e não grava
  ordens que talvez nunca sejam lidas.
- **O Redis é opcional para a disponibilidade.** Sem `REDIS_URL`, a API roda sem cache. Com o Redis
  fora do ar, a leitura vira MISS e a gravação e a invalidação só são registradas no log: o cliente
  roda sem fila offline, então os comandos falham na hora em vez de segurar a requisição, e o log
  registra só as mudanças de estado da conexão.
- O Redis roda sem persistência em disco e sem porta exposta: é só um cache.

**Docker.** `Dockerfile` multi-stage: um estágio instala as dependências de produção com `npm ci` a
partir do `package-lock.json`, outro monta a imagem de testes, e o estágio final contém só o código e
as dependências de produção.

## Estrutura do projeto

```
src/
├── app.js                 # monta o Express: log, helmet, JSON, rotas, 404 e tratador de erros
├── server.js              # aplica migrations, cria o cache, sobe o servidor e trata SIGTERM/SIGINT
├── config.js              # valida as variáveis de ambiente
├── logger.js
├── cache/
│   └── cache.js           # cache-aside no Redis, com fallback quando o Redis está fora
├── db/
│   ├── pool.js            # pool do pg (lê PGHOST, PGUSER, PGPASSWORD, PGDATABASE)
│   ├── transacao.js       # BEGIN/COMMIT/ROLLBACK
│   ├── migrate.js
│   └── migrations/001_criar_ordens.sql
├── http/
│   ├── erros.js           # erros da API com status e código
│   ├── errorHandler.js    # tratador central de erros
│   └── validar.js         # aplica um schema zod e converte as falhas em detalhes
└── ordens/
    ├── ordens.routes.js
    ├── ordens.schemas.js
    ├── ordens.service.js
    ├── ordens.repository.js
    └── regras.js          # regra de conclusão (função pura)
test/
├── helpers.js
├── ordens.http.test.js
├── cache.test.js
└── regras.test.js
```

## Limitações

- **Sem autenticação nem autorização**, fora do escopo do desafio.
- **Sem paginação nem filtros** em `GET /ordens`: a listagem devolve todas as ordens.
- **CORS desabilitado.** A API não envia headers CORS, então nenhuma origem de navegador está
  autorizada; clientes como `curl`, outros serviços e ferramentas de API funcionam normalmente.
- **Espaços Unicode.** A aplicação usa o `trim()` do JavaScript e o banco usa `\S`; em casos raros de
  caracteres de espaço Unicode, os dois podem discordar. No pior caso, o banco recusa a gravação e a
  API responde 400; nunca é gravado um dado inválido.
- **Migrations só para frente**, sem rollback automático, e pensadas para uma única instância da API
  aplicando-as na inicialização.
- **`atualizado_em` muda a cada `PATCH` aceito**, mesmo que os valores enviados sejam iguais aos atuais.
- **Cache com consistência eventual em corridas raras.** Se uma leitura buscar a ordem no banco antes de
  um `PATCH` concorrente e gravar no cache depois da invalidação, o cache guarda o estado anterior até o
  TTL expirar (60 s por padrão). O mesmo vale se a invalidação falhar porque o Redis caiu naquele
  instante.
- **Redis sem senha**, acessível só pela rede interna do Compose.
- **Credenciais do banco de teste fixas** em `compose.test.yaml`. O banco é efêmero, fica em memória e
  não expõe porta.

## Uso de IA

O enunciado permite o uso de IA. Usei um assistente de IA (Claude Code) como apoio nas etapas abaixo.
Revisei o código entregue e sou capaz de explicá-lo, testá-lo e alterá-lo.

| Etapa | Apoio da IA |
|---|---|
| Leitura do enunciado e planejamento | Organização dos requisitos, plano de implementação e levantamento de casos de borda, como o `CHECK` que aceita `NULL` |
| Estrutura do repositório | Configuração de branches, rulesets, templates de issue e PR, e workflows de CI |
| Implementação | Primeira versão do código, do `Dockerfile`, dos arquivos do Compose e dos testes |
| Documentação | Rascunho deste README, com os exemplos conferidos contra a API em execução |

As decisões de contrato e de arquitetura descritas acima foram discutidas com o assistente e definidas
por mim.
