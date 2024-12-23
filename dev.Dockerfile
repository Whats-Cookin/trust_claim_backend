FROM node:22-bookworm

RUN yarn global add prisma nodemon

WORKDIR /usr/src/app

COPY package.json .
COPY yarn.lock .
COPY tsconfig.json .

RUN --mount=type=cache,target=/usr/src/app/node_modules \
  yarn

COPY prisma .

RUN prisma generate

COPY src src

EXPOSE 9000

CMD ["nodemon", "-w", "src/**/*", "src/index.ts"]
