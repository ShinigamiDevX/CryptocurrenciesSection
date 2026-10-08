FROM node:22-alpine
# better-sqlite3 build tools + LibreOffice + font per DOCX→PDF (Seed Phrase)
RUN apk add --no-cache python3 make g++ libreoffice fontconfig font-liberation ttf-dejavu
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js db.js corsi-content.js bibbia-routes.js bibbia-import.js seed-phrase-generate.js ./
COPY templates ./templates
COPY fonts-conf/30-times-new-roman.conf /etc/fonts/conf.d/30-times-new-roman.conf
# Times New Roman (copiare da Windows in auth/fonts/ oppure montare a runtime)
COPY fonts/ /usr/share/fonts/truetype/times/
RUN fc-cache -f -v || true
RUN mkdir -p data
ENV PORT=4000
ENV SEED_PHRASE_CONVERT=libreoffice
EXPOSE 4000
CMD ["node", "server.js"]
