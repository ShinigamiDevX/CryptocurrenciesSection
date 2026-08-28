# Controllo connessione al server

## 1. Il server è in esecuzione?
Nella cartella dello strumento:
```bash
cd C:\Users\Admin\Desktop\Portale\Programmi\Materiali
```
Avvio HTTPS (porta 5174):
```bash
npm run start:https
```

## 2. Firewall blocca la porta?
Consenti in ingresso TCP 5174 (HTTPS) o la porta usata da `npm start`.

## 3. Accesso dal browser
HTTPS (consigliato, porta 5174): **https://192.168.4.80:5174/home.html**

HTTP (`npm start`, porta 5175): **http://192.168.4.80:5175/home.html**

(Il browser mostrerà "connessione non sicura" per il certificato autofirmato: clicca Avanzate → Procedi.)

## 4. Verifica IP di questa macchina
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' }
```
Usa l'indirizzo LAN (es. 192.168.4.80) nel browser.
