FROM node:20-alpine

RUN apk add --no-cache bash

WORKDIR /app

COPY package.json package-lock.json ./

ENV NODE_ENV production

RUN npm ci --omit=dev

COPY . .

RUN cp config/default.example.yml config/local.yml

EXPOSE 3005

USER node

CMD [ "npm", "start" ]
