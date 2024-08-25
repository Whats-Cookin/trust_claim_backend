ARG ALPINE_VERSION=3.19

FROM node:22-alpine${ALPINE_VERSION} AS base

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.lock ./


###
FROM base AS builder

WORKDIR /usr/src/app

RUN --mount=type=cache,target=/usr/src/app/node_modules \
  yarn --frozen-lockfile

COPY ./prisma ./prisma
COPY ./src ./src
COPY ./tsconfig.json .

RUN npx prisma generate && yarn build


###
FROM base AS prod-packages

WORKDIR /usr/src/app

RUN --mount=type=cache,target=/usr/src/app/node_modules \
  yarn --production

COPY ./prisma ./prisma

RUN npx prisma generate

###
FROM alpine:${ALPINE_VERSION}

WORKDIR /usr/src/app

# Install required packages, create a user and change the source's user for more security
RUN apk add --no-cache libstdc++ dumb-init openssl \
  && addgroup -g 1000 node && adduser -u 1000 -G node -s /bin/sh -D node \
  && chown node:node ./

COPY --from=builder /usr/local/bin/node /usr/local/bin/
COPY --from=builder /usr/local/bin/docker-entrypoint.sh /usr/local/bin/
ENTRYPOINT ["docker-entrypoint.sh"]

USER node

COPY --from=prod-packages /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/build ./build

EXPOSE 9000

CMD ["node", "build/index.js"]
