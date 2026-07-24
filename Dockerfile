FROM nginx:alpine

# Installa openssl per generare il certificato self-signed
RUN apk add --no-cache openssl && \
    mkdir -p /etc/nginx/ssl && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/key.pem \
        -out /etc/nginx/ssl/cert.pem \
        -subj "/CN=192.168.4.77"

# Rimuove la config di default di nginx
RUN rm -rf /usr/share/nginx/html/*

# Copia la configurazione nginx personalizzata
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia i file del sito nella cartella pubblica di nginx
COPY . /usr/share/nginx/html/

# Espone le porte HTTP e HTTPS
EXPOSE 80 443
