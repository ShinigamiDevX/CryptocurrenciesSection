'use strict';
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH  = path.join(DATA_DIR, 'portal.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id                      TEXT PRIMARY KEY,
        email                   TEXT UNIQUE NOT NULL COLLATE NOCASE,
        passwordHash            TEXT NOT NULL DEFAULT '',
        role                    TEXT NOT NULL DEFAULT 'user',
        createdAt               TEXT NOT NULL,
        revokedAt               TEXT,
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
        domicilio               TEXT NOT NULL DEFAULT '',
        domicilioTipo           TEXT NOT NULL DEFAULT '',
        domicilioProvincia      TEXT NOT NULL DEFAULT '',
        domicilioComune         TEXT NOT NULL DEFAULT '',
        domicilioStato          TEXT NOT NULL DEFAULT '',
        domicilioComeResidenza  INTEGER NOT NULL DEFAULT 0,
        telefono                TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS invitations (
        token     TEXT PRIMARY KEY,
        email     TEXT NOT NULL,
        role      TEXT NOT NULL DEFAULT 'user',
        invitedBy TEXT,
        createdAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        used      INTEGER NOT NULL DEFAULT 0,
        otp       TEXT,
        otpExpiry TEXT,
        otpUsed   INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS role_change_requests (
        id               TEXT PRIMARY KEY,
        requestedById    TEXT NOT NULL,
        requestedByEmail TEXT NOT NULL,
        targetId         TEXT NOT NULL,
        targetEmail      TEXT NOT NULL,
        currentRole      TEXT NOT NULL,
        newRole          TEXT NOT NULL,
        createdAt        TEXT NOT NULL,
        expiresAt        TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'pending',
        approvedById     TEXT,
        approvedByEmail  TEXT,
        approvedAt       TEXT,
        cancelledAt      TEXT
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
        domicilio              TEXT NOT NULL DEFAULT '',
        domicilioTipo          TEXT NOT NULL DEFAULT '',
        domicilioProvincia     TEXT NOT NULL DEFAULT '',
        domicilioComune        TEXT NOT NULL DEFAULT '',
        domicilioStato         TEXT NOT NULL DEFAULT '',
        domicilioComeResidenza INTEGER NOT NULL DEFAULT 0,
        telefono               TEXT NOT NULL DEFAULT '',
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
`);

// ── Migrazione da JSON (eseguita una sola volta) ──────────────────────────────
function migrateFromJson() {
    const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    if (count > 0) return;

    const usersFile = path.join(DATA_DIR, 'users.json');
    const invFile   = path.join(DATA_DIR, 'invitations.json');

    if (fs.existsSync(usersFile)) {
        const users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
        const stmt  = db.prepare(`
            INSERT OR IGNORE INTO users (id, email, passwordHash, role, createdAt, revokedAt, mustChangePassword)
            VALUES (@id, @email, @passwordHash, @role, @createdAt, @revokedAt, @mustChangePassword)
        `);
        db.transaction(() => users.forEach(u => stmt.run({
            id: u.id, email: u.email, passwordHash: u.passwordHash || '',
            role: u.role || 'user', createdAt: u.createdAt,
            revokedAt: u.revokedAt || null, mustChangePassword: u.mustChangePassword ? 1 : 0
        })))();
        console.log(`[DB] Migrati ${users.length} utenti da users.json`);
    }

    if (fs.existsSync(invFile)) {
        const invs = JSON.parse(fs.readFileSync(invFile, 'utf-8'));
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO invitations (token, email, role, invitedBy, createdAt, expiresAt, used, otp, otpExpiry, otpUsed)
            VALUES (@token, @email, @role, @invitedBy, @createdAt, @expiresAt, @used, @otp, @otpExpiry, @otpUsed)
        `);
        db.transaction(() => invs.forEach(i => stmt.run({
            token: i.token, email: i.email, role: i.role || 'user',
            invitedBy: i.invitedBy || null, createdAt: i.createdAt,
            expiresAt: i.expiresAt, used: i.used ? 1 : 0,
            otp: i.otp || null, otpExpiry: i.otpExpiry || null, otpUsed: i.otpUsed ? 1 : 0
        })))();
        console.log(`[DB] Migrati ${invs.length} inviti da invitations.json`);
    }
}
migrateFromJson();

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
    ['domicilio', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioTipo', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioProvincia', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioComune', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioStato', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioComeResidenza', 'INTEGER NOT NULL DEFAULT 0'],
    ['telefono', "TEXT NOT NULL DEFAULT ''"],
];
USER_EXTRA_COLS.forEach(([col, def]) => {
    try { db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`); }
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
    ['domicilio', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioTipo', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioProvincia', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioComune', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioStato', "TEXT NOT NULL DEFAULT ''"],
    ['domicilioComeResidenza', 'INTEGER NOT NULL DEFAULT 0'],
    ['telefono', "TEXT NOT NULL DEFAULT ''"],
];
PCR_EXTRA_COLS.forEach(([col, def]) => {
    try { db.exec(`ALTER TABLE profile_change_requests ADD COLUMN ${col} ${def}`); }
    catch { /* già presente */ }
});

// ── Helper ────────────────────────────────────────────────────────────────────
const toBool = v => !!v;
const fromRow = (r) => r ? {
    ...r,
    mustChangePassword: toBool(r.mustChangePassword),
    domicilioComeResidenza: toBool(r.domicilioComeResidenza),
} : null;

function geoBlock(p, prefix) {
    const tipo = p[`${prefix}Tipo`] === 'IT' || p[`${prefix}Tipo`] === 'ESTERO' ? p[`${prefix}Tipo`] : '';
    return {
        [prefix]: p[prefix] || '',
        [`${prefix}Tipo`]: tipo,
        [`${prefix}Provincia`]: tipo === 'IT' ? (p[`${prefix}Provincia`] || '') : '',
        [`${prefix}Comune`]: tipo === 'IT' ? (p[`${prefix}Comune`] || '') : '',
        [`${prefix}Stato`]: tipo === 'ESTERO' ? (p[`${prefix}Stato`] || '') : '',
    };
}

function profileDefaults(p = {}) {
    const comeRes = !!p.domicilioComeResidenza;
    const luogo = geoBlock(p, 'luogoNascita');
    const residenza = geoBlock(p, 'residenza');
    const domicilio = comeRes ? {
        domicilio: residenza.residenza,
        domicilioTipo: residenza.residenzaTipo,
        domicilioProvincia: residenza.residenzaProvincia,
        domicilioComune: residenza.residenzaComune,
        domicilioStato: residenza.residenzaStato,
    } : geoBlock(p, 'domicilio');
    return {
        nome: p.nome || '',
        cognome: p.cognome || '',
        grado: p.grado || '',
        dataNascita: p.dataNascita || '',
        ...luogo,
        ...residenza,
        ...domicilio,
        domicilioComeResidenza: comeRes ? 1 : 0,
        telefono: p.telefono || '',
    };
}

// ── Users ─────────────────────────────────────────────────────────────────────
const Users = {
    findById:    id    => fromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(id)),
    findByEmail: email => fromRow(db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email)),
    findActive:  ()    => db.prepare('SELECT * FROM users WHERE revokedAt IS NULL').all().map(fromRow),
    insert: u => {
        const p = profileDefaults(u);
        return db.prepare(`
            INSERT INTO users (
                id,email,passwordHash,role,createdAt,mustChangePassword,
                nome,cognome,grado,dataNascita,luogoNascita,
                luogoNascitaTipo,luogoNascitaProvincia,luogoNascitaComune,luogoNascitaStato,
                residenza,residenzaTipo,residenzaProvincia,residenzaComune,residenzaStato,
                domicilio,domicilioTipo,domicilioProvincia,domicilioComune,domicilioStato,
                domicilioComeResidenza,telefono
            ) VALUES (
                @id,@email,@passwordHash,@role,@createdAt,@mustChangePassword,
                @nome,@cognome,@grado,@dataNascita,@luogoNascita,
                @luogoNascitaTipo,@luogoNascitaProvincia,@luogoNascitaComune,@luogoNascitaStato,
                @residenza,@residenzaTipo,@residenzaProvincia,@residenzaComune,@residenzaStato,
                @domicilio,@domicilioTipo,@domicilioProvincia,@domicilioComune,@domicilioStato,
                @domicilioComeResidenza,@telefono
            )
        `).run({
            id: u.id,
            email: u.email,
            passwordHash: u.passwordHash,
            role: u.role || 'user',
            createdAt: u.createdAt,
            mustChangePassword: u.mustChangePassword ? 1 : 0,
            ...p,
        });
    },
    /** Riattiva un utente revocato (stesso id/email) con nuove credenziali e profilo. */
    reactivate: (id, u) => {
        const p = profileDefaults(u);
        return db.prepare(`
            UPDATE users SET
                passwordHash=@passwordHash, role=@role, createdAt=@createdAt,
                revokedAt=NULL, mustChangePassword=@mustChangePassword,
                nome=@nome, cognome=@cognome, grado=@grado,
                dataNascita=@dataNascita, luogoNascita=@luogoNascita,
                luogoNascitaTipo=@luogoNascitaTipo, luogoNascitaProvincia=@luogoNascitaProvincia,
                luogoNascitaComune=@luogoNascitaComune, luogoNascitaStato=@luogoNascitaStato,
                residenza=@residenza, residenzaTipo=@residenzaTipo, residenzaProvincia=@residenzaProvincia,
                residenzaComune=@residenzaComune, residenzaStato=@residenzaStato,
                domicilio=@domicilio, domicilioTipo=@domicilioTipo, domicilioProvincia=@domicilioProvincia,
                domicilioComune=@domicilioComune, domicilioStato=@domicilioStato,
                domicilioComeResidenza=@domicilioComeResidenza, telefono=@telefono
            WHERE id=@id
        `).run({
            id,
            passwordHash: u.passwordHash,
            role: u.role || 'user',
            createdAt: u.createdAt,
            mustChangePassword: u.mustChangePassword ? 1 : 0,
            ...p,
        });
    },
    updateRole: (id, role) => db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id),
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
                domicilio=@domicilio, domicilioTipo=@domicilioTipo, domicilioProvincia=@domicilioProvincia,
                domicilioComune=@domicilioComune, domicilioStato=@domicilioStato,
                domicilioComeResidenza=@domicilioComeResidenza, telefono=@telefono
            WHERE id=@id
        `).run({ id, ...p });
    },
    revoke: id => db.prepare("UPDATE users SET revokedAt = ?, passwordHash = '' WHERE id = ?").run(new Date().toISOString(), id),
    changePassword:(id, hash) => db.prepare('UPDATE users SET passwordHash = ?, mustChangePassword = 0 WHERE id = ?').run(hash, id),
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
                domicilio,domicilioTipo,domicilioProvincia,domicilioComune,domicilioStato,
                domicilioComeResidenza,telefono,
                requestedAt
            ) VALUES (
                @id,@userId,@userEmail,@nome,@cognome,@grado,
                @dataNascita,@luogoNascita,@luogoNascitaTipo,@luogoNascitaProvincia,@luogoNascitaComune,@luogoNascitaStato,
                @residenza,@residenzaTipo,@residenzaProvincia,@residenzaComune,@residenzaStato,
                @domicilio,@domicilioTipo,@domicilioProvincia,@domicilioComune,@domicilioStato,
                @domicilioComeResidenza,@telefono,
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
const toInv = r => r ? { ...r, used: toBool(r.used), otpUsed: toBool(r.otpUsed) } : null;
const Invitations = {
    findByToken:      token => toInv(db.prepare('SELECT * FROM invitations WHERE token = ?').get(token)),
    findActive:       ()    => db.prepare("SELECT * FROM invitations WHERE used=0 AND expiresAt > datetime('now')").all().map(toInv),
    invalidateByEmail:email => db.prepare('UPDATE invitations SET used=1 WHERE email=? COLLATE NOCASE').run(email),
    insert: i => db.prepare(
        'INSERT INTO invitations (token,email,role,invitedBy,createdAt,expiresAt) VALUES (@token,@email,@role,@invitedBy,@createdAt,@expiresAt)'
    ).run(i),
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
    markAllRead: userId => db.prepare(
        "UPDATE notifications SET readAt=? WHERE userId=? AND readAt IS NULL"
    ).run(new Date().toISOString(), userId),
};

module.exports = { Users, Invitations, ProfileChangeRequests, Notifications, profileDefaults };
