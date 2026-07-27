FROM node:22-alpine
# build tools per better-sqlite3
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js db.js ./
RUN mkdir -p data
ENV PORT=4000
EXPOSE 4000
CMD ["node", "server.js"]
