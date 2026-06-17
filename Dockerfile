# Build the React app, then serve it (plus the API) with the dependency-free
# Node backend.
FROM node:22-alpine AS build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY server.js ./
COPY --from=build /app/web/dist ./web/dist

# data lives in a mounted volume; create it empty rather than baking in local tasks
RUN addgroup -S donezo && adduser -S donezo -G donezo \
  && mkdir -p /app/data \
  && chown -R donezo:donezo /app

USER donezo

EXPOSE 4173
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4173) + '/api/tasks').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
