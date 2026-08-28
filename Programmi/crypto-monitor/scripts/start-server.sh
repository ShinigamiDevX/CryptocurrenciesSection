#!/bin/bash

# Interrompi lo script se un comando fallisce
set -e

echo "=== Avvio Remoto Crypto Monitor ==="

# 1. Verifica e installazione dipendenze
if [ ! -d "node_modules" ]; then
    echo "[INFO] node_modules non trovato. Installazione dipendenze..."
    npm install
else
    echo "[INFO] Dipendenze già presenti."
fi

# 2. Verifica build
if [ ! -d "dist" ]; then
    echo "[INFO] Build non trovata. Esecuzione build..."
    npm run build
else
    echo "[INFO] Build già presente. Salto compilazione (esegui 'npm run build' manualmente se necessario aggiornare)."
fi

# 3. Avvio server
echo "[INFO] Avvio server di preview..."
echo "[SECURE] Il server ascolterà SOLO su 127.0.0.1 (localhost). Accessibile solo via Tunnel SSH."
echo ""
echo "Applicazione pronta! Accedi dal tuo PC locale su: http://localhost:5870"
echo "Premi Ctrl+C per terminare."
echo ""

# Esegue vite preview sulla porta 5870, vincolato a localhost
npx vite preview --port 5870 --host 127.0.0.1
