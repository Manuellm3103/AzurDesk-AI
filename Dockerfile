FROM node:24-alpine
RUN apk add --no-cache dumb-init python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN mkdir -p data
EXPOSE 5200
ENV NODE_ENV=production
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.mjs"]
