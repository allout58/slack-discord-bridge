FROM node:lts-alpine

WORKDIR /app
COPY * .
RUN yarn install --frozen-lockfile

CMD [ "yarn start" ]