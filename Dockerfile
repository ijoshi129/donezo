FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY index.html styles.css app.js manifest.webmanifest sw.js server.js caldav-sync.js mac-reminders-sync.js ./
COPY icons ./icons
COPY data ./data

RUN addgroup -S donezo && adduser -S donezo -G donezo \
  && chown -R donezo:donezo /app

USER donezo

EXPOSE 4173
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4173) + '/api/tasks').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
