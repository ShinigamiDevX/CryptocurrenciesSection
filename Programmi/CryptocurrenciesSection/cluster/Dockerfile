FROM node:22-alpine

# Installa Python e pip
RUN apk add --no-cache python3 py3-pip py3-virtualenv

# Crea e popola il venv Python (usato da cluster.js tramite HOME)
COPY requirements.txt /tmp/requirements.txt
RUN python3 -m venv /root/venv && \
    /root/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

WORKDIR /app

# Installa le dipendenze Node
COPY dashboard/package*.json dashboard/
RUN cd dashboard && npm install --omit=dev

# Copia tutti i file del progetto
COPY . .

ENV PORT=3000

EXPOSE 3000

WORKDIR /app/dashboard
CMD ["node", "cluster.js"]
