FROM node:22-bookworm

RUN --mount=type=cache,target=/usr/src/app/node_modules \
  npm i -g prisma

WORKDIR /usr/src/app

COPY package*.json .
COPY tsconfig.json .

RUN --mount=type=cache,target=/usr/src/app/node_modules \
  npm i

COPY prisma .

RUN prisma generate

COPY src src

EXPOSE 9000

CMD ["npm", "run", "dev"]
# CMD ["tsc", "-w"]
