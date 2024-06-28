FROM node:16-slim
RUN apt-get update
RUN apt-get install -y openssl

WORKDIR /app

COPY package.json ./
# COPY package-lock.json ./

COPY ./prisma ./prisma

COPY ./.env ./

RUN npm install
RUN npx prisma generate

EXPOSE 9000

CMD npm run docker:dev 