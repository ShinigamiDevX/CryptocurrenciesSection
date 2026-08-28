# Guida alla Configurazione SMTP (Email)

Questa guida spiega come configurare il server SMTP per permettere all'applicazione di inviare **email di invito** reali ai nuovi utenti.

## 1. Perché Configurare l'SMTP?
Senza SMTP, il sistema userà una modalità "offline":
- Gli inviti **non** verranno inviati via email.
- I link di invito verranno salvati nel file `backups/invites.log`.
- Dovrai copiare manualmente il link e inviarlo al collega.

Configurando l'SMTP, i colleghi riceveranno l'invito direttamente nella loro casella di posta.

## 2. Come Configurare (Dalla Dashboard)

1.  Accedi come **Amministratore**.
2.  Clicca sul pulsante **"Utenti"** nella barra in alto (accanto a "Backup").
3.  Nella sezione "Configurazione Email (SMTP)", clicca su **"Configura"**.
4.  Inserisci i dati richiesti:
    -   **Host**: Indirizzo del server SMTP (es. `smtp.gmail.com`).
    -   **Porta**: Porta del server (solitamente `587` per TLS o `465` per SSL).
    -   **Utente**: La tua email completa.
    -   **Password**: La password del tuo account email (o "App Password", vedi sotto).

## 3. Configurazione Specifica per Gmail

Se utilizzi un account @gmail.com o Google Workspace, **la tua normale password di login NON funzionerà** se hai l'autenticazione a due fattori (2FA) attiva (che è standard ormai).

Devi generare una **Password per le app**:

1.  Vai su [Google Account - Security](https://myaccount.google.com/security).
2.  Assicurati che la **Verifica in due passaggi** (2-Step Verification) sia ATTIVA.
3.  Cerca la voce **"Password per le app"** (App passwords).
    -   *Nota: Se non la trovi, usa la barra di ricerca in alto e scrivi "App passwords".*
4.  Crea una nuova app:
    -   Nome: "CryptoMonitor" (o quello che preferisci).
    -   Clicca su **Crea**.
5.  Google ti mostrerà una password di 16 caratteri (es. `abcd efgh ijkl mnop`).
6.  **Copia questa password** e incollala nel campo "Password" della configurazione SMTP nella Dashboard.
    -   *Usa la tua email normale come "Utente".*
    -   *Host*: `smtp.gmail.com`
    -   *Porta*: `587`

## 4. Configurazione per Altri Provider

-   **Outlook / Office 365**:
    -   Host: `smtp.office365.com`
    -   Porta: `587`
    -   Metodo: STARTTLS
-   **Aruba / Altri Hosting**:
    -   Consulta la guida del tuo provider per i parametri "Server Posta in Uscita (SMTP)".
    -   Spesso richiedono l'autenticazione SSL su porta 465.

## 5. Test e Risoluzione Problemi

-   Quando clicchi "Salva Configurazione", il sistema proverà a connettersi al server.
-   Se ricevi un errore, controlla:
    -   La porta (prova 587 o 465).
    -   Se il tuo antivirus/firewall blocca le connessioni in uscita.
    -   Se le credenziali sono corrette.
-   In caso di fallimento persistente, puoi sempre usare il metodo manuale (`backups/invites.log`).
