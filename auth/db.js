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
        id                 TEXT PRIMARY KEY,
        email              TEXT UNIQUE NOT NULL COLLATE NOCASE,
        passwordHash       TEXT NOT NULL DEFAULT '',
        role               TEXT NOT NULL DEFAULT 'user',
        createdAt          TEXT NOT NULL,
        revokedAt          TEXT,
        mustChangePassword INTEGER NOT NULL DEFAULT 0,
        nome               TEXT NOT NULL DEFAULT '',
        cognome            TEXT NOT NULL DEFAULT '',
        grado              TEXT NOT NULL DEFAULT ''
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
['nome','cognome','grado'].forEach(col => {
    try { db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`); }
    catch { /* colonna già presente */ }
});

// ── Helper ────────────────────────────────────────────────────────────────────
const toBool = v => !!v;
const fromRow = (r) => r ? { ...r, mustChangePassword: toBool(r.mustChangePassword) } : null;

// ── Users ─────────────────────────────────────────────────────────────────────
const Users = {
    findById:    id    => fromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(id)),
    findByEmail: email => fromRow(db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email)),
    findActive:  ()    => db.prepare('SELECT * FROM users WHERE revokedAt IS NULL').all().map(fromRow),
    insert: u => db.prepare(
        'INSERT INTO users (id,email,passwordHash,role,createdAt,mustChangePassword,nome,cognome,grado) VALUES (@id,@email,@passwordHash,@role,@createdAt,@mustChangePassword,@nome,@cognome,@grado)'
    ).run({ ...u, mustChangePassword: u.mustChangePassword ? 1 : 0, nome: u.nome||'', cognome: u.cognome||'', grado: u.grado||'' }),
    updateRole:    (id, role) => db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id),
    revoke:        id  => db.prepare("UPDATE users SET revokedAt = ?, passwordHash = '' WHERE id = ?").run(new Date().toISOString(), id),
    changePassword:(id, hash) => db.prepare('UPDATE users SET passwordHash = ?, mustChangePassword = 0 WHERE id = ?').run(hash, id),
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

module.exports = { Users, Invitations };
