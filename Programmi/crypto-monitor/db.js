import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, 'backups');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'crypto_monitor.db');
const db = new Database(dbPath);

// Enable WAL for better performance with concurrent access
db.pragma('journal_mode = WAL');

export const initDb = () => {
    // 1. Create Tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            passwordHash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            status TEXT DEFAULT 'active',
            createdAt TEXT,
            sessionToken TEXT,
            sessionExpiry INTEGER,
            failedLoginAttempts INTEGER DEFAULT 0,
            lockedAt TEXT,
            resetToken TEXT,
            resetExpiry INTEGER,
            inviteToken TEXT,
            inviteExpiry INTEGER,
            activatedAt TEXT
        );

        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            symbol TEXT NOT NULL,
            currentPrice REAL DEFAULT 0,
            manualPrice REAL,
            lastUpdated TEXT,
            image TEXT
        );

        CREATE TABLE IF NOT EXISTS holdings (
            id TEXT PRIMARY KEY,
            assetId TEXT NOT NULL,
            amount REAL NOT NULL,
            blockchain TEXT,
            walletAddress TEXT,
            proceeding TEXT,
            suspectName TEXT,
            label TEXT,
            date TEXT,
            status TEXT DEFAULT 'active',
            statusDate TEXT,
            timestamp TEXT,
            historicFiatValueEur REAL,
            FOREIGN KEY (assetId) REFERENCES assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS system_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS asset_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            holdingId TEXT NOT NULL,
            userId TEXT,
            action TEXT, -- 'create', 'update', 'delete', 'status_change'
            details TEXT, -- JSON string of changes
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS historical_prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assetId TEXT NOT NULL,
            priceEur REAL NOT NULL,
            priceUsd REAL NOT NULL,
            date TEXT NOT NULL,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (assetId) REFERENCES assets(id) ON DELETE CASCADE
        );
    `);

    // Ensure backwards compatibility with older DB files
    try {
        db.exec("ALTER TABLE users ADD COLUMN invitedAt TEXT;");
        console.log('[DB] Migration: Added invitedAt column');
    } catch (e) { }
    try {
        db.exec("ALTER TABLE users ADD COLUMN inviteToken TEXT;");
    } catch (e) { }
    try {
        db.exec("ALTER TABLE users ADD COLUMN inviteExpiry INTEGER;");
    } catch (e) { }
    try {
        db.exec("ALTER TABLE holdings ADD COLUMN historicFiatValueEur REAL;");
        console.log('[DB] Migration: Added historicFiatValueEur column');
    } catch (e) { }
    try {
        db.exec("ALTER TABLE holdings ADD COLUMN injuredPartyName TEXT;");
        console.log('[DB] Migration: Added injuredPartyName column');
    } catch (e) { }


    // 2. Migration from JSON (if exists)
    migrateFromJson();
};

const migrateFromJson = () => {
    const usersPath = path.join(dataDir, 'users.json');
    const assetsPath = path.join(dataDir, 'assets.json');
    const smtpPath = path.join(dataDir, 'smtp-config.json');

    // Migrate Users
    if (fs.existsSync(usersPath)) {
        try {
            const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO users (id, email, passwordHash, role, status, createdAt, sessionToken, sessionExpiry, failedLoginAttempts, lockedAt, resetToken, resetExpiry, inviteToken, inviteExpiry, activatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const transaction = db.transaction((userList) => {
                for (const u of userList) {
                    stmt.run(u.id, u.email, u.passwordHash, u.role, u.status, u.createdAt, u.sessionToken, u.sessionExpiry, u.failedLoginAttempts || 0, u.lockedAt, u.resetToken, u.resetExpiry, u.inviteToken, u.inviteExpiry, u.activatedAt);
                }
            });
            transaction(users);
            console.log('[DB] Migrated ' + users.length + ' users from JSON.');
            // Archive old file
            fs.renameSync(usersPath, usersPath + '.bak');
        } catch (e) { console.error('[DB] User migration failed:', e.message); }
    }

    // Migrate Assets & Holdings
    if (fs.existsSync(assetsPath)) {
        try {
            const assets = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
            const assetStmt = db.prepare('INSERT OR IGNORE INTO assets (id, name, symbol, currentPrice, manualPrice, lastUpdated) VALUES (?, ?, ?, ?, ?, ?)');
            const holdingStmt = db.prepare('INSERT OR IGNORE INTO holdings (id, assetId, amount, blockchain, walletAddress, proceeding, suspectName, label, date, status, statusDate, timestamp, historicFiatValueEur) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

            const transaction = db.transaction((assetList) => {
                for (const a of assetList) {
                    assetStmt.run(a.id, a.name, a.symbol, a.currentPrice || 0, a.manualPrice, a.lastUpdated);
                    if (a.holdings) {
                        for (const h of a.holdings) {
                            holdingStmt.run(h.id, a.id, h.amount, h.blockchain, h.walletAddress, h.proceeding || h.legalProceeding, h.suspectName, h.label, h.date || h.seizureDate, h.status || 'active', h.statusDate, h.timestamp, h.historicFiatValueEur || null);
                        }
                    }
                }
            });
            transaction(assets);
            console.log('[DB] Migrated ' + assets.length + ' assets and their holdings from JSON.');
            fs.renameSync(assetsPath, assetsPath + '.bak');
        } catch (e) { console.error('[DB] Assets migration failed:', e.message); }
    }

    // Migrate SMTP Config
    if (fs.existsSync(smtpPath)) {
        try {
            const smtp = fs.readFileSync(smtpPath, 'utf8');
            db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)').run('smtp_config', smtp);
            console.log('[DB] Migrated SMTP config from JSON.');
            fs.renameSync(smtpPath, smtpPath + '.bak');
        } catch (e) { console.error('[DB] SMTP migration failed:', e.message); }
    }
};

export default db;
