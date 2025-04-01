# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
ENV NODE_ENV=production
RUN npm ci --omit=dev

COPY . .

# Stage 2: Runtime
FROM node:22-alpine

# WORKDIR /app

# Copy only what is necessary from the builder stage
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/src/ /app/src/
COPY --from=builder /app/app.js /app/app.js
COPY --from=builder /app/application.js /app/application.js

# Set up the runtime environment
RUN mkdir config 
COPY ./config/default.example.yml config/default.yml

EXPOSE 3005

USER node

CMD [ "npm", "start" ]
