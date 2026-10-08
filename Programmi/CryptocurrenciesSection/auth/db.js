'use strict';
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH  = path.join(DATA_DIR, 'portal.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
// WAL su bind mount Docker Desktop (Windows/macOS) può perdere scritture al restart.
// DELETE + FULL: più sicuro per portal.db montato da ./auth/data.
db.pragma('journal_mode = DELETE');
db.pragma('synchronous = FULL');
db.pragma('busy_timeout = 5000');
// Necessario perché SQLite applichi le FOREIGN KEY e le ON DELETE dichiarate sotto.
db.pragma('foreign_keys = ON');

function closeDb() {
    try { db.close(); } catch { /* già chiuso */ }
}
process.on('SIGINT', () => { closeDb(); process.exit(0); });
process.on('SIGTERM', () => { closeDb(); process.exit(0); });
process.on('exit', closeDb);

// ── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id                      TEXT PRIMARY KEY,
        email                   TEXT UNIQUE NOT NULL COLLATE NOCASE,
        passwordHash            TEXT NOT NULL DEFAULT '',
        role                    TEXT NOT NULL DEFAULT 'user',
        createdAt               TEXT NOT NULL,
        revokedAt               TEXT,
        visible                 INTEGER NOT NULL DEFAULT 1,
        hiddenAt                TEXT,
        mustChangePassword      INTEGER NOT NULL DEFAULT 0,
        nome                    TEXT NOT NULL DEFAULT '',
        cognome                 TEXT NOT NULL DEFAULT '',
        grado                   TEXT NOT NULL DEFAULT '',
        dataNascita             TEXT NOT NULL DEFAULT '',
        luogoNascita            TEXT NOT NULL DEFAULT '',
        luogoNascitaTipo        TEXT NOT NULL DEFAULT '',
        luogoNascitaProvincia   TEXT NOT NULL DEFAULT '',
        luogoNascitaComune      TEXT NOT NULL DEFAULT '',
        luogoNascitaStato       TEXT NOT NULL DEFAULT '',
        residenza               TEXT NOT NULL DEFAULT '',
        residenzaTipo           TEXT NOT NULL DEFAULT '',
        residenzaProvincia      TEXT NOT NULL DEFAULT '',
        residenzaComune         TEXT NOT NULL DEFAULT '',
        residenzaStato          TEXT NOT NULL DEFAULT '',
        residenzaIndirizzo      TEXT NOT NULL DEFAULT '',
        residenzaCivico         TEXT NOT NULL DEFAULT '',
        domicilio               TEXT NOT NULL DEFAULT '',
        domicilioTipo           TEXT NOT NULL DEFAULT '',
        domicilioProvincia      TEXT NOT NULL DEFAULT '',
        domicilioComune         TEXT NOT NULL DEFAULT '',
        domicilioStato          TEXT NOT NULL DEFAULT '',
        domicilioIndirizzo      TEXT NOT NULL DEFAULT '',
        domicilioCivico         TEXT NOT NULL DEFAULT '',
        domicilioComeResidenza  INTEGER NOT NULL DEFAULT 0,
        telefono                TEXT NOT NULL DEFAULT '',
        telefonoPrefisso        TEXT NOT NULL DEFAULT '+39',
        allowedCards            TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS invitations (
        token         TEXT PRIMARY KEY,
        email         TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'user',
        invitedBy     TEXT,
        createdAt     TEXT NOT NULL,
        expiresAt     TEXT NOT NULL,
        used          INTEGER NOT NULL DEFAULT 0,
        otp           TEXT,
        otpExpiry     TEXT,
        otpUsed       INTEGER NOT NULL DEFAULT 0,
        allowedCards  TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS profile_change_requests (
        id                     TEXT PRIMARY KEY,
        userId                 TEXT NOT NULL,
        userEmail              TEXT NOT NULL,
        nome                   TEXT NOT NULL,
        cognome                TEXT NOT NULL,
        grado                  TEXT NOT NULL,
        dataNascita            TEXT NOT NULL DEFAULT '',
        luogoNascita           TEXT NOT NULL DEFAULT '',
        luogoNascitaTipo       TEXT NOT NULL DEFAULT '',
        luogoNascitaProvincia  TEXT NOT NULL DEFAULT '',
        luogoNascitaComune     TEXT NOT NULL DEFAULT '',
        luogoNascitaStato      TEXT NOT NULL DEFAULT '',
        residenza              TEXT NOT NULL DEFAULT '',
        residenzaTipo          TEXT NOT NULL DEFAULT '',
        residenzaProvincia     TEXT NOT NULL DEFAULT '',
        residenzaComune        TEXT NOT NULL DEFAULT '',
        residenzaStato         TEXT NOT NULL DEFAULT '',
        residenzaIndirizzo     TEXT NOT NULL DEFAULT '',
        residenzaCivico        TEXT NOT NULL DEFAULT '',
        domicilio              TEXT NOT NULL DEFAULT '',
        domicilioTipo          TEXT NOT NULL DEFAULT '',
        domicilioProvincia     TEXT NOT NULL DEFAULT '',
        domicilioComune        TEXT NOT NULL DEFAULT '',
        domicilioStato         TEXT NOT NULL DEFAULT '',
        domicilioIndirizzo     TEXT NOT NULL DEFAULT '',
        domicilioCivico        TEXT NOT NULL DEFAULT '',
        domicilioComeResidenza INTEGER NOT NULL DEFAULT 0,
        telefono               TEXT NOT NULL DEFAULT '',
        telefonoPrefisso       TEXT NOT NULL DEFAULT '+39',
        requestedAt            TEXT NOT NULL,
        status                 TEXT NOT NULL DEFAULT 'pending',
        reviewedBy             TEXT,
        reviewedAt             TEXT
    );
    CREATE TABLE IF NOT EXISTS notifications (
        id        TEXT PRIMARY KEY,
        userId    TEXT NOT NULL,
        type      TEXT NOT NULL,
        title     TEXT NOT NULL,
        body      TEXT NOT NULL DEFAULT '',
        link      TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL,
        readAt    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(userId, createdAt);
    CREATE TABLE IF NOT EXISTS idee (
        id          TEXT PRIMARY KEY,
        userId      TEXT NOT NULL,
        authorLabel TEXT NOT NULL DEFAULT '',
        authorEmail TEXT NOT NULL DEFAULT '',
        body        TEXT NOT NULL,
        topicKind   TEXT NOT NULL DEFAULT '',
        topicKey    TEXT NOT NULL DEFAULT '',
        topicLabel  TEXT NOT NULL DEFAULT '',
        createdAt   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_idee_created ON idee(createdAt);
    CREATE TABLE IF NOT EXISTS messages (
        id           TEXT PRIMARY KEY,
        senderId     TEXT NOT NULL,
        senderLabel  TEXT NOT NULL DEFAULT '',
        recipientId  TEXT NOT NULL,
        body         TEXT NOT NULL,
        createdAt    TEXT NOT NULL,
        readAt       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipientId, createdAt);
    CREATE TABLE IF NOT EXISTS message_attachments (
        id        TEXT PRIMARY KEY,
        kind      TEXT NOT NULL,
        mime      TEXT NOT NULL,
        name      TEXT NOT NULL DEFAULT '',
        size      INTEGER NOT NULL DEFAULT 0,
        width     INTEGER NOT NULL DEFAULT 0,
        height    INTEGER NOT NULL DEFAULT 0,
        data      BLOB NOT NULL,
        createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS corsi_versions (
        id             TEXT PRIMARY KEY,
        itemId         TEXT NOT NULL,
        title          TEXT NOT NULL DEFAULT '',
        kind           TEXT NOT NULL DEFAULT 'post',
        content        TEXT NOT NULL DEFAULT '',
        action         TEXT NOT NULL DEFAULT 'update',
        editedById     TEXT NOT NULL DEFAULT '',
        editedByEmail  TEXT NOT NULL DEFAULT '',
        createdAt      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_corsi_versions_item ON corsi_versions(itemId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_corsi_versions_created ON corsi_versions(createdAt);
    CREATE TABLE IF NOT EXISTS corsi_items (
        id          TEXT PRIMARY KEY,
        parentId    TEXT REFERENCES corsi_items(id) ON DELETE CASCADE,
        position    INTEGER NOT NULL DEFAULT 0,
        type        TEXT NOT NULL DEFAULT 'section',
        title       TEXT NOT NULL DEFAULT '',
        content     TEXT NOT NULL DEFAULT '',
        courseDate  TEXT NOT NULL DEFAULT '',
        createdAt   TEXT NOT NULL,
        updatedAt   TEXT NOT NULL,
        createdById TEXT REFERENCES users(id) ON DELETE SET NULL,
        updatedById TEXT REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_corsi_items_parent ON corsi_items(parentId, position);
    CREATE TABLE IF NOT EXISTS password_resets (
        token      TEXT PRIMARY KEY,
        userId     TEXT NOT NULL,
        email      TEXT NOT NULL,
        createdAt  TEXT NOT NULL,
        expiresAt  TEXT NOT NULL,
        used       INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_password_resets_active ON password_resets(used, expiresAt);

    CREATE TABLE IF NOT EXISTS bibbia_exchanges (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        website         TEXT NOT NULL DEFAULT '',
        requestInfo     TEXT NOT NULL DEFAULT '',
        notes           TEXT NOT NULL DEFAULT '',
        logoKey         TEXT NOT NULL DEFAULT '',
        sortOrder       INTEGER NOT NULL DEFAULT 0,
        createdAt       TEXT NOT NULL,
        updatedAt       TEXT NOT NULL,
        createdById     TEXT,
        updatedById     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bibbia_exchanges_name ON bibbia_exchanges(name COLLATE NOCASE);

    CREATE TABLE IF NOT EXISTS bibbia_contacts (
        id              TEXT PRIMARY KEY,
        exchangeId      TEXT NOT NULL REFERENCES bibbia_exchanges(id) ON DELETE CASCADE,
        roleLabel       TEXT NOT NULL DEFAULT '',
        name            TEXT NOT NULL DEFAULT '',
        email           TEXT NOT NULL DEFAULT '',
        pec             TEXT NOT NULL DEFAULT '',
        phone           TEXT NOT NULL DEFAULT '',
        notes           TEXT NOT NULL DEFAULT '',
        sortOrder       INTEGER NOT NULL DEFAULT 0,
        createdAt       TEXT NOT NULL,
        updatedAt       TEXT NOT NULL,
        createdById     TEXT,
        updatedById     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bibbia_contacts_exchange ON bibbia_contacts(exchangeId, sortOrder);

    CREATE TABLE IF NOT EXISTS bibbia_change_requests (
        id                  TEXT PRIMARY KEY,
        entityType          TEXT NOT NULL,
        entityId            TEXT NOT NULL,
        action              TEXT NOT NULL,
        payload             TEXT NOT NULL DEFAULT '{}',
        reason              TEXT NOT NULL DEFAULT '',
        requestedById       TEXT NOT NULL,
        requestedByEmail    TEXT NOT NULL,
        requestedAt         TEXT NOT NULL,
        status              TEXT NOT NULL DEFAULT 'pending',
        reviewedByEmail     TEXT,
        reviewedAt          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bibbia_requests_pending ON bibbia_change_requests(status, requestedAt);
`);

// Migrazione colonne opzionali (aggiunta su DB esistenti)
const USER_EXTRA_COLS = [
    ['nome', "TEXT NOT NULL DEFAULT ''"],
    ['cognome', "TEXT NOT NULL DEFAULT ''"],
    ['grado', "TEXT NOT NULL DEFAULT ''"],
    ['dataNascita', "TEXT NOT NULL DEFAULT ''"],
    ['luogoNascita', "TEXT NOT NULL DEFAULT ''"],
    ['luogoNascitaTipo', "TEXT NOT NULL DEFAULT ''"],
    ['luogoNascitaProvincia', "TEXT NOT NULL DEFAULT ''"],
    ['luogoNascitaComune', "TEXT NOT NULL DEFAULT ''"],
    ['luogoNascitaStato', "TEXT NOT NULL DEFAULT ''"],
    ['residenza', "TEXT NOT NULL DEFAULT ''"],
    ['residenzaTipo', "TEXT NOT NULL DEFAULT ''"],
    ['residenzaProvincia', "TEXT NOT NULL DEFAULT ''"],
    ['residenzaComune', "TEXT NOT NULL DEFAULT ''"],
    ['residenzaStato', "TEXT NOT NULL DEFAULT ''"],
    ['residenzaIndirizzo', "TEXT NOT NULL DEFAULT ''"],
    ['residenzaCivico', "TEXT NOT NULL DEFAULT ''"],
    ['domicilio', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioTipo', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioProvincia', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioComune', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioStato', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioIndirizzo', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioCivico', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioComeResidenza', 'INTEGER NOT NULL DEFAULT 0'],
    ['telefono', "TEXT NOT NULL DEFAULT ''"],
    ['telefonoPrefisso', "TEXT NOT NULL DEFAULT '+39'"],
    ['allowedCards', "TEXT NOT NULL DEFAULT ''"],
    ['docente', 'INTEGER NOT NULL DEFAULT 0'],
    ['loginOtp', 'TEXT'],
    ['loginOtpExpiry', 'TEXT'],
    ['tokenVersion', 'INTEGER NOT NULL DEFAULT 0'],
    ['otpFailCount', 'INTEGER NOT NULL DEFAULT 0'],
    ['otpSendCount', 'INTEGER NOT NULL DEFAULT 0'],
    ['loginLockedUntil', 'TEXT'],
    ['loginLockedReason', "TEXT NOT NULL DEFAULT ''"],
    ['visible', 'INTEGER NOT NULL DEFAULT 1'],
    ['hiddenAt', 'TEXT'],
    ['username', 'TEXT'],
    ['accountType', "TEXT NOT NULL DEFAULT 'user'"],
    ['cardOrder', "TEXT NOT NULL DEFAULT ''"],
    ['avatar', 'BLOB'],
    ['avatarMime', "TEXT NOT NULL DEFAULT ''"],
    ['avatarVersion', 'INTEGER NOT NULL DEFAULT 0'],
];
USER_EXTRA_COLS.forEach(([col, def]) => {
    try { db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`); }
    catch { /* già presente */ }
});

// Flag onboarding: nuovo → 0; utenti già presenti → 1 (non forzare il readme)
try {
    db.exec(`ALTER TABLE users ADD COLUMN onboardingDismissed INTEGER NOT NULL DEFAULT 0`);
    db.exec(`UPDATE users SET onboardingDismissed = 1`);
} catch { /* già presente */ }

['topicKind', 'topicKey', 'topicLabel', 'deletedAt', 'deletedById', 'deletedByLabel'].forEach((col) => {
    try { db.exec(`ALTER TABLE idee ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`); }
    catch { /* già presente */ }
});
db.exec(`
    CREATE TABLE IF NOT EXISTS idee_reads (
        ideaId TEXT NOT NULL,
        userId TEXT NOT NULL,
        readAt TEXT NOT NULL,
        PRIMARY KEY (ideaId, userId)
    );
    CREATE INDEX IF NOT EXISTS idx_idee_reads_user ON idee_reads(userId);
`);
['deletedForSender', 'deletedForRecipient', 'deletedForAll'].forEach((col) => {
    try { db.exec(`ALTER TABLE messages ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`); }
    catch { /* già presente */ }
});
try { db.exec(`ALTER TABLE messages ADD COLUMN deletedForAllAt TEXT NOT NULL DEFAULT ''`); }
catch { /* già presente */ }
// Tipo di messaggio (text | sticker | image | video | file) e allegato collegato
try { db.exec(`ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'text'`); } catch { /* già presente */ }
try { db.exec(`ALTER TABLE messages ADD COLUMN attachmentId TEXT`); } catch { /* già presente */ }
try { db.exec(`ALTER TABLE message_attachments ADD COLUMN storagePath TEXT`); } catch { /* già presente */ }
try { db.exec(`ALTER TABLE message_attachments ADD COLUMN ownerId TEXT`); } catch { /* già presente */ }
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_attachment ON messages(attachmentId)`); } catch { /* ok */ }
try { db.exec(`ALTER TABLE messages ADD COLUMN groupId TEXT`); } catch { /* già presente */ }
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(groupId, createdAt)`); } catch { /* ok */ }
// Tema personale della chat
try { db.exec(`ALTER TABLE users ADD COLUMN chatTheme TEXT NOT NULL DEFAULT ''`); } catch { /* già presente */ }

db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_links (
        userId            TEXT NOT NULL,
        chatId            TEXT NOT NULL,
        telegramUsername  TEXT NOT NULL DEFAULT '',
        linkedAt          TEXT NOT NULL,
        PRIMARY KEY (userId, chatId)
    );
    CREATE TABLE IF NOT EXISTS telegram_link_codes (
        code       TEXT PRIMARY KEY,
        userId     TEXT NOT NULL,
        expiresAt  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user ON telegram_link_codes(userId);
    CREATE INDEX IF NOT EXISTS idx_telegram_links_chat ON telegram_links(chatId);
    CREATE INDEX IF NOT EXISTS idx_telegram_links_user ON telegram_links(userId);
`);

/** Migra telegram_links verso PK (userId, chatId): condivisione multi-utente e multi-dispositivo. */
(function migrateTelegramLinksMultiDevice() {
    try {
        const row = db.prepare(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='telegram_links'"
        ).get();
        if (!row || !row.sql) return;
        const sql = String(row.sql);
        const alreadyComposite = /PRIMARY\s+KEY\s*\(\s*userId\s*,\s*chatId\s*\)/i.test(sql);
        if (alreadyComposite) {
            db.exec(`CREATE INDEX IF NOT EXISTS idx_telegram_links_chat ON telegram_links(chatId)`);
            db.exec(`CREATE INDEX IF NOT EXISTS idx_telegram_links_user ON telegram_links(userId)`);
            return;
        }
        db.exec(`
            CREATE TABLE telegram_links_md (
                userId            TEXT NOT NULL,
                chatId            TEXT NOT NULL,
                telegramUsername  TEXT NOT NULL DEFAULT '',
                linkedAt          TEXT NOT NULL,
                PRIMARY KEY (userId, chatId)
            );
            INSERT OR IGNORE INTO telegram_links_md (userId, chatId, telegramUsername, linkedAt)
                SELECT userId, chatId, telegramUsername, linkedAt FROM telegram_links;
            DROP TABLE telegram_links;
            ALTER TABLE telegram_links_md RENAME TO telegram_links;
            CREATE INDEX IF NOT EXISTS idx_telegram_links_chat ON telegram_links(chatId);
            CREATE INDEX IF NOT EXISTS idx_telegram_links_user ON telegram_links(userId);
        `);
        console.log('[DB] telegram_links: multi-dispositivo (PK userId+chatId)');
    } catch (e) {
        console.warn('[DB] Migrazione telegram_links multi-dispositivo:', e.message);
    }
})();

db.exec(`
    CREATE TABLE IF NOT EXISTS message_groups (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        createdBy     TEXT NOT NULL,
        createdAt     TEXT NOT NULL,
        avatar        BLOB,
        avatarMime    TEXT NOT NULL DEFAULT '',
        avatarVersion INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS message_group_members (
        groupId  TEXT NOT NULL,
        userId   TEXT NOT NULL,
        role     TEXT NOT NULL DEFAULT 'member',
        joinedAt TEXT NOT NULL,
        PRIMARY KEY (groupId, userId)
    );
    CREATE INDEX IF NOT EXISTS idx_group_members_user ON message_group_members(userId);
    CREATE TABLE IF NOT EXISTS message_hides (
        messageId TEXT NOT NULL,
        userId    TEXT NOT NULL,
        PRIMARY KEY (messageId, userId)
    );
    CREATE TABLE IF NOT EXISTS message_reads (
        messageId TEXT NOT NULL,
        userId    TEXT NOT NULL,
        readAt    TEXT NOT NULL,
        PRIMARY KEY (messageId, userId)
    );
    CREATE TABLE IF NOT EXISTS message_sticker_favorites (
        userId    TEXT NOT NULL,
        sticker   TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY (userId, sticker)
    );
    CREATE TABLE IF NOT EXISTS app_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
    );
`);

try {
    db.exec(`DROP INDEX IF EXISTS idx_users_username`);
    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
        ON users(username)
        WHERE username IS NOT NULL AND TRIM(username) != ''
    `);
} catch { /* già presente o non supportato */ }

(function migrateHiddenUsers() {
    const now = new Date().toISOString();
    db.prepare(`
        UPDATE users SET hiddenAt = ?
        WHERE visible = 0 AND (hiddenAt IS NULL OR hiddenAt = '')
    `).run(now);
    db.prepare(`
        UPDATE users SET
            passwordHash = '',
            tokenVersion = tokenVersion + 1,
            loginOtp = NULL,
            loginOtpExpiry = NULL
        WHERE visible = 0
          AND revokedAt IS NULL
          AND IFNULL(passwordHash, '') != ''
    `).run();
})();

const INV_EXTRA_COLS = [
    ['allowedCards', "TEXT NOT NULL DEFAULT ''"],
    ['docente', 'INTEGER NOT NULL DEFAULT 0'],
];
INV_EXTRA_COLS.forEach(([col, def]) => {
    try { db.exec(`ALTER TABLE invitations ADD COLUMN ${col} ${def}`); }
    catch { /* già presente */ }
});

const PCR_EXTRA_COLS = [
    ['dataNascita', "TEXT NOT NULL DEFAULT ''"],
    ['luogoNascita', "TEXT NOT NULL DEFAULT ''"],
    ['luogoNascitaTipo', "TEXT NOT NULL DEFAULT ''"],
    ['luogoNascitaProvincia', "TEXT NOT NULL DEFAULT ''"],
    ['luogoNascitaComune', "TEXT NOT NULL DEFAULT ''"],
    ['luogoNascitaStato', "TEXT NOT NULL DEFAULT ''"],
    ['residenza', "TEXT NOT NULL DEFAULT ''"],
    ['residenzaTipo', "TEXT NOT NULL DEFAULT ''"],
    ['residenzaProvincia', "TEXT NOT NULL DEFAULT ''"],
    ['residenzaComune', "TEXT NOT NULL DEFAULT ''"],
    ['residenzaStato', "TEXT NOT NULL DEFAULT ''"],
    ['residenzaIndirizzo', "TEXT NOT NULL DEFAULT ''"],
    ['residenzaCivico', "TEXT NOT NULL DEFAULT ''"],
    ['domicilio', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioTipo', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioProvincia', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioComune', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioStato', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioIndirizzo', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioCivico', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioComeResidenza', 'INTEGER NOT NULL DEFAULT 0'],
    ['telefono', "TEXT NOT NULL DEFAULT ''"],
    ['telefonoPrefisso', "TEXT NOT NULL DEFAULT '+39'"],
];
PCR_EXTRA_COLS.forEach(([col, def]) => {
    try { db.exec(`ALTER TABLE profile_change_requests ADD COLUMN ${col} ${def}`); }
    catch { /* già presente */ }
});

const CORSI_VERSION_EXTRA_COLS = [
    ['parentId', 'TEXT'],
    ['position', 'INTEGER NOT NULL DEFAULT 0'],
];
CORSI_VERSION_EXTRA_COLS.forEach(([col, def]) => {
    try { db.exec(`ALTER TABLE corsi_versions ADD COLUMN ${col} ${def}`); }
    catch { /* già presente */ }
});

// ── Helper ────────────────────────────────────────────────────────────────────
const toBool = v => !!v;
const fromRow = (r) => r ? {
    ...r,
    mustChangePassword: toBool(r.mustChangePassword),
    domicilioComeResidenza: toBool(r.domicilioComeResidenza),
    docente: toBool(r.docente),
    visible: r.visible === undefined || r.visible === null ? true : toBool(r.visible),
    tokenVersion: Number(r.tokenVersion) || 0,
    otpFailCount: Number(r.otpFailCount) || 0,
    otpSendCount: Number(r.otpSendCount) || 0,
    username: r.username ? String(r.username) : null,
    accountType: r.accountType === 'strumento' ? 'strumento' : 'user',
    onboardingDismissed: toBool(r.onboardingDismissed),
    avatarVersion: Number(r.avatarVersion) || 0,
} : null;

function geoBlock(p, prefix, { withAddress = false } = {}) {
    const tipo = p[`${prefix}Tipo`] === 'IT' || p[`${prefix}Tipo`] === 'ESTERO' ? p[`${prefix}Tipo`] : '';
    const out = {
        [prefix]: p[prefix] || '',
        [`${prefix}Tipo`]: tipo,
        [`${prefix}Provincia`]: tipo === 'IT' ? (p[`${prefix}Provincia`] || '') : '',
        [`${prefix}Comune`]: tipo === 'IT' ? (p[`${prefix}Comune`] || '') : '',
        [`${prefix}Stato`]: tipo === 'ESTERO' ? (p[`${prefix}Stato`] || '') : '',
    };
    if (withAddress) {
        out[`${prefix}Indirizzo`] = p[`${prefix}Indirizzo`] || '';
        out[`${prefix}Civico`] = p[`${prefix}Civico`] || '';
    }
    return out;
}

/** Iniziale maiuscola, resto minuscolo (per parola; gestisce spazi e apostrofi). */
function titleCaseIt(s) {
    return String(s || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('it')
        .replace(/(^|[\s'/.-])(\S)/g, (_, a, b) => a + b.toLocaleUpperCase('it'));
}

function normalizeProvincia(sigla) {
    return String(sigla || '').trim().toUpperCase();
}

/** Normalizza stringa già composta tipo "COMUNE (pr)" → "Comune (PR)". */
function normalizePlaceLabel(s) {
    const t = String(s || '').trim().replace(/\s+/g, ' ');
    if (!t) return '';
    const m = /^(.+?)\s*\(([A-Za-z]{2})\)\s*$/.exec(t);
    if (m) return `${titleCaseIt(m[1])} (${m[2].toUpperCase()})`;
    return titleCaseIt(t);
}

/** "VIA X 12, COMUNE (bt)" → "Via X 12, Comune (BT)". */
function normalizeAddressLabel(s) {
    const t = String(s || '').trim().replace(/\s+/g, ' ');
    if (!t) return '';
    const m = /^(.+?),\s*(.+)$/.exec(t);
    if (m) return `${titleCaseIt(m[1])}, ${normalizePlaceLabel(m[2])}`;
    return normalizePlaceLabel(t);
}

function composePlaceFromParts(tipo, comune, provincia, stato, fallbackDisplay) {
    if (tipo === 'IT') {
        const c = titleCaseIt(comune);
        const p = normalizeProvincia(provincia);
        if (c) return p ? `${c} (${p})` : c;
    } else if (tipo === 'ESTERO') {
        const st = titleCaseIt(stato);
        if (st) return st;
    }
    return normalizePlaceLabel(fallbackDisplay);
}

function composeAddressFromParts(indirizzo, civico, geo) {
    const addr = [titleCaseIt(indirizzo), String(civico || '').trim()].filter(Boolean).join(' ');
    if (addr && geo) return `${addr}, ${geo}`;
    if (addr) return addr;
    return geo || '';
}

function profileDefaults(p = {}) {
    const comeRes = !!p.domicilioComeResidenza;
    const nome = titleCaseIt(p.nome);
    const cognome = titleCaseIt(p.cognome);

    const luogoRaw = geoBlock(p, 'luogoNascita');
    const luogoNascitaComune = titleCaseIt(luogoRaw.luogoNascitaComune);
    const luogoNascitaProvincia = normalizeProvincia(luogoRaw.luogoNascitaProvincia);
    const luogoNascitaStato = titleCaseIt(luogoRaw.luogoNascitaStato);
    const luogoNascita = composePlaceFromParts(
        luogoRaw.luogoNascitaTipo,
        luogoNascitaComune,
        luogoNascitaProvincia,
        luogoNascitaStato,
        luogoRaw.luogoNascita
    );

    const resRaw = geoBlock(p, 'residenza', { withAddress: true });
    const residenzaComune = titleCaseIt(resRaw.residenzaComune);
    const residenzaProvincia = normalizeProvincia(resRaw.residenzaProvincia);
    const residenzaStato = titleCaseIt(resRaw.residenzaStato);
    const residenzaIndirizzo = titleCaseIt(resRaw.residenzaIndirizzo);
    const residenzaCivico = String(resRaw.residenzaCivico || '').trim();
    const residenzaGeo = composePlaceFromParts(
        resRaw.residenzaTipo,
        residenzaComune,
        residenzaProvincia,
        residenzaStato,
        ''
    );
    const residenzaFinal = (residenzaIndirizzo || residenzaCivico || residenzaGeo)
        ? composeAddressFromParts(residenzaIndirizzo, residenzaCivico, residenzaGeo)
        : normalizeAddressLabel(resRaw.residenza);

    let domicilioBlock;
    if (comeRes) {
        domicilioBlock = {
            domicilio: residenzaFinal,
            domicilioTipo: resRaw.residenzaTipo,
            domicilioProvincia: residenzaProvincia,
            domicilioComune: residenzaComune,
            domicilioStato: residenzaStato,
            domicilioIndirizzo: residenzaIndirizzo,
            domicilioCivico: residenzaCivico,
        };
    } else {
        const domRaw = geoBlock(p, 'domicilio', { withAddress: true });
        const domicilioComune = titleCaseIt(domRaw.domicilioComune);
        const domicilioProvincia = normalizeProvincia(domRaw.domicilioProvincia);
        const domicilioStato = titleCaseIt(domRaw.domicilioStato);
        const domicilioIndirizzo = titleCaseIt(domRaw.domicilioIndirizzo);
        const domicilioCivico = String(domRaw.domicilioCivico || '').trim();
        const domicilioGeo = composePlaceFromParts(
            domRaw.domicilioTipo,
            domicilioComune,
            domicilioProvincia,
            domicilioStato,
            ''
        );
        const domicilioFinal = (domicilioIndirizzo || domicilioCivico || domicilioGeo)
            ? composeAddressFromParts(domicilioIndirizzo, domicilioCivico, domicilioGeo)
            : normalizeAddressLabel(domRaw.domicilio);
        domicilioBlock = {
            domicilio: domicilioFinal,
            domicilioTipo: domRaw.domicilioTipo,
            domicilioProvincia,
            domicilioComune,
            domicilioStato,
            domicilioIndirizzo,
            domicilioCivico,
        };
    }

    // Se coincide con la residenza, tratta come «come residenza»
    const sameAsResidenza = comeRes
        || (!!residenzaFinal && domicilioBlock.domicilio === residenzaFinal);
    if (sameAsResidenza) {
        domicilioBlock = {
            domicilio: residenzaFinal,
            domicilioTipo: resRaw.residenzaTipo,
            domicilioProvincia: residenzaProvincia,
            domicilioComune: residenzaComune,
            domicilioStato: residenzaStato,
            domicilioIndirizzo: residenzaIndirizzo,
            domicilioCivico: residenzaCivico,
        };
    }

    const telefonoPrefisso = String(p.telefonoPrefisso || '+39').trim() || '+39';
    return {
        nome,
        cognome,
        grado: p.grado || '',
        dataNascita: p.dataNascita || '',
        luogoNascita,
        luogoNascitaTipo: luogoRaw.luogoNascitaTipo,
        luogoNascitaProvincia,
        luogoNascitaComune,
        luogoNascitaStato,
        residenza: residenzaFinal,
        residenzaTipo: resRaw.residenzaTipo,
        residenzaProvincia,
        residenzaComune,
        residenzaStato,
        residenzaIndirizzo,
        residenzaCivico,
        ...domicilioBlock,
        domicilioComeResidenza: sameAsResidenza ? 1 : 0,
        telefono: p.telefono || '',
        telefonoPrefisso,
    };
}

// ── Users ─────────────────────────────────────────────────────────────────────
const Users = {
    findById:    id    => fromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(id)),
    findByEmail: email => fromRow(db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email)),
    findByUsername: username => {
        const u = String(username || '').trim();
        if (!u) return null;
        return fromRow(db.prepare('SELECT * FROM users WHERE username = ?').get(u));
    },
    /** Login con email oppure username (profili strumento). */
    findByLogin: login => {
        const s = String(login || '').trim();
        if (!s) return null;
        if (s.includes('@')) return Users.findByEmail(s);
        return Users.findByUsername(s) || Users.findByEmail(`${s}@strumento.local`);
    },
    findActive:  ()    => db.prepare('SELECT * FROM users WHERE revokedAt IS NULL').all().map(fromRow),
    insert: u => {
        const p = profileDefaults(u);
        return db.prepare(`
            INSERT INTO users (
                id,email,passwordHash,role,createdAt,mustChangePassword,
                nome,cognome,grado,dataNascita,luogoNascita,
                luogoNascitaTipo,luogoNascitaProvincia,luogoNascitaComune,luogoNascitaStato,
                residenza,residenzaTipo,residenzaProvincia,residenzaComune,residenzaStato,
                residenzaIndirizzo,residenzaCivico,
                domicilio,domicilioTipo,domicilioProvincia,domicilioComune,domicilioStato,
                domicilioIndirizzo,domicilioCivico,
                domicilioComeResidenza,telefono,telefonoPrefisso,allowedCards,docente,
                username,accountType
            ) VALUES (
                @id,@email,@passwordHash,@role,@createdAt,@mustChangePassword,
                @nome,@cognome,@grado,@dataNascita,@luogoNascita,
                @luogoNascitaTipo,@luogoNascitaProvincia,@luogoNascitaComune,@luogoNascitaStato,
                @residenza,@residenzaTipo,@residenzaProvincia,@residenzaComune,@residenzaStato,
                @residenzaIndirizzo,@residenzaCivico,
                @domicilio,@domicilioTipo,@domicilioProvincia,@domicilioComune,@domicilioStato,
                @domicilioIndirizzo,@domicilioCivico,
                @domicilioComeResidenza,@telefono,@telefonoPrefisso,@allowedCards,@docente,
                @username,@accountType
            )
        `).run({
            id: u.id,
            email: u.email,
            passwordHash: u.passwordHash,
            role: u.role || 'user',
            createdAt: u.createdAt,
            mustChangePassword: u.mustChangePassword ? 1 : 0,
            allowedCards: u.allowedCards || '',
            docente: u.docente ? 1 : 0,
            username: u.username ? String(u.username).trim() : null,
            accountType: u.accountType === 'strumento' ? 'strumento' : 'user',
            ...p,
        });
    },
    /** Riattiva un utente revocato (stesso id/email) con nuove credenziali e profilo. */
    reactivate: (id, u) => {
        const p = profileDefaults(u);
        return db.prepare(`
            UPDATE users SET
                passwordHash=@passwordHash, role=@role, createdAt=@createdAt,
                revokedAt=NULL, visible=1, hiddenAt=NULL, mustChangePassword=@mustChangePassword,
                nome=@nome, cognome=@cognome, grado=@grado,
                dataNascita=@dataNascita, luogoNascita=@luogoNascita,
                luogoNascitaTipo=@luogoNascitaTipo, luogoNascitaProvincia=@luogoNascitaProvincia,
                luogoNascitaComune=@luogoNascitaComune, luogoNascitaStato=@luogoNascitaStato,
                residenza=@residenza, residenzaTipo=@residenzaTipo, residenzaProvincia=@residenzaProvincia,
                residenzaComune=@residenzaComune, residenzaStato=@residenzaStato,
                residenzaIndirizzo=@residenzaIndirizzo, residenzaCivico=@residenzaCivico,
                domicilio=@domicilio, domicilioTipo=@domicilioTipo, domicilioProvincia=@domicilioProvincia,
                domicilioComune=@domicilioComune, domicilioStato=@domicilioStato,
                domicilioIndirizzo=@domicilioIndirizzo, domicilioCivico=@domicilioCivico,
                domicilioComeResidenza=@domicilioComeResidenza, telefono=@telefono, telefonoPrefisso=@telefonoPrefisso,
                allowedCards=@allowedCards, docente=@docente, username=@username
            WHERE id=@id
        `).run({
            id,
            passwordHash: u.passwordHash,
            role: u.role || 'user',
            createdAt: u.createdAt,
            mustChangePassword: u.mustChangePassword ? 1 : 0,
            allowedCards: u.allowedCards || '',
            docente: u.docente ? 1 : 0,
            username: u.username ? String(u.username).trim() : null,
            ...p,
        });
    },
    /** Aggiorna il ruolo e invalida i JWT precedenti (tokenVersion++), come per il cambio password. */
    updateRole: (id, role) => db.prepare('UPDATE users SET role = ?, tokenVersion = tokenVersion + 1 WHERE id = ?').run(role, id),
    updateAllowedCards: (id, allowedCards) => db.prepare('UPDATE users SET allowedCards = ? WHERE id = ?').run(allowedCards || '', id),
    updateCardOrder: (id, cardOrder) => db.prepare('UPDATE users SET cardOrder = ? WHERE id = ?').run(cardOrder || '', id),
    /** Nome utente di fantasia per il login. null = nessun alias (si entra solo con l'email). */
    setUsername: (id, username) => db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username || null, id),
    updateDocente: (id, docente) => db.prepare('UPDATE users SET docente = ? WHERE id = ?').run(docente ? 1 : 0, id),
    setOnboardingDismissed: (id, dismissed) => db.prepare('UPDATE users SET onboardingDismissed = ? WHERE id = ?').run(dismissed ? 1 : 0, id),
    /** Immagine di profilo (Buffer + mime). null = nessuna immagine. avatarVersion cresce a ogni cambio (cache lato client). */
    setAvatar: (id, buffer, mime) => db.prepare(
        'UPDATE users SET avatar = ?, avatarMime = ?, avatarVersion = avatarVersion + 1 WHERE id = ?'
    ).run(buffer || null, buffer ? String(mime || '') : '', id),
    getAvatar: (id) => {
        const r = db.prepare('SELECT avatar, avatarMime, avatarVersion FROM users WHERE id = ?').get(id);
        if (!r || !r.avatar) return null;
        return { data: r.avatar, mime: r.avatarMime || 'image/jpeg', version: Number(r.avatarVersion) || 0 };
    },
    setChatTheme: (id, theme) => db.prepare('UPDATE users SET chatTheme = ? WHERE id = ?').run(String(theme || ''), id),
    updateProfile: (id, profile) => {
        const p = profileDefaults(profile);
        return db.prepare(`
            UPDATE users SET
                nome=@nome, cognome=@cognome, grado=@grado,
                dataNascita=@dataNascita, luogoNascita=@luogoNascita,
                luogoNascitaTipo=@luogoNascitaTipo, luogoNascitaProvincia=@luogoNascitaProvincia,
                luogoNascitaComune=@luogoNascitaComune, luogoNascitaStato=@luogoNascitaStato,
                residenza=@residenza, residenzaTipo=@residenzaTipo, residenzaProvincia=@residenzaProvincia,
                residenzaComune=@residenzaComune, residenzaStato=@residenzaStato,
                residenzaIndirizzo=@residenzaIndirizzo, residenzaCivico=@residenzaCivico,
                domicilio=@domicilio, domicilioTipo=@domicilioTipo, domicilioProvincia=@domicilioProvincia,
                domicilioComune=@domicilioComune, domicilioStato=@domicilioStato,
                domicilioIndirizzo=@domicilioIndirizzo, domicilioCivico=@domicilioCivico,
                domicilioComeResidenza=@domicilioComeResidenza, telefono=@telefono, telefonoPrefisso=@telefonoPrefisso
            WHERE id=@id
        `).run({ id, ...p });
    },
    revoke: id => db.prepare("UPDATE users SET revokedAt = ?, passwordHash = '', tokenVersion = tokenVersion + 1 WHERE id = ?").run(new Date().toISOString(), id),
    /** Elimina: non visibile, credenziali revocate, sessioni invalidate. Ripristina: torna visibile (nuova password lato server). */
    setVisible: (id, visible) => {
        if (visible) {
            return db.prepare('UPDATE users SET visible = 1, hiddenAt = NULL WHERE id = ?').run(id);
        }
        return db.prepare(`
            UPDATE users SET
                visible = 0,
                hiddenAt = ?,
                passwordHash = '',
                tokenVersion = tokenVersion + 1,
                loginOtp = NULL,
                loginOtpExpiry = NULL
            WHERE id = ?
        `).run(new Date().toISOString(), id);
    },
    /** Aggiorna password e invalida tutte le sessioni JWT precedenti (tokenVersion++). */
    changePassword:(id, hash) => db.prepare('UPDATE users SET passwordHash = ?, mustChangePassword = 0, tokenVersion = tokenVersion + 1 WHERE id = ?').run(hash, id),
    /** Reset admin: nuova password, obbligo cambio, invalida sessioni JWT. */
    resetPassword:(id, hash) => db.prepare('UPDATE users SET passwordHash = ?, mustChangePassword = 1, tokenVersion = tokenVersion + 1 WHERE id = ?').run(hash, id),
    setLoginOtp: (id, hash, exp) => db.prepare('UPDATE users SET loginOtp = ?, loginOtpExpiry = ? WHERE id = ?').run(hash, exp, id),
    clearLoginOtp: id => db.prepare('UPDATE users SET loginOtp = NULL, loginOtpExpiry = NULL WHERE id = ?').run(id),
    incrementOtpFail: id => db.prepare('UPDATE users SET otpFailCount = otpFailCount + 1 WHERE id = ?').run(id),
    incrementOtpSend: id => db.prepare('UPDATE users SET otpSendCount = otpSendCount + 1 WHERE id = ?').run(id),
    setLoginLock: (id, until, reason) => {
        const why = reason || '';
        // Blocco Super Admin: invalida subito tutte le sessioni JWT aperte.
        if (why === 'admin') {
            return db.prepare(
                'UPDATE users SET loginLockedUntil = ?, loginLockedReason = ?, tokenVersion = tokenVersion + 1 WHERE id = ?'
            ).run(until, why, id);
        }
        return db.prepare(
            'UPDATE users SET loginLockedUntil = ?, loginLockedReason = ? WHERE id = ?'
        ).run(until, why, id);
    },
    clearLoginLock: id => db.prepare("UPDATE users SET loginLockedUntil = NULL, loginLockedReason = '', otpFailCount = 0, otpSendCount = 0, loginOtp = NULL, loginOtpExpiry = NULL WHERE id = ?").run(id),
};

// ── Profile Change Requests ─────────────────────────────────────────────────
const ProfileChangeRequests = {
    findPending: () => db.prepare("SELECT * FROM profile_change_requests WHERE status='pending' ORDER BY requestedAt DESC").all()
        .map(r => ({ ...r, domicilioComeResidenza: toBool(r.domicilioComeResidenza) })),
    findById: id => {
        const r = db.prepare('SELECT * FROM profile_change_requests WHERE id=?').get(id);
        return r ? { ...r, domicilioComeResidenza: toBool(r.domicilioComeResidenza) } : null;
    },
    findPendingByUser: userId => {
        const r = db.prepare("SELECT * FROM profile_change_requests WHERE userId=? AND status='pending'").get(userId);
        return r ? { ...r, domicilioComeResidenza: toBool(r.domicilioComeResidenza) } : null;
    },
    insert: r => {
        const p = profileDefaults(r);
        return db.prepare(`
            INSERT INTO profile_change_requests (
                id,userId,userEmail,nome,cognome,grado,
                dataNascita,luogoNascita,luogoNascitaTipo,luogoNascitaProvincia,luogoNascitaComune,luogoNascitaStato,
                residenza,residenzaTipo,residenzaProvincia,residenzaComune,residenzaStato,
                residenzaIndirizzo,residenzaCivico,
                domicilio,domicilioTipo,domicilioProvincia,domicilioComune,domicilioStato,
                domicilioIndirizzo,domicilioCivico,
                domicilioComeResidenza,telefono,telefonoPrefisso,
                requestedAt
            ) VALUES (
                @id,@userId,@userEmail,@nome,@cognome,@grado,
                @dataNascita,@luogoNascita,@luogoNascitaTipo,@luogoNascitaProvincia,@luogoNascitaComune,@luogoNascitaStato,
                @residenza,@residenzaTipo,@residenzaProvincia,@residenzaComune,@residenzaStato,
                @residenzaIndirizzo,@residenzaCivico,
                @domicilio,@domicilioTipo,@domicilioProvincia,@domicilioComune,@domicilioStato,
                @domicilioIndirizzo,@domicilioCivico,
                @domicilioComeResidenza,@telefono,@telefonoPrefisso,
                @requestedAt
            )
        `).run({
            id: r.id,
            userId: r.userId,
            userEmail: r.userEmail,
            requestedAt: r.requestedAt,
            ...p,
        });
    },
    approve: (id, reviewedBy) => db.prepare("UPDATE profile_change_requests SET status='approved',reviewedBy=?,reviewedAt=? WHERE id=?").run(reviewedBy, new Date().toISOString(), id),
    reject:  (id, reviewedBy) => db.prepare("UPDATE profile_change_requests SET status='rejected',reviewedBy=?,reviewedAt=? WHERE id=?").run(reviewedBy, new Date().toISOString(), id),
};

// ── Invitations ───────────────────────────────────────────────────────────────
const toInv = r => r ? { ...r, used: toBool(r.used), otpUsed: toBool(r.otpUsed), docente: toBool(r.docente) } : null;
const Invitations = {
    findByToken:      token => toInv(db.prepare('SELECT * FROM invitations WHERE token = ?').get(token)),
    findActive:       ()    => db.prepare("SELECT * FROM invitations WHERE used=0 AND expiresAt > datetime('now')").all().map(toInv),
    invalidateByEmail:email => db.prepare('UPDATE invitations SET used=1 WHERE email=? COLLATE NOCASE').run(email),
    insert: i => db.prepare(
        'INSERT INTO invitations (token,email,role,invitedBy,createdAt,expiresAt,allowedCards,docente) VALUES (@token,@email,@role,@invitedBy,@createdAt,@expiresAt,@allowedCards,@docente)'
    ).run({ allowedCards: '', ...i, docente: i.docente ? 1 : 0 }),
    setOtp:  (token, hash, exp) => db.prepare('UPDATE invitations SET otp=?,otpExpiry=?,otpUsed=0 WHERE token=?').run(hash, exp, token),
    markUsed:token => db.prepare('UPDATE invitations SET used=1,otpUsed=1 WHERE token=?').run(token),
    cancel:  token => db.prepare('UPDATE invitations SET used=1 WHERE token=?').run(token),
};

// ── Notifications ─────────────────────────────────────────────────────────────
const Notifications = {
    insert: n => db.prepare(
        'INSERT INTO notifications (id,userId,type,title,body,link,createdAt) VALUES (@id,@userId,@type,@title,@body,@link,@createdAt)'
    ).run({ body: '', link: '', ...n }),
    findForUser: (userId, limit = 40) => db.prepare(
        'SELECT * FROM notifications WHERE userId=? ORDER BY createdAt DESC LIMIT ?'
    ).all(userId, limit),
    countUnread: userId => db.prepare(
        'SELECT COUNT(*) AS c FROM notifications WHERE userId=? AND readAt IS NULL'
    ).get(userId).c,
    markRead: (id, userId) => db.prepare(
        "UPDATE notifications SET readAt=? WHERE id=? AND userId=? AND readAt IS NULL"
    ).run(new Date().toISOString(), id, userId),
    markUnread: (id, userId) => db.prepare(
        "UPDATE notifications SET readAt=NULL WHERE id=? AND userId=?"
    ).run(id, userId),
    markAllRead: userId => db.prepare(
        "UPDATE notifications SET readAt=? WHERE userId=? AND readAt IS NULL"
    ).run(new Date().toISOString(), userId),
    remove: (id, userId) => db.prepare(
        'DELETE FROM notifications WHERE id=? AND userId=?'
    ).run(id, userId),
};

const Idee = {
    insert: row => db.prepare(`
        INSERT INTO idee (id, userId, authorLabel, authorEmail, body, topicKind, topicKey, topicLabel, createdAt, deletedAt, deletedById, deletedByLabel)
        VALUES (@id, @userId, @authorLabel, @authorEmail, @body, @topicKind, @topicKey, @topicLabel, @createdAt, @deletedAt, @deletedById, @deletedByLabel)
    `).run({ deletedAt: '', deletedById: '', deletedByLabel: '', ...row }),
    get: (id) => db.prepare('SELECT * FROM idee WHERE id = ?').get(id) || null,
    findAll: () => db.prepare(
        'SELECT * FROM idee ORDER BY createdAt DESC'
    ).all(),
    /** Proposte attive (non eliminate dagli admin). */
    findActive: () => db.prepare(
        "SELECT * FROM idee WHERE IFNULL(deletedAt,'') = '' ORDER BY createdAt DESC"
    ).all(),
    /** Archivio Super Admin: proposte soft-delete. */
    findDeleted: () => db.prepare(
        "SELECT * FROM idee WHERE IFNULL(deletedAt,'') != '' ORDER BY deletedAt DESC"
    ).all(),
    findByUser: (userId) => db.prepare(
        'SELECT * FROM idee WHERE userId = ? ORDER BY createdAt DESC'
    ).all(userId),
    isReadBy: (ideaId, userId) => !!db.prepare(
        'SELECT 1 FROM idee_reads WHERE ideaId = ? AND userId = ?'
    ).get(ideaId, userId),
    readIdsForUser: (userId) => new Set(
        db.prepare('SELECT ideaId FROM idee_reads WHERE userId = ?').all(userId).map((r) => r.ideaId)
    ),
    markRead: (ideaId, userId) => db.prepare(`
        INSERT INTO idee_reads (ideaId, userId, readAt) VALUES (?, ?, ?)
        ON CONFLICT(ideaId, userId) DO UPDATE SET readAt = excluded.readAt
    `).run(ideaId, userId, new Date().toISOString()),
    markUnread: (ideaId, userId) => db.prepare(
        'DELETE FROM idee_reads WHERE ideaId = ? AND userId = ?'
    ).run(ideaId, userId),
    countUnreadForAdmin: (userId) => {
        const row = db.prepare(`
            SELECT COUNT(*) AS c FROM idee i
            WHERE IFNULL(i.deletedAt,'') = ''
              AND NOT EXISTS (
                  SELECT 1 FROM idee_reads r WHERE r.ideaId = i.id AND r.userId = ?
              )
        `).get(userId);
        return Number(row && row.c) || 0;
    },
    softDelete: (id, by) => db.prepare(`
        UPDATE idee SET deletedAt = ?, deletedById = ?, deletedByLabel = ?
        WHERE id = ? AND IFNULL(deletedAt,'') = ''
    `).run(
        new Date().toISOString(),
        (by && by.id) || '',
        (by && by.label) || '',
        id
    ).changes,
    hardDelete: (id) => {
        db.prepare('DELETE FROM idee_reads WHERE ideaId = ?').run(id);
        return db.prepare('DELETE FROM idee WHERE id = ?').run(id).changes;
    },
};

/** Non rimosso «per tutti» (resta in archivio Super Admin finché non elimina definitivamente). */
const MSG_NOT_GONE = 'IFNULL(deletedForAll, 0) = 0';
/** Messaggio visibile per @me: non eliminato dal lato di chi guarda e non rimosso per tutti. */
const MSG_VISIBLE = `((senderId = @me AND deletedForSender = 0) OR (recipientId = @me AND deletedForRecipient = 0)) AND ${MSG_NOT_GONE}`;
const MSG_WITH_PEER = '((senderId = @me AND recipientId = @peer) OR (senderId = @peer AND recipientId = @me))';

/** Allegati (immagini/video/documenti) dei messaggi: un allegato può essere condiviso da più righe (invio multiplo). */
const Attachments = {
    insert: (a) => db.prepare(`
        INSERT INTO message_attachments (id, kind, mime, name, size, width, height, data, createdAt, storagePath, ownerId)
        VALUES (@id, @kind, @mime, @name, @size, @width, @height, @data, @createdAt, @storagePath, @ownerId)
    `).run({
        name: '', size: 0, width: 0, height: 0, data: Buffer.alloc(0),
        storagePath: null, ownerId: null, ...a,
    }),
    meta: (id) => db.prepare(
        'SELECT id, kind, mime, name, size, width, height, createdAt, storagePath, ownerId FROM message_attachments WHERE id = ?'
    ).get(id) || null,
    get: (id) => db.prepare('SELECT * FROM message_attachments WHERE id = ?').get(id) || null,
    /** True se @me è mittente o destinatario (1:1) o membro del gruppo (e non ha nascosto il messaggio). */
    canAccess: (id, userId) => {
        if (db.prepare(`SELECT 1 FROM messages WHERE attachmentId = @att AND IFNULL(groupId,'') = '' AND ${MSG_VISIBLE} LIMIT 1`).get({ att: id, me: userId })) return true;
        return !!db.prepare(`
            SELECT 1 FROM messages m
            JOIN message_group_members gm ON gm.groupId = m.groupId AND gm.userId = @me
            WHERE m.attachmentId = @att AND IFNULL(m.groupId,'') != ''
              AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.messageId = m.id AND h.userId = @me)
            LIMIT 1
        `).get({ att: id, me: userId });
    },
    /** Elimina l'allegato quando nessun messaggio lo referenzia più. */
    pruneIfOrphan: (id) => {
        if (!id) return;
        const used = db.prepare('SELECT COUNT(*) AS c FROM messages WHERE attachmentId = ?').get(id).c;
        if (!used) Attachments.deleteHard(id);
    },
    /** Byte totali degli allegati Criptogram (foto/video/documenti). */
    totalBytes: () => Number(db.prepare(`
        SELECT IFNULL(SUM(
            CASE WHEN IFNULL(size, 0) > 0 THEN size ELSE IFNULL(LENGTH(data), 0) END
        ), 0) AS b FROM message_attachments
    `).get().b) || 0,
    count: () => db.prepare('SELECT COUNT(*) AS c FROM message_attachments').get().c,
    listMeta: (limit = 200) => db.prepare(`
        SELECT id, kind, mime, name, size, width, height, createdAt, storagePath,
               CASE WHEN IFNULL(size, 0) > 0 THEN size ELSE IFNULL(LENGTH(data), 0) END AS bytes
        FROM message_attachments
        ORDER BY createdAt DESC
        LIMIT ?
    `).all(limit),
    /** Elimina allegato e azzera i riferimenti nei messaggi (resto testo/didascalia). */
    deleteHard: (id) => {
        const row = Attachments.get(id);
        db.prepare('UPDATE messages SET attachmentId = NULL WHERE attachmentId = ?').run(id);
        const changes = db.prepare('DELETE FROM message_attachments WHERE id = ?').run(id).changes;
        if (changes && row && row.storagePath) {
            try {
                const full = path.join(DATA_DIR, 'attachments', path.basename(String(row.storagePath)));
                if (fs.existsSync(full)) fs.unlinkSync(full);
            } catch { /* ignore */ }
        }
        return changes;
    },
};

const StickerFavorites = {
    list: (userId) => db.prepare(
        'SELECT sticker, createdAt FROM message_sticker_favorites WHERE userId = ? ORDER BY createdAt DESC'
    ).all(userId).map((r) => r.sticker),
    add: (userId, sticker) => db.prepare(`
        INSERT OR IGNORE INTO message_sticker_favorites (userId, sticker, createdAt)
        VALUES (?, ?, ?)
    `).run(userId, sticker, new Date().toISOString()),
    remove: (userId, sticker) => db.prepare(
        'DELETE FROM message_sticker_favorites WHERE userId = ? AND sticker = ?'
    ).run(userId, sticker),
    has: (userId, sticker) => !!db.prepare(
        'SELECT 1 FROM message_sticker_favorites WHERE userId = ? AND sticker = ?'
    ).get(userId, sticker),
};

const AppMeta = {
    get: (key) => {
        const r = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
        return r ? String(r.value || '') : '';
    },
    set: (key, value) => db.prepare(`
        INSERT INTO app_meta (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value ?? '')),
};

const MSG_SELECT = `
    SELECT m.*, a.mime AS attMime, a.name AS attName, a.size AS attSize, a.width AS attWidth, a.height AS attHeight, a.kind AS attKind
    FROM messages m LEFT JOIN message_attachments a ON a.id = m.attachmentId
`;
const MSG_DIRECT = "IFNULL(m.groupId,'') = ''";
const MSG_GROUP_VISIBLE = `
    IFNULL(m.groupId,'') != ''
    AND IFNULL(m.deletedForAll, 0) = 0
    AND EXISTS (SELECT 1 FROM message_group_members gm WHERE gm.groupId = m.groupId AND gm.userId = @me)
    AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.messageId = m.id AND h.userId = @me)
`;

const Groups = {
    create: ({ id, name, createdBy, createdAt, memberIds }) => {
        db.transaction(() => {
            db.prepare(`
                INSERT INTO message_groups (id, name, createdBy, createdAt)
                VALUES (@id, @name, @createdBy, @createdAt)
            `).run({ id, name, createdBy, createdAt });
            const add = db.prepare(`
                INSERT INTO message_group_members (groupId, userId, role, joinedAt)
                VALUES (?, ?, ?, ?)
            `);
            add.run(id, createdBy, 'admin', createdAt);
            (memberIds || []).forEach((uid) => {
                if (uid && uid !== createdBy) add.run(id, uid, 'member', createdAt);
            });
        })();
    },
    findById: (id) => db.prepare('SELECT * FROM message_groups WHERE id = ?').get(id) || null,
    isMember: (groupId, userId) => !!db.prepare(
        'SELECT 1 FROM message_group_members WHERE groupId = ? AND userId = ?'
    ).get(groupId, userId),
    isAdmin: (groupId, userId) => {
        const r = db.prepare('SELECT role FROM message_group_members WHERE groupId = ? AND userId = ?').get(groupId, userId);
        return !!(r && r.role === 'admin');
    },
    members: (groupId) => db.prepare(
        'SELECT userId, role, joinedAt FROM message_group_members WHERE groupId = ? ORDER BY role DESC, joinedAt ASC'
    ).all(groupId),
    adminCount: (groupId) => db.prepare(
        "SELECT COUNT(*) AS c FROM message_group_members WHERE groupId = ? AND role = 'admin'"
    ).get(groupId).c,
    setRole: (groupId, userId, role) => db.prepare(
        'UPDATE message_group_members SET role = ? WHERE groupId = ? AND userId = ?'
    ).run(role === 'admin' ? 'admin' : 'member', groupId, userId),
    addMember: (groupId, userId, role = 'member') => {
        if (!groupId || !userId) return false;
        if (Groups.isMember(groupId, userId)) return false;
        db.prepare(`
            INSERT INTO message_group_members (groupId, userId, role, joinedAt)
            VALUES (?, ?, ?, ?)
        `).run(groupId, userId, role === 'admin' ? 'admin' : 'member', new Date().toISOString());
        return true;
    },
    removeMember: (groupId, userId) => {
        if (!groupId || !userId) return false;
        if (!Groups.isMember(groupId, userId)) return false;
        if (Groups.isAdmin(groupId, userId) && Groups.adminCount(groupId) <= 1) return false;
        db.prepare('DELETE FROM message_group_members WHERE groupId = ? AND userId = ?').run(groupId, userId);
        return true;
    },
    /** Elimina definitivamente gruppo, membri e messaggi (Super Admin). */
    deleteHard: (groupId) => {
        if (!groupId) return { ok: false, messages: 0 };
        return db.transaction(() => {
            const messages = Messages.adminDeleteGroupMessages(groupId);
            db.prepare('DELETE FROM message_group_members WHERE groupId = ?').run(groupId);
            db.prepare('DELETE FROM message_groups WHERE id = ?').run(groupId);
            return { ok: true, messages };
        })();
    },
    /** Uscita volontaria: se unico admin promuove un altro; se unico membro chiude il gruppo. */
    leave: (groupId, userId) => {
        if (!groupId || !userId || !Groups.isMember(groupId, userId)) {
            return { ok: false, error: 'Non fai parte di questo gruppo.' };
        }
        return db.transaction(() => {
            const count = Groups.memberCount(groupId);
            if (count <= 1) {
                db.prepare('DELETE FROM message_group_members WHERE groupId = ?').run(groupId);
                db.prepare('DELETE FROM message_groups WHERE id = ?').run(groupId);
                return { ok: true, dissolved: true };
            }
            if (Groups.isAdmin(groupId, userId) && Groups.adminCount(groupId) <= 1) {
                const next = db.prepare(`
                    SELECT userId FROM message_group_members
                    WHERE groupId = ? AND userId != ?
                    ORDER BY joinedAt ASC LIMIT 1
                `).get(groupId, userId);
                if (!next) return { ok: false, error: 'Uscita non riuscita.' };
                Groups.setRole(groupId, next.userId, 'admin');
            }
            db.prepare('DELETE FROM message_group_members WHERE groupId = ? AND userId = ?').run(groupId, userId);
            return { ok: true, dissolved: false };
        })();
    },
    memberCount: (groupId) => db.prepare(
        'SELECT COUNT(*) AS c FROM message_group_members WHERE groupId = ?'
    ).get(groupId).c,
    setName: (id, name) => db.prepare('UPDATE message_groups SET name = ? WHERE id = ?').run(name, id),
    setAvatar: (id, buffer, mime) => db.prepare(
        'UPDATE message_groups SET avatar = ?, avatarMime = ?, avatarVersion = avatarVersion + 1 WHERE id = ?'
    ).run(buffer || null, buffer ? String(mime || '') : '', id),
    getAvatar: (id) => {
        const r = db.prepare('SELECT avatar, avatarMime, avatarVersion FROM message_groups WHERE id = ?').get(id);
        if (!r || !r.avatar) return null;
        return { data: r.avatar, mime: r.avatarMime || 'image/jpeg', version: Number(r.avatarVersion) || 0 };
    },
    forUser: (userId) => db.prepare(`
        SELECT g.id, g.name, g.createdBy, g.createdAt, g.avatarVersion,
               COALESCE((
                   SELECT MAX(m.createdAt) FROM messages m
                   WHERE m.groupId = g.id
                     AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.messageId = m.id AND h.userId = @me)
               ), g.createdAt) AS lastAt
        FROM message_groups g
        JOIN message_group_members gm ON gm.groupId = g.id AND gm.userId = @me
        ORDER BY lastAt DESC
    `).all({ me: userId }),
    /** Tutti i gruppi (vista Super Admin). */
    listAll: () => db.prepare(`
        SELECT g.id, g.name, g.createdBy, g.createdAt, g.avatarVersion,
               (SELECT COUNT(*) FROM message_group_members gm WHERE gm.groupId = g.id) AS memberCount,
               COALESCE((SELECT MAX(m.createdAt) FROM messages m WHERE m.groupId = g.id), g.createdAt) AS lastAt
        FROM message_groups g
        ORDER BY lastAt DESC
    `).all(),
};

const Messages = {
    insertMany: (rows) => {
        const stmt = db.prepare(`
            INSERT INTO messages (id, senderId, senderLabel, recipientId, body, createdAt, kind, attachmentId, groupId)
            VALUES (@id, @senderId, @senderLabel, @recipientId, @body, @createdAt, @kind, @attachmentId, @groupId)
        `);
        db.transaction((list) => {
            list.forEach((row) => stmt.run({ kind: 'text', attachmentId: null, groupId: null, ...row }));
        })(rows);
    },
    findById: (id) => db.prepare('SELECT * FROM messages WHERE id = ?').get(id) || null,
    isParty: (msg, userId) => {
        if (!msg) return false;
        if (msg.groupId) return Groups.isMember(msg.groupId, userId);
        return msg.senderId === userId || msg.recipientId === userId;
    },
    /** Peer 1:1 con cui esistono messaggi, dal più recente. */
    peersFor: (userId) => db.prepare(`
        SELECT peerId, MAX(createdAt) AS lastAt FROM (
            SELECT CASE WHEN senderId = @me THEN recipientId ELSE senderId END AS peerId, createdAt
            FROM messages m WHERE ${MSG_VISIBLE} AND ${MSG_DIRECT}
        ) GROUP BY peerId ORDER BY lastAt DESC
    `).all({ me: userId }),
    lastBetween: (userId, peerId) => db.prepare(`
        ${MSG_SELECT} WHERE ${MSG_WITH_PEER} AND ${MSG_VISIBLE} AND ${MSG_DIRECT}
        ORDER BY m.createdAt DESC LIMIT 1
    `).get({ me: userId, peer: peerId }) || null,
    conversation: (userId, peerId, limit = 300) => db.prepare(`
        ${MSG_SELECT} WHERE ${MSG_WITH_PEER} AND ${MSG_VISIBLE} AND ${MSG_DIRECT}
        ORDER BY m.createdAt ASC LIMIT @limit
    `).all({ me: userId, peer: peerId, limit }),
    lastInGroup: (userId, groupId) => db.prepare(`
        ${MSG_SELECT} WHERE m.groupId = @group AND ${MSG_GROUP_VISIBLE}
        ORDER BY m.createdAt DESC LIMIT 1
    `).get({ me: userId, group: groupId }) || null,
    conversationGroup: (userId, groupId, limit = 300) => db.prepare(`
        ${MSG_SELECT} WHERE m.groupId = @group AND ${MSG_GROUP_VISIBLE}
        ORDER BY m.createdAt ASC LIMIT @limit
    `).all({ me: userId, group: groupId, limit }),
    countUnreadFrom: (userId, peerId) => db.prepare(`
        SELECT COUNT(*) AS c FROM messages
        WHERE recipientId = @me AND senderId = @peer AND readAt IS NULL AND deletedForRecipient = 0 AND IFNULL(groupId,'') = ''
    `).get({ me: userId, peer: peerId }).c,
    firstUnreadFrom: (userId, peerId) => {
        const row = db.prepare(`
            SELECT id FROM messages
            WHERE recipientId = @me AND senderId = @peer AND readAt IS NULL AND deletedForRecipient = 0 AND IFNULL(groupId,'') = ''
            ORDER BY createdAt ASC LIMIT 1
        `).get({ me: userId, peer: peerId });
        return row ? row.id : null;
    },
    countUnreadGroup: (userId, groupId) => db.prepare(`
        SELECT COUNT(*) AS c FROM messages m
        WHERE m.groupId = @group AND m.senderId != @me AND ${MSG_GROUP_VISIBLE}
          AND NOT EXISTS (SELECT 1 FROM message_reads r WHERE r.messageId = m.id AND r.userId = @me)
    `).get({ me: userId, group: groupId }).c,
    firstUnreadGroup: (userId, groupId) => {
        const row = db.prepare(`
            SELECT m.id FROM messages m
            WHERE m.groupId = @group AND m.senderId != @me AND ${MSG_GROUP_VISIBLE}
              AND NOT EXISTS (SELECT 1 FROM message_reads r WHERE r.messageId = m.id AND r.userId = @me)
            ORDER BY m.createdAt ASC LIMIT 1
        `).get({ me: userId, group: groupId });
        return row ? row.id : null;
    },
    markReadFrom: (userId, peerId) => db.prepare(
        'UPDATE messages SET readAt = ? WHERE recipientId = ? AND senderId = ? AND readAt IS NULL AND IFNULL(groupId,\'\') = \'\''
    ).run(new Date().toISOString(), userId, peerId),
    markReadGroup: (userId, groupId) => {
        const now = new Date().toISOString();
        const rows = db.prepare(`
            SELECT m.id FROM messages m
            WHERE m.groupId = @group AND m.senderId != @me AND ${MSG_GROUP_VISIBLE}
              AND NOT EXISTS (SELECT 1 FROM message_reads r WHERE r.messageId = m.id AND r.userId = @me)
        `).all({ me: userId, group: groupId });
        const ins = db.prepare('INSERT OR IGNORE INTO message_reads (messageId, userId, readAt) VALUES (?, ?, ?)');
        db.transaction(() => { rows.forEach((r) => ins.run(r.id, userId, now)); })();
    },
    countUnread: (userId) => db.prepare(
        "SELECT COUNT(*) AS c FROM messages WHERE recipientId = ? AND readAt IS NULL AND deletedForRecipient = 0 AND IFNULL(groupId,'') = ''"
    ).get(userId).c,
    countUnreadGroups: (userId) => db.prepare(`
        SELECT COUNT(*) AS c FROM messages m
        WHERE ${MSG_GROUP_VISIBLE} AND m.senderId != @me
          AND NOT EXISTS (SELECT 1 FROM message_reads r WHERE r.messageId = m.id AND r.userId = @me)
    `).get({ me: userId }).c,
    countUnreadAll: (userId) => Messages.countUnread(userId) + Messages.countUnreadGroups(userId),
    markAllRead: (userId) => db.prepare(
        "UPDATE messages SET readAt = ? WHERE recipientId = ? AND readAt IS NULL AND IFNULL(groupId,'') = ''"
    ).run(new Date().toISOString(), userId),
    /** Nasconde il messaggio solo a chi lo elimina (resta in archivio Super Admin). */
    deleteForUser: (id, userId) => {
        const before = Messages.findById(id);
        if (!before) return 0;
        if (before.groupId) {
            db.prepare('INSERT OR IGNORE INTO message_hides (messageId, userId) VALUES (?, ?)').run(id, userId);
            return 1;
        }
        const r1 = db.prepare('UPDATE messages SET deletedForSender = 1 WHERE id = ? AND senderId = ?').run(id, userId);
        const r2 = db.prepare('UPDATE messages SET deletedForRecipient = 1 WHERE id = ? AND recipientId = ?').run(id, userId);
        // Non cancellare fisicamente: solo il Super Admin elimina definitivamente.
        return (r1.changes || 0) + (r2.changes || 0);
    },
    /** Cancella la chat 1:1 solo per @userId (l'altro continua a vederla; archivio SA resta). */
    clearDirect: (userId, peerId) => {
        if (!userId || !peerId) return 0;
        const rows = db.prepare(`
            SELECT id FROM messages
            WHERE IFNULL(groupId,'') = ''
              AND IFNULL(deletedForAll, 0) = 0
              AND ((senderId = @me AND recipientId = @peer) OR (senderId = @peer AND recipientId = @me))
              AND ((senderId = @me AND deletedForSender = 0) OR (recipientId = @me AND deletedForRecipient = 0))
        `).all({ me: userId, peer: peerId });
        let n = 0;
        db.transaction(() => {
            rows.forEach((r) => { n += Messages.deleteForUser(r.id, userId) ? 1 : 0; });
        })();
        return n;
    },
    /**
     * Rimuove il messaggio per tutti gli utenti (soft-delete / archivio).
     * Solo il mittente; la riga resta per il Super Admin finché non usa deleteHard.
     */
    deleteForAll: (id, senderId) => {
        const now = new Date().toISOString();
        return db.prepare(`
            UPDATE messages
            SET deletedForAll = 1,
                deletedForAllAt = ?,
                deletedForSender = 1,
                deletedForRecipient = 1
            WHERE id = ? AND senderId = ? AND IFNULL(deletedForAll, 0) = 0
        `).run(now, id, senderId).changes;
    },
    /** Eliminazione forzata (Super Admin): qualunque messaggio. */
    deleteHard: (id) => {
        const before = Messages.findById(id);
        const changes = db.prepare('DELETE FROM messages WHERE id = ?').run(id).changes;
        if (changes) {
            db.prepare('DELETE FROM message_hides WHERE messageId = ?').run(id);
            db.prepare('DELETE FROM message_reads WHERE messageId = ?').run(id);
        }
        if (before) Attachments.pruneIfOrphan(before.attachmentId);
        return changes;
    },
    countAll: () => db.prepare('SELECT COUNT(*) AS c FROM messages').get().c,
    /**
     * Spazio per conversazione (Super Admin file manager).
     * Byte conteggiati una sola volta per allegato distinto nella chat.
     */
    adminStorageByChat: () => {
        const rows = db.prepare(`
            SELECT m.id, m.senderId, m.recipientId, m.groupId, m.attachmentId, m.createdAt,
                   CASE WHEN IFNULL(a.size, 0) > 0 THEN a.size ELSE IFNULL(LENGTH(a.data), 0) END AS bytes,
                   a.kind AS attKind, a.name AS attName, a.createdAt AS attCreatedAt
            FROM messages m
            LEFT JOIN message_attachments a ON a.id = m.attachmentId
        `).all();
        const map = new Map();
        rows.forEach((r) => {
            let key;
            let entry;
            if (r.groupId) {
                key = 'g:' + r.groupId;
                entry = map.get(key) || {
                    type: 'group',
                    groupId: r.groupId,
                    peerA: '',
                    peerB: '',
                    messages: 0,
                    lastAt: '',
                    attIds: new Set(),
                    bytes: 0,
                    files: [],
                };
            } else if (r.recipientId) {
                const peerA = r.senderId < r.recipientId ? r.senderId : r.recipientId;
                const peerB = r.senderId < r.recipientId ? r.recipientId : r.senderId;
                key = 'd:' + peerA + ':' + peerB;
                entry = map.get(key) || {
                    type: 'direct',
                    groupId: '',
                    peerA,
                    peerB,
                    messages: 0,
                    lastAt: '',
                    attIds: new Set(),
                    bytes: 0,
                    files: [],
                };
            } else {
                return;
            }
            entry.messages += 1;
            if (String(r.createdAt || '') > String(entry.lastAt || '')) entry.lastAt = r.createdAt || '';
            if (r.attachmentId && !entry.attIds.has(r.attachmentId)) {
                entry.attIds.add(r.attachmentId);
                const b = Number(r.bytes) || 0;
                entry.bytes += b;
                entry.files.push({
                    id: r.attachmentId,
                    kind: r.attKind || 'image',
                    name: r.attName || '',
                    bytes: b,
                    createdAt: r.attCreatedAt || r.createdAt || '',
                });
            }
            map.set(key, entry);
        });
        return [...map.values()].map((e) => ({
            type: e.type,
            groupId: e.groupId || '',
            peerA: e.peerA || '',
            peerB: e.peerB || '',
            peerId: e.type === 'group' ? e.groupId : (e.peerA + ':' + e.peerB),
            messages: e.messages,
            attachments: e.attIds.size,
            bytes: e.bytes,
            lastAt: e.lastAt,
            files: e.files.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
        }));
    },
    /** Coppie 1:1 esistenti (vista Super Admin, ignora soft-delete). */
    adminPeers: () => db.prepare(`
        SELECT peerA, peerB, MAX(createdAt) AS lastAt FROM (
            SELECT
                CASE WHEN senderId < recipientId THEN senderId ELSE recipientId END AS peerA,
                CASE WHEN senderId < recipientId THEN recipientId ELSE senderId END AS peerB,
                createdAt
            FROM messages
            WHERE IFNULL(groupId,'') = '' AND recipientId != ''
        ) GROUP BY peerA, peerB ORDER BY lastAt DESC
    `).all(),
    adminConversation: (userA, userB, limit = 500) => db.prepare(`
        ${MSG_SELECT}
        WHERE ${MSG_DIRECT}
          AND ((m.senderId = @a AND m.recipientId = @b) OR (m.senderId = @b AND m.recipientId = @a))
        ORDER BY m.createdAt ASC LIMIT @limit
    `).all({ a: userA, b: userB, limit }),
    adminConversationGroup: (groupId, limit = 500) => db.prepare(`
        ${MSG_SELECT} WHERE m.groupId = @group
        ORDER BY m.createdAt ASC LIMIT @limit
    `).all({ group: groupId, limit }),
    adminLastBetween: (userA, userB) => db.prepare(`
        ${MSG_SELECT}
        WHERE ${MSG_DIRECT}
          AND ((m.senderId = @a AND m.recipientId = @b) OR (m.senderId = @b AND m.recipientId = @a))
        ORDER BY m.createdAt DESC LIMIT 1
    `).get({ a: userA, b: userB }) || null,
    adminLastInGroup: (groupId) => db.prepare(`
        ${MSG_SELECT} WHERE m.groupId = @group
        ORDER BY m.createdAt DESC LIMIT 1
    `).get({ group: groupId }) || null,
    /** Elimina definitivamente tutta la chat 1:1 (vista Super Admin). */
    adminDeleteDirect: (userA, userB) => {
        if (!userA || !userB || userA === userB) return 0;
        const rows = db.prepare(`
            SELECT id, attachmentId FROM messages
            WHERE IFNULL(groupId,'') = ''
              AND ((senderId = @a AND recipientId = @b) OR (senderId = @b AND recipientId = @a))
        `).all({ a: userA, b: userB });
        return db.transaction(() => {
            let n = 0;
            rows.forEach((r) => {
                n += Messages.deleteHard(r.id) ? 1 : 0;
            });
            return n;
        })();
    },
    /** Elimina definitivamente tutti i messaggi di un gruppo. */
    adminDeleteGroupMessages: (groupId) => {
        if (!groupId) return 0;
        const rows = db.prepare(
            'SELECT id FROM messages WHERE groupId = ?'
        ).all(groupId);
        return db.transaction(() => {
            let n = 0;
            rows.forEach((r) => { n += Messages.deleteHard(r.id) ? 1 : 0; });
            return n;
        })();
    },
};

// ── Password resets (self-service) ────────────────────────────────────────────
const PasswordResets = {
    invalidateForUser: userId => db.prepare(
        'UPDATE password_resets SET used = 1 WHERE userId = ? AND used = 0'
    ).run(userId),
    create: ({ token, userId, email, createdAt, expiresAt }) => db.prepare(`
        INSERT INTO password_resets (token, userId, email, createdAt, expiresAt, used)
        VALUES (?, ?, ?, ?, ?, 0)
    `).run(token, userId, email, createdAt, expiresAt),
    findByToken: token => db.prepare(
        'SELECT * FROM password_resets WHERE token = ?'
    ).get(token) || null,
    markUsed: token => db.prepare(
        'UPDATE password_resets SET used = 1 WHERE token = ?'
    ).run(token),
};

// ── Corsi versions (storico Markdown) ─────────────────────────────────────────
const CorsiVersions = {
    insert: v => db.prepare(`
        INSERT INTO corsi_versions (
            id, itemId, title, kind, content, action, editedById, editedByEmail, createdAt,
            parentId, position
        ) VALUES (
            @id, @itemId, @title, @kind, @content, @action, @editedById, @editedByEmail, @createdAt,
            @parentId, @position
        )
    `).run({
        title: '',
        kind: 'post',
        content: '',
        action: 'update',
        editedById: '',
        editedByEmail: '',
        parentId: null,
        position: 0,
        ...v,
    }),
    list: ({ itemId, limit = 500 } = {}) => {
        const lim = Math.min(Math.max(Number(limit) || 500, 1), 1000);
        if (itemId) {
            return db.prepare(`
                SELECT id, itemId, title, kind, action, editedById, editedByEmail, createdAt,
                       length(content) AS contentLength
                FROM corsi_versions
                WHERE itemId = ?
                ORDER BY createdAt DESC
                LIMIT ?
            `).all(itemId, lim);
        }
        return db.prepare(`
            SELECT id, itemId, title, kind, action, editedById, editedByEmail, createdAt,
                   length(content) AS contentLength
            FROM corsi_versions
            ORDER BY createdAt DESC
            LIMIT ?
        `).all(lim);
    },
    findById: id => db.prepare('SELECT * FROM corsi_versions WHERE id = ?').get(id) || null,
    remove: id => db.prepare('DELETE FROM corsi_versions WHERE id = ?').run(id),
    removeMany: (ids) => {
        const list = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
        if (!list.length) return 0;
        const stmt = db.prepare('DELETE FROM corsi_versions WHERE id = ?');
        const tx = db.transaction((rows) => {
            let n = 0;
            for (const id of rows) n += stmt.run(id).changes;
            return n;
        });
        return tx(list);
    },
};

// ── Corsi items (albero e versione corrente dei contenuti) ────────────────────
const CorsiItems = {
    count: () => db.prepare('SELECT COUNT(*) AS c FROM corsi_items').get().c,
    all: () => db.prepare('SELECT * FROM corsi_items ORDER BY position, createdAt').all(),
    findById: id => db.prepare('SELECT * FROM corsi_items WHERE id = ?').get(id) || null,
    exists: id => !!db.prepare('SELECT 1 FROM corsi_items WHERE id = ?').get(id),
    childrenOf: parentId => db.prepare(
        'SELECT * FROM corsi_items WHERE parentId IS ? ORDER BY position, createdAt'
    ).all(parentId || null),
    /** Prima posizione libera tra i figli di parentId (NULL = radice). */
    nextPosition: parentId => {
        const row = db.prepare('SELECT MAX(position) AS m FROM corsi_items WHERE parentId IS ?').get(parentId || null);
        return (row && row.m !== null ? Number(row.m) : -1) + 1;
    },
    insert: item => db.prepare(`
        INSERT INTO corsi_items (
            id, parentId, position, type, title, content, courseDate,
            createdAt, updatedAt, createdById, updatedById
        ) VALUES (
            @id, @parentId, @position, @type, @title, @content, @courseDate,
            @createdAt, @updatedAt, @createdById, @updatedById
        )
    `).run({
        parentId: null,
        position: 0,
        type: 'section',
        title: '',
        content: '',
        courseDate: '',
        createdById: null,
        updatedById: null,
        ...item,
    }),
    update: (id, patch) => db.prepare(`
        UPDATE corsi_items SET
            type = @type, title = @title, content = @content, courseDate = @courseDate,
            updatedAt = @updatedAt, updatedById = @updatedById
        WHERE id = @id
    `).run({ id, courseDate: '', updatedById: null, ...patch }),
    move: (id, parentId, position) => db.prepare(
        'UPDATE corsi_items SET parentId = ?, position = ? WHERE id = ?'
    ).run(parentId || null, position, id),
    /** Imposta position 0..n-1 per tutti i figli di parentId (NULL = radice). */
    reorderSiblings: (parentId, orderedIds) => {
        const stmt = db.prepare(
            'UPDATE corsi_items SET position = ? WHERE id = ? AND parentId IS ?'
        );
        const tx = db.transaction((ids) => {
            ids.forEach((id, i) => stmt.run(i, id, parentId || null));
        });
        return tx(orderedIds);
    },
    /** Modifiche recenti (per avvisi live in gestione contenuti). */
    changesSince: (since, exceptUserId) => db.prepare(`
        SELECT id, title, updatedAt, updatedById FROM corsi_items
        WHERE updatedAt > ? AND updatedById IS NOT NULL AND updatedById != '' AND updatedById != ?
        ORDER BY updatedAt DESC
        LIMIT 30
    `).all(since, exceptUserId || ''),
    /** Elimina il nodo; i discendenti seguono via ON DELETE CASCADE. */
    remove: id => db.prepare('DELETE FROM corsi_items WHERE id = ?').run(id),
    /** Esegue fn in una transazione: o passa tutto, o non passa niente. */
    tx: fn => db.transaction(fn),
};

// ── LA BIBBIA 3.1 (contatti exchange) ───────────────────────────────────────
const BibbiaExchanges = {
    all: () => db.prepare('SELECT * FROM bibbia_exchanges ORDER BY sortOrder ASC, name COLLATE NOCASE ASC').all(),
    findById: id => db.prepare('SELECT * FROM bibbia_exchanges WHERE id = ?').get(id) || null,
    findByName: name => db.prepare('SELECT * FROM bibbia_exchanges WHERE name = ? COLLATE NOCASE').get(name) || null,
    count: () => db.prepare('SELECT COUNT(*) AS c FROM bibbia_exchanges').get().c,
    insert: r => db.prepare(`
        INSERT INTO bibbia_exchanges (
            id, name, website, requestInfo, notes, logoKey, sortOrder,
            createdAt, updatedAt, createdById, updatedById
        ) VALUES (
            @id, @name, @website, @requestInfo, @notes, @logoKey, @sortOrder,
            @createdAt, @updatedAt, @createdById, @updatedById
        )
    `).run(r),
    update: (id, patch) => db.prepare(`
        UPDATE bibbia_exchanges SET
            name = @name, website = @website, requestInfo = @requestInfo, notes = @notes,
            logoKey = @logoKey, sortOrder = @sortOrder, updatedAt = @updatedAt, updatedById = @updatedById
        WHERE id = @id
    `).run({ id, ...patch }),
    remove: id => db.prepare('DELETE FROM bibbia_exchanges WHERE id = ?').run(id),
    tx: fn => db.transaction(fn),
};

const BibbiaContacts = {
    byExchange: exchangeId => db.prepare(
        'SELECT * FROM bibbia_contacts WHERE exchangeId = ? ORDER BY sortOrder ASC, name COLLATE NOCASE ASC'
    ).all(exchangeId),
    findById: id => db.prepare('SELECT * FROM bibbia_contacts WHERE id = ?').get(id) || null,
    insert: r => db.prepare(`
        INSERT INTO bibbia_contacts (
            id, exchangeId, roleLabel, name, email, pec, phone, notes, sortOrder,
            createdAt, updatedAt, createdById, updatedById
        ) VALUES (
            @id, @exchangeId, @roleLabel, @name, @email, @pec, @phone, @notes, @sortOrder,
            @createdAt, @updatedAt, @createdById, @updatedById
        )
    `).run(r),
    update: (id, patch) => db.prepare(`
        UPDATE bibbia_contacts SET
            roleLabel = @roleLabel, name = @name, email = @email, pec = @pec,
            phone = @phone, notes = @notes, sortOrder = @sortOrder,
            updatedAt = @updatedAt, updatedById = @updatedById
        WHERE id = @id
    `).run({ id, ...patch }),
    remove: id => db.prepare('DELETE FROM bibbia_contacts WHERE id = ?').run(id),
};

const BibbiaChangeRequests = {
    findPending: () => db.prepare(
        "SELECT * FROM bibbia_change_requests WHERE status = 'pending' ORDER BY requestedAt DESC"
    ).all(),
    findById: id => db.prepare('SELECT * FROM bibbia_change_requests WHERE id = ?').get(id) || null,
    findPendingForEntity: (entityType, entityId, action) => db.prepare(`
        SELECT * FROM bibbia_change_requests
        WHERE entityType = ? AND entityId = ? AND action = ? AND status = 'pending'
        LIMIT 1
    `).get(entityType, entityId, action) || null,
    insert: r => db.prepare(`
        INSERT INTO bibbia_change_requests (
            id, entityType, entityId, action, payload, reason,
            requestedById, requestedByEmail, requestedAt
        ) VALUES (
            @id, @entityType, @entityId, @action, @payload, @reason,
            @requestedById, @requestedByEmail, @requestedAt
        )
    `).run(r),
    approve: (id, byEmail) => db.prepare(`
        UPDATE bibbia_change_requests SET status = 'approved', reviewedByEmail = ?, reviewedAt = ? WHERE id = ?
    `).run(byEmail, new Date().toISOString(), id),
    reject: (id, byEmail) => db.prepare(`
        UPDATE bibbia_change_requests SET status = 'rejected', reviewedByEmail = ?, reviewedAt = ? WHERE id = ?
    `).run(byEmail, new Date().toISOString(), id),
};

// ── Backup periodico portal.db ───────────────────────────────────────────────
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, 'backups');
const BACKUP_KEEP = Math.max(1, parseInt(process.env.BACKUP_KEEP || '14', 10) || 14);
const BACKUP_INTERVAL_MS = Math.max(
    60 * 1000,
    parseInt(process.env.BACKUP_INTERVAL_MS || String(24 * 60 * 60 * 1000), 10) || (24 * 60 * 60 * 1000)
);

function backupStamp(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function pruneBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return;
    const files = fs.readdirSync(BACKUP_DIR)
        .filter((f) => /^portal-\d{8}-\d{6}\.db$/i.test(f))
        .map((f) => ({
            name: f,
            full: path.join(BACKUP_DIR, f),
            mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);
    files.slice(BACKUP_KEEP).forEach((f) => {
        try {
            fs.unlinkSync(f.full);
            console.log(`[DB] Backup rimosso (retention ${BACKUP_KEEP}): ${f.name}`);
        } catch (e) {
            console.warn(`[DB] Impossibile rimuovere backup ${f.name}:`, e.message);
        }
    });
}

/** Copia coerente di portal.db tramite API backup di SQLite. */
function backupDatabase() {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const name = `portal-${backupStamp()}.db`;
    const dest = path.join(BACKUP_DIR, name);
    return db.backup(dest)
        .then(() => {
            try {
                const bytes = fs.statSync(dest).size;
                console.log(`[DB] Backup creato: ${name} (${bytes} byte) → ${BACKUP_DIR}`);
            } catch {
                console.log(`[DB] Backup creato: ${name} → ${BACKUP_DIR}`);
            }
            pruneBackups();
            return dest;
        })
        .catch((err) => {
            console.error('[DB] Backup fallito:', err.message || err);
            throw err;
        });
}

let backupTimer = null;
function startBackupScheduler() {
    if (backupTimer) return;
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const hours = Math.round(BACKUP_INTERVAL_MS / 3600000);
    console.log(`[DB] Backup periodico attivo ogni ${hours}h (keep=${BACKUP_KEEP}) in ${BACKUP_DIR}`);
    // Prima copia poco dopo l'avvio, poi a intervallo fisso
    setTimeout(() => {
        backupDatabase().catch(() => {});
    }, 15 * 1000);
    backupTimer = setInterval(() => {
        backupDatabase().catch(() => {});
    }, BACKUP_INTERVAL_MS);
    if (typeof backupTimer.unref === 'function') backupTimer.unref();
}

/** Pulisce dati storici non più utili (inviti usati, notifiche vecchie, richieste profilo risolte). */
function pruneStaleAuthData() {
    const daysInv = Math.max(7, parseInt(process.env.PRUNE_INVITES_DAYS || '90', 10) || 90);
    const daysNotif = Math.max(7, parseInt(process.env.PRUNE_NOTIFICATIONS_DAYS || '180', 10) || 180);
    const daysPcr = Math.max(7, parseInt(process.env.PRUNE_PROFILE_REQ_DAYS || '90', 10) || 90);
    const cutoff = (days) => new Date(Date.now() - days * 86400000).toISOString();
    try {
        // Tabella legacy non più usata
        try { db.exec('DROP TABLE IF EXISTS admin_action_requests'); } catch { /* ignore */ }

        const inv = db.prepare(`
            DELETE FROM invitations WHERE used = 1 AND createdAt < ?
        `).run(cutoff(daysInv));
        const notif = db.prepare(`
            DELETE FROM notifications WHERE createdAt < ?
        `).run(cutoff(daysNotif));
        const pcr = db.prepare(`
            DELETE FROM profile_change_requests
            WHERE status IN ('approved','rejected')
              AND COALESCE(reviewedAt, requestedAt) < ?
        `).run(cutoff(daysPcr));
        const total = (inv.changes || 0) + (notif.changes || 0) + (pcr.changes || 0);
        if (total > 0) {
            console.log(`[DB] Prune storico: inviti=${inv.changes} notifiche=${notif.changes} profile_req=${pcr.changes}`);
        }
    } catch (e) {
        console.warn('[DB] Prune storico saltato:', e.message);
    }
}

const TelegramLinks = {
    getByUserId: (userId) => db.prepare(
        'SELECT * FROM telegram_links WHERE userId = ? ORDER BY linkedAt DESC LIMIT 1'
    ).get(userId) || null,
    listByUserId: (userId) => db.prepare(
        'SELECT * FROM telegram_links WHERE userId = ? ORDER BY linkedAt ASC'
    ).all(userId),
    getByChatId: (chatId) => db.prepare('SELECT * FROM telegram_links WHERE chatId = ? LIMIT 1').get(String(chatId)) || null,
    listByChatId: (chatId) => db.prepare(
        'SELECT * FROM telegram_links WHERE chatId = ? ORDER BY linkedAt ASC'
    ).all(String(chatId)),
    countByChatId: (chatId) => {
        const row = db.prepare('SELECT COUNT(*) AS n FROM telegram_links WHERE chatId = ?').get(String(chatId));
        return row ? Number(row.n) || 0 : 0;
    },
    countByUserId: (userId) => {
        const row = db.prepare('SELECT COUNT(*) AS n FROM telegram_links WHERE userId = ?').get(userId);
        return row ? Number(row.n) || 0 : 0;
    },
    /**
     * Collega userId a chatId.
     * multiDevice=true (Super Admin): mantiene gli altri dispositivi.
     * multiDevice=false: un solo dispositivo per utente (sostituisce i precedenti).
     * Non scollega gli altri account sullo stesso chatId.
     */
    upsertLink: (userId, chatId, telegramUsername, { multiDevice = false } = {}) => {
        const now = new Date().toISOString();
        const cid = String(chatId);
        if (!multiDevice) {
            db.prepare('DELETE FROM telegram_links WHERE userId = ? AND chatId != ?').run(userId, cid);
        }
        db.prepare(`
            INSERT INTO telegram_links (userId, chatId, telegramUsername, linkedAt)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(userId, chatId) DO UPDATE SET
                telegramUsername = excluded.telegramUsername,
                linkedAt = excluded.linkedAt
        `).run(userId, cid, String(telegramUsername || ''), now);
        db.prepare('DELETE FROM telegram_link_codes WHERE userId = ?').run(userId);
        return TelegramLinks.getByUserId(userId);
    },
    unlink: (userId) => {
        db.prepare('DELETE FROM telegram_links WHERE userId = ?').run(userId);
        db.prepare('DELETE FROM telegram_link_codes WHERE userId = ?').run(userId);
    },
    unlinkUserChat: (userId, chatId) => {
        db.prepare('DELETE FROM telegram_links WHERE userId = ? AND chatId = ?').run(userId, String(chatId));
    },
    unlinkChat: (chatId) => {
        db.prepare('DELETE FROM telegram_links WHERE chatId = ?').run(String(chatId));
    },
    getPendingCode: (userId) => {
        const row = db.prepare(
            'SELECT * FROM telegram_link_codes WHERE userId = ? ORDER BY expiresAt DESC LIMIT 1'
        ).get(userId);
        if (!row) return null;
        if (String(row.expiresAt) < new Date().toISOString()) {
            db.prepare('DELETE FROM telegram_link_codes WHERE code = ?').run(row.code);
            return null;
        }
        return row;
    },
    createCode: (userId, code, expiresAt) => {
        db.prepare('DELETE FROM telegram_link_codes WHERE userId = ?').run(userId);
        db.prepare('DELETE FROM telegram_link_codes WHERE expiresAt < ?').run(new Date().toISOString());
        db.prepare('INSERT INTO telegram_link_codes (code, userId, expiresAt) VALUES (?, ?, ?)').run(code, userId, expiresAt);
    },
    consumeCode: (code) => {
        const row = db.prepare('SELECT * FROM telegram_link_codes WHERE code = ?').get(String(code || '').trim());
        if (!row) return null;
        db.prepare('DELETE FROM telegram_link_codes WHERE code = ?').run(row.code);
        if (String(row.expiresAt) < new Date().toISOString()) return null;
        return row;
    },
};

module.exports = {
    Users,
    Invitations,
    ProfileChangeRequests,
    Notifications,
    Idee,
    Messages,
    Groups,
    Attachments,
    StickerFavorites,
    AppMeta,
    PasswordResets,
    CorsiVersions,
    CorsiItems,
    BibbiaExchanges,
    BibbiaContacts,
    BibbiaChangeRequests,
    TelegramLinks,
    profileDefaults,
    backupDatabase,
    startBackupScheduler,
    pruneStaleAuthData,
};
