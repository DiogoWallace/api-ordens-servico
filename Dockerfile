# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY package.json package-lock.json ./

# Dependências de produção, instaladas exatamente como no package-lock.json.
FROM base AS deps
RUN npm ci --omit=dev && npm cache clean --force

# Imagem dos testes: inclui as dependências de desenvolvimento.
FROM base AS test
RUN npm ci && npm cache clean --force
COPY openapi.yaml ./
COPY src ./src
COPY test ./test
USER node
CMD ["npm", "test"]

# Imagem de execução da API.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY openapi.yaml ./
COPY src ./src
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
