# Immagine base leggera per siti statici
FROM nginx:alpine

# Rimuovi la pagina di default di nginx
RUN rm -rf /usr/share/nginx/html/*

# Configura nginx: root (/) apre home.html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia tutti i file del progetto nella root del sito
COPY . /usr/share/nginx/html/

# Esponi la porta 80
EXPOSE 80

# nginx avviato di default dal base image
CMD ["nginx", "-g", "daemon off;"]
