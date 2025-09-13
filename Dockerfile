FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --prod

COPY server.js ./

ENV PROXY1_PORT=9222
ENV PROXY1_TARGET=https://t3.chat
ENV PROXY1_FIND=api.sync.t3.chat
ENV PROXY1_REPLACE=127.0.0.1:9223
ENV PROXY2_PORT=9223
ENV PROXY2_TARGET=https://api.sync.t3.chat

EXPOSE 9222 9223

CMD ["node", "server.js"]
