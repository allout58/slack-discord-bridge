FROM docker.io/node:lts-alpine

WORKDIR /app
COPY * .
RUN yarn install --frozen-lockfile

LABEL org.opencontainers.image.source = "https://github.com/allout58/slack-discord-bridge"

CMD [ "-r", "ts-node/register", "-r", "dotenv/config", "index.ts" ]
