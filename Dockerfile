# Imagen mínima y sin privilegios de root
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
# npm ci respeta package-lock.json (dependencias exactas y verificadas por hash)
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node src ./src
COPY --chown=node:node db ./db
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node public ./public

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "src/server.js"]
