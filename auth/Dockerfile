FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js .
RUN mkdir -p data
ENV PORT=4000
EXPOSE 4000
CMD ["node", "server.js"]
