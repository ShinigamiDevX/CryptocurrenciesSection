#!/bin/bash

# Ottieni la directory dello script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================="
echo "    CRYPTO MONITOR - AVVIO IN CORSO..."
echo "=========================================="

# Imposta l'ambiente di produzione
export NODE_ENV=production

# Messaggio informativo
echo "[INFO] Ottimizzazione dipendenze per ambiente Linux (questo assicura che il copia-incolla da Windows funzioni)..."
npm rebuild bcrypt better-sqlite3

echo "[INFO] Avvio server Node.js in corso..."

# Avvia il server in background e salva il PID
HOST=0.0.0.0 PORT=3000
node server.js &
SERVER_PID=$!

# Attendi l'avvio del server
sleep 3

# Tenta di aprire il browser (se presente GUI)
if command -v xdg-open > /dev/null; then
    echo "[INFO] Apertura interfaccia su https://localhost:3000..."
    xdg-open "https://localhost:3000"
else
    echo "[INFO] Server attivo su https://localhost:3000"
    echo "[INFO] Ambiente senza interfaccia grafica rilevato."
fi

echo "------------------------------------------"
echo "Premi CTRL+C per fermare il server."
echo "------------------------------------------"

# Gestisci il segnale di interruzione per chiudere il server
trap "kill $SERVER_PID; exit" INT

# Mantieni lo script attivo
wait $SERVER_PID
