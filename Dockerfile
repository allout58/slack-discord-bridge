FROM docker.io/node:lts-alpine

WORKDIR /app
COPY * .
RUN yarn install --frozen-lockfile

CMD [ "-r", "ts-node/register", "-r", "dotenv/config", "index.ts" ]
