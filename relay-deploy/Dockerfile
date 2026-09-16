FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY fef-remote-relay-service.js ./

ENV NODE_ENV=production
ENV PORT=5557
ENV RELAY_HOST=0.0.0.0

EXPOSE 5557

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5557/health || exit 1

CMD ["node", "fef-remote-relay-service.js"]
