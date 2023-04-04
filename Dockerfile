FROM node:18-slim

ENV NODE_ENV production

WORKDIR /app

COPY package.json package-lock.json /app/

RUN npm install \
 && npm cache clear --force

COPY . /app

RUN cp config/default.example.yml config/default.yml

EXPOSE 3005

CMD ["node", "app.js"]
