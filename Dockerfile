FROM node:16-slim
RUN apt-get update
RUN apt-get install -y openssl

WORKDIR /app

COPY package.json ./
COPY yarn.lock ./

COPY ./prisma ./prisma

COPY ./.env ./

RUN yarn
RUN npx prisma generate

EXPOSE 9000

CMD npm run docker:dev 