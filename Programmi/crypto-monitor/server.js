import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import https from 'https';
import http from 'http';
import 'dotenv/config';
import db, { initDb } from './db.js';

if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = process.env.npm_lifecycle_event === 'dev' ? 'development' : 'production';
}

// Initialize Database
initDb();

const COINGECKO_URL = 'https://api.coingecko.com/api/v3';
const PRICE_UPDATE_INTERVAL = 30 * 60 * 1000; // 30 minutes

// Reset API error state on startup to avoid showing old errors to users
try {
    const dbTmp = new Database(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'backups'), 'crypto_monitor.db'));
    dbTmp.prepare("INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)").run('api_error', 'ok');
    dbTmp.close();
} catch (e) {
    console.warn('[Startup] Could not reset api_error state:', e.message);
}

const updatePrices = async () => {
    try {
        const assets = db.prepare('SELECT id FROM assets').all();

        // Timeout controller
        const createTimeout = (ms) => {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), ms);
            return controller;
        };

        // Always try to fetch forex rate even if no assets
        let eurUsdRate = 1.08; // Default fallback
        try {
            const forexResponse = await fetch(`${COINGECKO_URL}/simple/price?ids=tether&vs_currencies=eur,usd`, {
                signal: createTimeout(30000).signal
            });
            if (forexResponse.ok) {
                const forexData = await forexResponse.json();
                if (forexData.tether && forexData.tether.usd && forexData.tether.eur) {
                    // USD per 1 EUR = tether_usd / tether_eur
                    eurUsdRate = forexData.tether.usd / forexData.tether.eur;
                    db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)').run('eur_usd_rate', eurUsdRate.toString());
                    console.log(`[PriceService] EUR/USD Rate updated: ${eurUsdRate.toFixed(4)}`);
                }
            }
        } catch (e) {
            console.error('[PriceService] Failed to update forex rate:', e.message);
        }

        if (assets.length === 0) return;

        const ids = assets.map(a => a.id).join(',');
        console.log(`[PriceService] Updating prices for: ${ids}`);

        const response = await fetch(`${COINGECKO_URL}/coins/markets?vs_currency=eur&ids=${ids}`, {
            signal: createTimeout(30000).signal
        });

        if (!response.ok) {
            if (response.status === 429) {
                console.warn('[PriceService] Rate limit di CoinGecko temporaneamente superato. Mantengo i prezzi in cache.');
                db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)').run('api_error', 'rate_limit');
                db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)').run('api_error_time', new Date().toISOString());
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const updateStmt = db.prepare('UPDATE assets SET currentPrice = ?, image = ?, lastUpdated = ? WHERE id = ?');

        const transaction = db.transaction((priceData) => {
            const today = new Date();
            const yearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            // Consider "end of month" if we are on the last 3 days of the month, or simply just log once per month. 
            // Better: log the latest price for the current month. It will overwrite until the month changes.

            for (const coin of priceData) {
                const priceEur = coin.current_price;
                const priceUsd = priceEur * eurUsdRate; // Approximation using the current rate
                const image = coin.image;

                updateStmt.run(priceEur, image, today.toISOString(), coin.id);

                // Salva o aggiorna lo storico del mese corrente
                const existingHistory = db.prepare('SELECT id FROM historical_prices WHERE assetId = ? AND date = ?').get(coin.id, yearMonth);

                if (existingHistory) {
                    db.prepare('UPDATE historical_prices SET priceEur = ?, priceUsd = ?, timestamp = CURRENT_TIMESTAMP WHERE id = ?')
                        .run(priceEur, priceUsd, existingHistory.id);
                } else {
                    db.prepare('INSERT INTO historical_prices (assetId, priceEur, priceUsd, date) VALUES (?, ?, ?, ?)')
                        .run(coin.id, priceEur, priceUsd, yearMonth);
                }
            }
        });
        transaction(data);
        db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)').run('api_error', 'ok');
        db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)').run('api_error_time', new Date().toISOString());
        console.log('[PriceService] Prices and images updated successfully. History synced.');
    } catch (e) {
        console.error('[PriceService] Update failed:', e.message);
        db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)').run('api_error', 'timeout');
        db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)').run('api_error_time', new Date().toISOString());
    }
};

// Start background price updates
setInterval(updatePrices, PRICE_UPDATE_INTERVAL);
// Initial fetch removed to prevent rate limits on server restart
// updatePrices(); 

// Load environment variables
// HANDLED AT THE TOP

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 5173;

const app = express();

// Middleware
// #3 FIX: CORS ristretto a localhost — nessun sito esterno può fare richieste API
// #3 FIX: Sicurezza Headers
const STATIC_IP = process.env.STATIC_IP || '127.0.0.1';
const ALLOWED_ORIGIN = `https://${STATIC_IP}:5173`;

// Security Headers: Solo in produzione per evitare crash con il server di build Vite
if (isProduction) {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required for React/Vite dev
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                imgSrc: ["'self'", "data:", "https://coin-images.coingecko.com"],
                connectSrc: ["'self'", "https://api.coingecko.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                objectSrc: ["'none'"],
                mediaSrc: ["'none'"],
                frameSrc: ["'none'"],
            },
        },
        crossOriginEmbedderPolicy: false,
    }));
}



const allowedOrigins = ['http://localhost', 'https://localhost', `http://localhost:5173`, `https://localhost:5173`, `http://${STATIC_IP}`, `https://${STATIC_IP}`, `https://${STATIC_IP}:5173`, `http://${STATIC_IP}:5173`, 'https://localhost:3000', 'https://192.168.4.80:5173', 'http://127.0.0.1:5173', 'https://127.0.0.1:5173', 'http://127.0.0.1', 'https://127.0.0.1'];
app.use(cors({
    origin: (origin, callback) => {
        // Nessuna origine (server-to-server LOCALE) o origine nella whitelist
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`[Security] Cors blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// #7 FIX: Limite dinamico (50mb per il ripristino backup, 1mb per tutto il resto)
app.use((req, res, next) => {
    if (req.path === '/api/backup') {
        express.json({ limit: '50mb' })(req, res, next);
    } else {
        express.json({ limit: '1mb' })(req, res, next);
    }
});

const dataDir = path.resolve(__dirname, 'backups');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const certsDir = path.resolve(__dirname, 'certs');

// Load SSL certificates
const httpsOptions = {
    key: fs.readFileSync(path.join(certsDir, 'server.key')),
    cert: fs.readFileSync(path.join(certsDir, 'server.cert'))
};

// Auto-Archiviazione dei log vecchi di 90 giorni
const ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 ore
const MAX_AGE_DAYS = 90;

const archiveOldLogs = () => {
    try {
        const archiveDir = path.join(dataDir, 'archive');
        if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

        const files = fs.readdirSync(dataDir);
        const now = Date.now();
        let archivedCount = 0;

        for (const file of files) {
            // Ignoriamo cartelle o file correnti come il database SQLite
            if (file === 'crypto_monitor.db' || file === 'crypto_monitor.db-wal' || file === 'crypto_monitor.db-shm' || file === 'archive') {
                continue;
            }

            // Isoliamo log, vecchi backup auto e vecchi JSON legacy (.bak / .enc / .log / .json)
            if (file.endsWith('.enc') || file.endsWith('.log') || file.endsWith('.bak') || file.startsWith('backup-')) {
                const filePath = path.join(dataDir, file);
                const stats = fs.statSync(filePath);

                if (stats.isFile()) {
                    const ageInDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);

                    if (ageInDays > MAX_AGE_DAYS) {
                        const dateSuffix = new Date(stats.mtimeMs).toISOString().split('T')[0];
                        const ext = path.extname(file);
                        const baseName = path.basename(file, ext);

                        // Genera un nome unico per l'archivio usando la sua data di ultima modifica reale
                        let archivedName = `${baseName}_${dateSuffix}${ext}`;
                        let archivedPath = path.join(archiveDir, archivedName);

                        // Preventivo crash per nomi identici nello stesso giorno
                        let counter = 1;
                        while (fs.existsSync(archivedPath)) {
                            archivedName = `${baseName}_${dateSuffix}_${counter}${ext}`;
                            archivedPath = path.join(archiveDir, archivedName);
                            counter++;
                        }

                        fs.renameSync(filePath, archivedPath);
                        archivedCount++;
                    }
                }
            }
        }

        if (archivedCount > 0) {
            console.log(`[Storage] Routine di pulizia: Archiviati ${archivedCount} file più vecchi di ${MAX_AGE_DAYS} giorni.`);
        }
    } catch (e) {
        console.error('[Storage] Errore durante l\'archiviazione vecchi log:', e.message);
    }
};

// Esegui all'avvio e poi ogni 24h
setTimeout(archiveOldLogs, 5000); // Ritardo 5s per non appesantire il boot
setInterval(archiveOldLogs, ROTATION_INTERVAL_MS);


const usersPath = path.join(dataDir, 'users.json');
const assetsPath = path.join(dataDir, 'assets.json');
const smtpPath = path.join(dataDir, 'smtp-config.json');

// --- Helpers ---
// #1 FIX: bcrypt con salt rounds=12 invece di SHA-256 senza salt
const BCRYPT_ROUNDS = 12;
const hashPassword = (pwd) => bcrypt.hashSync(pwd || '', BCRYPT_ROUNDS);
const verifyPassword = (pwd, hash) => {
    // Supporto legacy: se l'hash inizia con '$2b$' è bcrypt, altrimenti è SHA-256 vecchio
    if (hash && hash.startsWith('$2b$')) {
        return bcrypt.compareSync(pwd || '', hash);
    }
    // Migrazione automatica: confronto SHA-256 legacy
    const sha256 = crypto.createHash('sha256').update(pwd || '').digest('hex');
    return sha256 === hash;
};
const generateToken = () => crypto.randomUUID();

// Atomic write: write to .tmp then rename to prevent corruption on crash
const safeWriteFile = (filePath, content) => {
    const tmpPath = filePath + '.tmp';
    try {
        fs.writeFileSync(tmpPath, content, 'utf8');
        fs.renameSync(tmpPath, filePath);
    } catch (err) {
        // Cleanup tmp if rename failed
        if (fs.existsSync(tmpPath)) {
            try { fs.unlinkSync(tmpPath); } catch (_) { }
        }
        throw err;
    }
};

// Validate that an assets array has the minimum required structure
const validateAssets = (assets) => {
    if (!Array.isArray(assets)) return false;
    for (const asset of assets) {
        if (!asset.id || typeof asset.id !== 'string') return false;
        if (!asset.symbol || typeof asset.symbol !== 'string') return false;
        if (!Array.isArray(asset.holdings)) return false;
    }
    return true;
};

const getUsers = () => {
    return db.prepare('SELECT * FROM users').all();
};

const saveUsers = (users) => {
    // Legacy function disabled. All operations now use direct DB prepared statements.
    console.warn('[System] saveUsers (legacy) called. Use direct DB queries instead.');
};

const getSmtpConfig = () => {
    // Priority 1: ENV
    if (process.env.SMTP_HOST) {
        return {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        };
    }
    // Priority 2: DB
    const config = db.prepare("SELECT value FROM system_config WHERE key = 'smtp_config'").get();
    if (config) {
        try {
            return JSON.parse(config.value);
        } catch (e) {
            return {};
        }
    }
    return {};
};

const saveSmtpConfig = (config) => {
    db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)')
        .run('smtp_config', JSON.stringify(config));
};

const getAssets = () => {
    try {
        const assets = db.prepare('SELECT * FROM assets').all();
        for (const a of assets) {
            a.holdings = db.prepare('SELECT * FROM holdings WHERE assetId = ?').all(a.id);
        }
        return assets;
    } catch (e) {
        console.error('[DB] Failed to get assets:', e);
        return [];
    }
};

const saveAssets = (assets) => {
    // Legacy function. All saving now happens via direct DB transactions in /api/assets
    console.warn('[System] saveAssets (legacy) called. Use direct DB queries instead.');
};


// --- Encryption & Logging Helpers ---
const accessLogKey = process.env.ENCRYPTION_SECRET || null;
const secretKeyPath = path.join(dataDir, '.system_key');

const getSecretKey = () => {
    if (accessLogKey) return accessLogKey;

    if (fs.existsSync(secretKeyPath)) {
        return fs.readFileSync(secretKeyPath, 'utf-8');
    }
    const key = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretKeyPath, key, { mode: 0o600 }); // Solo lettura/scrittura per il proprietario
    return key;
};

const logsPath = path.join(dataDir, 'access_logs.enc');

// Helper to hash session tokens (SHA-256)
const hashToken = (token) => crypto.createHash('sha256').update(token || '').digest('hex');

const encrypt = (text) => {
    try {
        const keyStr = getSecretKey();
        const key = crypto.createHash('sha256').update(keyStr).digest();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        const combined = iv.toString('hex') + ':' + encrypted.toString('hex');
        // #4 FIX: HMAC per l'integrità dei log
        const hmac = crypto.createHmac('sha256', key).update(combined).digest('hex');
        return combined + ':' + hmac;
    } catch (e) {
        console.error("Encryption failed:", e);
        return null;
    }
};

const decrypt = (text) => {
    try {
        const parts = text.split(':');
        if (parts.length < 3) return null; // Formato non valido (manca HMAC)

        const hmacReceived = parts.pop();
        const combined = parts.join(':');

        const keyStr = getSecretKey();
        const key = crypto.createHash('sha256').update(keyStr).digest();

        // Verifica HMAC
        const hmacCalculated = crypto.createHmac('sha256', key).update(combined).digest('hex');
        if (hmacCalculated !== hmacReceived) {
            console.error("[Security] Log integrity check failed!");
            return null;
        }

        const iv = Buffer.from(parts.shift(), 'hex');
        const encryptedText = Buffer.from(parts.join(':'), 'hex');

        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        return null;
    }
};

const logAccess = (entry) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        ...entry
    };
    const encrypted = encrypt(JSON.stringify(logEntry));
    if (encrypted) fs.appendFileSync(logsPath, encrypted + '\n');
};

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 ore

const verifyAuth = (req) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return false;

    const token = authHeader.replace('Bearer ', '');
    if (!token) return false;

    // #2 FIX: Confronto hash del token invece del token in chiaro
    const tokenHash = hashToken(token);
    const user = db.prepare("SELECT * FROM users WHERE sessionToken = ? AND status = 'active'").get(tokenHash);

    if (!user) return false;

    // #5 FIX: Verifica scadenza token (24h)
    if (user.sessionExpiry && Date.now() > user.sessionExpiry) {
        return false; // Token scaduto
    }

    // SLIDING SESSION: Estendi la sessione di altre 24h ad ogni richiesta valida
    const newExpiry = Date.now() + SESSION_DURATION_MS;
    db.prepare("UPDATE users SET sessionExpiry = ? WHERE id = ?").run(newExpiry, user.id);

    return user;
};


// --- API Routes ---
const api = express.Router();

// Rate Limiters
// #4 FIX: Rate limiting — max 10 tentativi ogni 15 minuti per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Troppi tentativi. Riprova tra 15 minuti.' }
});

// Limiter meno stringente per azioni comuni ma sensibili
const actionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 ora
    max: 10,
    message: { error: 'Limite di operazioni raggiunto. Riprova più tardi.' }
});

// 1. Initial Check
api.get('/init-check', (req, res) => {
    const users = getUsers();
    const hasAdmin = users.some(u => u.role === 'admin' && u.status === 'active');
    res.json({ initialized: hasAdmin });
});

// 2. Register First Admin
api.post('/register-admin', actionLimiter, (req, res) => {
    // #BOOTSTRAP FIX: Richiedi chiave nel .env per la prima inizializzazione
    const bootstrapKey = process.env.BOOTSTRAP_KEY;
    if (bootstrapKey && req.body.bootstrapKey !== bootstrapKey) {
        return res.status(401).json({ error: 'Bootstrap Key non valida' });
    }
    const users = getUsers();
    const adminCount = db.prepare("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'").get()['COUNT(*)'];
    if (adminCount > 0) {
        return res.status(403).json({ error: 'System already initialized' });
    }

    const body = req.body;
    if (!body.email || !body.password) return res.status(400).json({ error: 'Missing fields' });
    if (body.password.length < 8) return res.status(400).json({ error: 'Password troppo corta (min 8 caratteri)' });

    const newToken = generateToken();
    const newUser = {
        id: crypto.randomUUID(),
        email: body.email,
        passwordHash: hashPassword(body.password),
        role: 'admin',
        status: 'active',
        createdAt: new Date().toISOString(),
        sessionToken: hashToken(newToken), // #2 FIX: Store hash
        sessionExpiry: Date.now() + SESSION_DURATION_MS
    };

    db.prepare(`
        INSERT INTO users (id, email, passwordHash, role, status, createdAt, sessionToken, sessionExpiry)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newUser.id, newUser.email, newUser.passwordHash, newUser.role, newUser.status, newUser.createdAt, newUser.sessionToken, newUser.sessionExpiry);

    res.json({ success: true, token: newToken, role: 'admin', email: newUser.email });
});


// 3. Login
api.post('/login', loginLimiter, async (req, res) => {
    const body = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email);
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!user) {
        logAccess({ type: 'login', email: body.email, status: 'failed', reason: 'User not found', ip: clientIp });
        return res.status(401).json({ error: 'Credenziali non valide' });
    }

    // Verifica blocco account
    if (user.status === 'locked' && user.lockedAt) {
        const lockTime = new Date(user.lockedAt).getTime();
        if (Date.now() - lockTime < LOCK_TIME_MS) {
            const minutesLeft = Math.ceil((LOCK_TIME_MS - (Date.now() - lockTime)) / 60000);
            return res.status(403).json({ error: `Account bloccato. Riprova tra ${minutesLeft} minuti o usa il reset password.` });
        } else {
            // Sblocco automatico dopo il timeout
            db.prepare("UPDATE users SET status = 'active', failedLoginAttempts = 0, lockedAt = NULL WHERE id = ?").run(user.id);
            user.status = 'active';
        }
    }

    if (!verifyPassword(body.password, user.passwordHash)) {
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const maxAttempts = 5;
        if (attempts >= maxAttempts) {
            db.prepare("UPDATE users SET status = 'locked', failedLoginAttempts = ?, lockedAt = ? WHERE id = ?").run(attempts, new Date().toISOString(), user.id);
            if (user.role === 'admin') await notifyAdminLock(user.email);
            logAccess({ type: 'login', email: user.email, status: 'locked', ip: clientIp });
        } else {
            db.prepare('UPDATE users SET failedLoginAttempts = ? WHERE id = ?').run(attempts, user.id);
            logAccess({ type: 'login', email: user.email, status: 'failed', reason: 'Wrong password', ip: clientIp });
        }
        return res.status(401).json({ error: 'Credenziali non valide' });
    }

    // Login riuscito: azzera contatore tentativi
    const newToken = generateToken();
    let updatedPasswordHash = user.passwordHash;
    if (user.passwordHash && !user.passwordHash.startsWith('$2b$')) {
        updatedPasswordHash = hashPassword(body.password);
        console.log(`[Security] Migrated password hash for ${user.email} to bcrypt`);
    }

    db.prepare('UPDATE users SET sessionToken = ?, sessionExpiry = ?, failedLoginAttempts = 0, lockedAt = NULL, passwordHash = ? WHERE id = ?')
        .run(hashToken(newToken), Date.now() + SESSION_DURATION_MS, updatedPasswordHash, user.id);

    logAccess({ type: 'login', email: user.email, role: user.role, status: 'success', ip: clientIp });
    res.json({ success: true, token: newToken, role: user.role, email: user.email });
});

function portalSsoRole(portalRole) {
    if (portalRole === 'superadmin' || portalRole === 'admin') return 'admin';
    if (portalRole === 'reader') return 'viewer';
    return 'user';
}

function consumePortalTicket(ticket) {
    const consumeUrl = process.env.PORTAL_SSO_CONSUME_URL || 'https://cryptosection.chainholder.dev/api/auth/sso/consume';
    const body = JSON.stringify({ ticket, tool: 'cryptomonitor' });
    return new Promise((resolve, reject) => {
        const u = new URL(consumeUrl);
        const lib = u.protocol === 'https:' ? https : http;
        const req = lib.request({
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search,
            method: 'POST',
            rejectUnauthorized: false,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: null }); }
            });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => { req.destroy(new Error('timeout')); });
        req.write(body);
        req.end();
    });
}

api.post('/sso', loginLimiter, async (req, res) => {
    const ticket = String((req.body || {}).ticket || '').trim();
    if (!ticket) return res.status(400).json({ error: 'Ticket mancante.' });
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    let portal;
    try {
        portal = await consumePortalTicket(ticket);
    } catch (e) {
        console.error('[SSO] consume failed:', e.message);
        return res.status(502).json({ error: 'Portale non raggiungibile.' });
    }
    if (!portal || portal.status !== 200 || !portal.body || !portal.body.email) {
        return res.status(401).json({ error: 'Ticket SSO non valido o scaduto.' });
    }
    const email = String(portal.body.email).trim().toLowerCase();
    if (!email || email.endsWith('@strumento.local')) {
        return res.status(403).json({ error: 'Account portale senza email. Usa il login diretto.' });
    }
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (user && user.status === 'locked') {
        return res.status(403).json({ error: 'Account bloccato. Contatta un amministratore.' });
    }
    if (!user) {
        const id = crypto.randomUUID();
        const role = portalSsoRole(portal.body.role);
        db.prepare(`
            INSERT INTO users (id, email, passwordHash, role, status, createdAt)
            VALUES (?, ?, ?, ?, 'active', ?)
        `).run(id, email, hashPassword(crypto.randomBytes(32).toString('hex')), role, new Date().toISOString());
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }
    const newToken = generateToken();
    db.prepare('UPDATE users SET sessionToken = ?, sessionExpiry = ?, failedLoginAttempts = 0, lockedAt = NULL WHERE id = ?')
        .run(hashToken(newToken), Date.now() + SESSION_DURATION_MS, user.id);
    logAccess({ type: 'login', email: user.email, role: user.role, status: 'sso', ip: clientIp });
    res.json({ success: true, token: newToken, role: user.role, email: user.email });
});

// Helper: invia email di reset password all'admin bloccato
const RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 ora

const sendPasswordResetEmail = async (adminEmail) => {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.email === adminEmail);
    if (userIndex === -1) throw new Error('User not found');

    const resetToken = generateToken();
    users[userIndex].resetToken = resetToken;
    users[userIndex].resetExpiry = Date.now() + RESET_EXPIRY_MS;
    saveUsers(users);

    const resetLink = `http://localhost:${PORT}/?resetToken=${resetToken}`;
    const smtpConfig = getSmtpConfig();

    if (smtpConfig && smtpConfig.host) {
        const transporter = nodemailer.createTransport(smtpConfig);
        await transporter.sendMail({
            from: smtpConfig.auth.user,
            to: adminEmail,
            subject: '🔒 Crypto Monitor — Reset Password Richiesto',
            text: `Il tuo account amministratore è stato bloccato per troppi tentativi di accesso falliti.\n\nClicca il link seguente per reimpostare la tua password (valido 1 ora):\n${resetLink}\n\nSe non sei stato tu, contatta immediatamente il supporto.`,
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
                    <h2 style="color:#ef4444">🔒 Account Bloccato</h2>
                    <p>Il tuo account amministratore <b>${adminEmail}</b> è stato bloccato per troppi tentativi di accesso falliti.</p>
                    <p>Clicca il pulsante qui sotto per reimpostare la tua password. Il link è valido per <b>1 ora</b>.</p>
                    <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:white;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
                        Reimposta Password
                    </a>
                    <p style="color:#64748b;font-size:0.85em">Se non sei stato tu a tentare il login, cambia la password appena possibile e controlla il registro accessi.</p>
                </div>
            `
        });
        console.log(`[Security] Admin reset email sent to ${adminEmail}`);
    } else {
        // Nessun SMTP: salva il link su file
        const logLine = `[${new Date().toISOString()}] ADMIN RESET for ${adminEmail}: ${resetLink}\n`;
        fs.appendFileSync(path.join(dataDir, 'invites.log'), logLine);
        console.log(`[Security] No SMTP configured. Admin reset link saved to invites.log.`);
    }
};


// Route pubblica: verifica validità token di reset
api.post('/validate-reset', loginLimiter, (req, res) => {
    const { token } = req.body;
    const users = getUsers();
    const user = users.find(u => u.resetToken === token);
    if (!user) return res.json({ valid: false });
    if (user.resetExpiry && Date.now() > user.resetExpiry) {
        return res.json({ valid: false, error: 'Link scaduto. Riprova ad accedere per ricevere un nuovo link.' });
    }
    res.json({ valid: true, email: user.email });
});

// Route pubblica: completamento reset password
api.post('/reset-password', actionLimiter, (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Dati mancanti' });
    if (password.length < 8) return res.status(400).json({ error: 'Password troppo corta (min 8 caratteri)' });

    const user = db.prepare('SELECT * FROM users WHERE resetToken = ?').get(token);
    if (!user) return res.status(400).json({ error: 'Token non valido' });

    if (user.resetExpiry && Date.now() > user.resetExpiry) {
        return res.status(400).json({ error: 'Link scaduto. Riprova ad accedere per ricevere un nuovo link.' });
    }

    // Aggiorna password, sblocca account, invalida token
    const newSession = generateToken();
    const sessionTokenHash = hashToken(newSession);
    const sessionExpiry = Date.now() + SESSION_DURATION_MS;

    db.prepare(`
        UPDATE users 
        SET passwordHash = ?, status = 'active', failedLoginAttempts = 0, lockedAt = null, 
            resetToken = null, resetExpiry = null, sessionToken = ?, sessionExpiry = ?
        WHERE resetToken = ?
    `).run(hashPassword(password), sessionTokenHash, sessionExpiry, token);

    logAccess({ type: 'reset-password', email: user.email, status: 'success', ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress });
    res.json({ success: true, token: newSession, role: user.role, email: user.email });
});

// --- Protected API Routes ---

// Middleware to check auth
const requireAdmin = (req, res, next) => {
    const user = verifyAuth(req);
    if (!user || user.role !== 'admin') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = user;
    next();
};

const requireAuth = (req, res, next) => {
    const user = verifyAuth(req);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = user;
    next();
};

const requireEditor = (req, res, next) => {
    const user = verifyAuth(req);
    if (!user || user.role === 'viewer') {
        return res.status(403).json({ error: 'Permission denied. Readers cannot edit assets.' });
    }
    req.user = user;
    next();
};

api.post('/change-password', requireAuth, actionLimiter, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Dati mancanti' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password troppo corta (min 8 caratteri)' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(req.user.email);
    if (!user) return res.status(400).json({ error: 'Utente non trovato' });

    const match = bcrypt.compareSync(oldPassword, user.passwordHash);
    if (!match) return res.status(400).json({ error: 'La password attuale è errata' });

    db.prepare('UPDATE users SET passwordHash = ? WHERE email = ?')
        .run(hashPassword(newPassword), user.email);

    logAccess({ type: 'change-password', email: user.email, status: 'success', ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress });
    res.json({ success: true, message: 'Password aggiornata' });
});


api.post('/invite', requireAdmin, actionLimiter, async (req, res) => {
    const body = req.body;
    if (!body.email) return res.status(400).json({ error: 'Missing email' });

    const users = getUsers();
    let user = users.find(u => u.email === body.email);

    if (user && user.status === 'active') {
        return res.status(400).json({ error: 'User already registered (Active)' });
    }

    const token = generateToken();
    const INVITE_EXPIRY_MS = 48 * 60 * 60 * 1000; // #6 FIX: Invite valido 48h
    const invitedAt = new Date().toISOString();
    const inviteExpiry = Date.now() + INVITE_EXPIRY_MS;

    if (user) {
        db.prepare('UPDATE users SET inviteToken = ?, invitedAt = ?, inviteExpiry = ? WHERE email = ?')
            .run(token, invitedAt, inviteExpiry, body.email);

    } else {
        const id = crypto.randomUUID();
        const dummyHash = 'INVITED_NO_PASSWORD_YET';
        db.prepare(`
            		INSERT INTO users (id, email, passwordHash, role, status, inviteToken, invitedAt, inviteExpiry)
            	VALUES (?, ?, ?, 'user', 'invited', ?, ?, ?)
        	`).run(id, body.email, dummyHash, token, invitedAt, inviteExpiry);
    }

    const smtpConfig = getSmtpConfig();
    const hostName = process.env.STATIC_IP || 'localhost';
    const protocol = process.env.STATIC_IP ? 'https' : 'http';
    const inviteLink = `${protocol}://${hostName}:${PORT}/?inviteToken=${token}`;


    if (smtpConfig && smtpConfig.host) {
        try {
            const transporter = nodemailer.createTransport(smtpConfig);
            await transporter.sendMail({
                from: smtpConfig.auth.user,
                to: body.email,
                subject: 'Invito a Crypto Monitor',
                text: `Sei stato invitato a unirti a Crypto Monitor.\n\nClicca qui per completare la registrazione:\n${inviteLink}`,
                html: `<p>Sei stato invitato a unirti a <b>Crypto Monitor</b>.</p><p><a href="${inviteLink}">Clicca qui per completare la registrazione</a></p>`
            });
            res.json({ success: true, message: 'Email sent' });
        } catch (e) {
            console.error('SMTP Error:', e);
            fs.appendFileSync(path.join(dataDir, 'invites.log'), `[${new Date().toISOString()}] FAILED EMAIL to ${body.email}. Link: ${inviteLink} Error: ${e.message}\n`);
            res.json({ success: false, error: `Email Error: ${e.message}. Logged to file.` });
        }
    } else {
        fs.appendFileSync(path.join(dataDir, 'invites.log'), `[${new Date().toISOString()}] Invite for ${body.email}: ${inviteLink}\n`);
        res.json({ success: true, message: 'Logged to file (No SMTP)' });
    }
});

api.post('/complete-registration', (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Dati mancanti' });

    const user = db.prepare('SELECT * FROM users WHERE inviteToken = ?').get(token);
    if (!user) return res.status(400).json({ error: 'Invalid token' });

    // #6 FIX: Verifica scadenza invite token
    if (user.inviteExpiry && Date.now() > user.inviteExpiry) {
        return res.status(400).json({ error: 'Il link di invito è scaduto. Chiedi un nuovo invito.' });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: 'Password troppo corta (min 8 caratteri)' });
    }

    const newSession = generateToken();
    const sessionTokenHash = hashToken(newSession);
    const sessionExpiry = Date.now() + SESSION_DURATION_MS;

    db.prepare(`
        UPDATE users 
        SET passwordHash = ?, status = 'active', inviteToken = null, inviteExpiry = null, 
            activatedAt = ?, sessionToken = ?, sessionExpiry = ?
        WHERE inviteToken = ?
    `).run(hashPassword(password), new Date().toISOString(), sessionTokenHash, sessionExpiry, token);

    res.json({ success: true, token: newSession, role: user.role });
});

api.post('/validate-invite', (req, res) => {
    const body = req.body;
    const users = getUsers();
    const user = users.find(u => u.inviteToken === body.token);
    if (!user) return res.json({ valid: false });
    // #6 FIX: Verifica scadenza
    if (user.inviteExpiry && Date.now() > user.inviteExpiry) {
        return res.json({ valid: false, error: 'Link scaduto' });
    }
    res.json({ valid: true, email: user.email });
});

api.get('/list-users', requireAdmin, (req, res) => {
    const users = getUsers().map(u => ({
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        failedLoginAttempts: u.failedLoginAttempts || 0,
        lockedAt: u.lockedAt || null
    }));
    res.json(users);
});

api.post('/list-users', requireAdmin, (req, res) => {
    const users = getUsers().map(u => ({
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        failedLoginAttempts: u.failedLoginAttempts || 0,
        lockedAt: u.lockedAt || null
    }));
    res.json(users);
});

// Sblocco account (solo admin)
api.post('/users/:email/unlock', requireAdmin, (req, res) => {
    const emailToUnlock = decodeURIComponent(req.params.email);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(emailToUnlock);

    if (!user) return res.status(404).json({ error: 'Utente non trovato' });
    if (user.status !== 'locked') return res.status(400).json({ error: 'L\'account non è bloccato' });

    db.prepare("UPDATE users SET status = 'active', failedLoginAttempts = 0, lockedAt = null WHERE email = ?")
        .run(emailToUnlock);

    logAccess({ type: 'unlock', email: emailToUnlock, status: 'success', ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress, reason: `Unlocked by admin ${req.user.email}` });
    res.json({ success: true });
});

// Admin forza reset password
api.post('/users/:email/force-reset', requireAdmin, async (req, res) => {
    const targetEmail = decodeURIComponent(req.params.email);
    if (targetEmail === req.user.email) {
        return res.status(400).json({ error: 'Usa il tasto "Cambia Password" nel menu.' });
    }

    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(targetEmail);
    if (!u) return res.status(404).json({ error: 'Utente non trovato' });

    const tokenUrl = crypto.randomBytes(32).toString('hex');
    const resetExpiry = Date.now() + 60 * 60 * 1000; // 1 hr
    db.prepare('UPDATE users SET resetToken = ?, resetExpiry = ? WHERE email = ?').run(tokenUrl, resetExpiry, targetEmail);

    const protocol = process.env.STATIC_IP ? 'https' : 'http';
    const hostName = process.env.STATIC_IP || 'localhost';
    const resetLink = `${protocol}://${hostName}:${PORT}/?reset=${tokenUrl}`;

    const smtpConfigRaw = db.prepare("SELECT value FROM system_config WHERE key = 'smtp_config'").get();

    try {
        if (smtpConfigRaw && smtpConfigRaw.value) {
            const smtpConfig = JSON.parse(smtpConfigRaw.value);
            const transporter = nodemailer.createTransport(smtpConfig);
            await transporter.sendMail({
                from: smtpConfig.auth.user,
                to: targetEmail,
                subject: '🔒 Crypto Monitor — Reset Password Forzato',
                text: `L'amministratore ha richiesto il reset della tua password.\n\nClicca il link seguente per reimpostarla (valido 1 ora):\n${resetLink}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
                        <h2 style="color:#ef4444">🔒 Reset Password Richiesto</h2>
                        <p>L'amministratore del sistema ha forzato il ripristino della tua password per l'account <b>${targetEmail}</b>.</p>
                        <p>Clicca il pulsante qui sotto per impostarne un'altra. Il link è valido per <b>1 ora</b>.</p>
                        <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:white;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
                            Reimposta Password
                        </a>
                    </div>
                `
            });
        } else {
            const logLine = `[${new Date().toISOString()}] FORCE RESET by ${req.user.email} for ${targetEmail}: ${resetLink}\n`;
            fs.appendFileSync(path.join(dataDir, 'invites.log'), logLine);
        }
    } catch (e) {
        console.error('[Security] Failed sending force reset:', e);
        const logLine = `[${new Date().toISOString()}] FORCE RESET (SMTP FAIL) by ${req.user.email} for ${targetEmail}: ${resetLink}\n`;
        fs.appendFileSync(path.join(dataDir, 'invites.log'), logLine);
    }

    logAccess({ type: 'force-reset', email: req.user.email, status: 'success', ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress, reason: `Forced reset for ${targetEmail}` });
    res.json({ success: true, message: 'Richiesta di reset e invio email completata.' });
});


api.post('/save-smtp-config', requireAdmin, async (req, res) => {
    const body = req.body;
    if (body.auth && body.auth.pass === '') {
        const oldConfig = getSmtpConfig();
        if (oldConfig && oldConfig.auth && oldConfig.auth.pass) {
            body.auth.pass = oldConfig.auth.pass;
        }
    }

    try {
        const transporter = nodemailer.createTransport(body);
        await transporter.verify();

        saveSmtpConfig(body); // Save to database after successful verification

        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

api.get('/get-smtp-config', requireAdmin, (req, res) => {
    const config = getSmtpConfig();
    if (config) {
        config.auth.pass = '********';
        res.json(config);
    } else {
        res.json({});
    }
});
// Maintain POST compatibility just in case
api.post('/get-smtp-config', requireAdmin, (req, res) => {
    const config = getSmtpConfig();
    if (config) {
        config.auth.pass = '********';
        res.json(config);
    } else {
        res.json({});
    }
});

api.get('/logs', requireAdmin, async (req, res) => {
    if (!fs.existsSync(logsPath)) return res.json([]);

    const logs = [];
    const fileStream = fs.createReadStream(logsPath);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (line.trim() === '') continue;
        try {
            const dec = decrypt(line);
            if (dec) logs.push(JSON.parse(dec));
        } catch (e) { /* skip unreadable lines */ }
    }

    res.json(logs.reverse().slice(0, 1000));
});

api.delete('/users/:email', requireAdmin, (req, res) => {
    const emailToDelete = req.params.email;
    if (!emailToDelete) return res.status(400).json({ error: 'Missing email' });
    if (emailToDelete === req.user.email) return res.status(400).json({ error: 'Cannot delete yourself' });

    const result = db.prepare('DELETE FROM users WHERE email = ?').run(emailToDelete);

    if (result.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true });
});

// --- Asset Routes ---
api.get('/assets', requireAuth, (req, res) => {
    const assets = getAssets();
    res.json(assets);
});

// Trigger manual price update or just return current cache
api.get('/prices', requireAuth, async (req, res) => {
    const { refresh } = req.query;
    if (refresh === 'true') {
        await updatePrices();
    }
    const assets = db.prepare('SELECT id, currentPrice, image, lastUpdated FROM assets').all();

    let rateConfig = db.prepare("SELECT value FROM system_config WHERE key = 'eur_usd_rate'").get();
    let eurUsdRate = 1.08;
    if (rateConfig && rateConfig.value) {
        eurUsdRate = parseFloat(rateConfig.value);
    }

    let apiErrorConfig = db.prepare("SELECT value FROM system_config WHERE key = 'api_error'").get();
    let apiError = apiErrorConfig ? apiErrorConfig.value : 'ok';

    const priceMap = {
        _meta: {
            eurUsdRate,
            apiError
        } // Inject rate and error into response
    };
    assets.forEach(a => {
        priceMap[a.id] = { current_price: a.currentPrice, image: a.image, lastUpdated: a.lastUpdated };
    });
    res.json(priceMap);
});

api.get('/historical-prices', requireAuth, (req, res) => {
    const prices = db.prepare('SELECT * FROM historical_prices ORDER BY date ASC').all();
    res.json(prices);
});

api.post('/historical-prices', requireAdmin, actionLimiter, (req, res) => {
    const { assetId, priceEur, priceUsd, date } = req.body;

    // Validazione base
    if (!assetId || priceEur === undefined || priceUsd === undefined || !date) {
        return res.status(400).json({ error: 'Dati mancanti per il prezzo storico' });
    }

    try {
        // Verifica se l'asset esiste
        const asset = db.prepare('SELECT id FROM assets WHERE id = ?').get(assetId);
        if (!asset) {
            return res.status(404).json({ error: 'Asset non trovato' });
        }

        // Verifica se esiste già un entry per quel mese/data
        const existing = db.prepare('SELECT id FROM historical_prices WHERE assetId = ? AND date = ?').get(assetId, date);

        if (existing) {
            db.prepare('UPDATE historical_prices SET priceEur = ?, priceUsd = ?, timestamp = CURRENT_TIMESTAMP WHERE id = ?')
                .run(priceEur, priceUsd, existing.id);
        } else {
            db.prepare('INSERT INTO historical_prices (assetId, priceEur, priceUsd, date) VALUES (?, ?, ?, ?)')
                .run(assetId, priceEur, priceUsd, date);
        }

        res.json({ success: true, message: 'Prezzo storico salvato' });
    } catch (e) {
        console.error('[History] Error saving price:', e);
        res.status(500).json({ error: 'Errore durante il salvataggio del prezzo storico' });
    }
});

// #Audit Trail Helper
const recordHistory = (holdingId, userId, action, details) => {
    db.prepare(`
        INSERT INTO asset_history (holdingId, userId, action, details)
        VALUES (?, ?, ?, ?)
    `).run(holdingId, userId, action, JSON.stringify(details));
};

api.post('/assets', requireEditor, (req, res) => {
    const { assets } = req.body;
    if (!assets || !Array.isArray(assets)) return res.status(400).json({ error: 'Invalid assets data' });

    try {
        const transaction = db.transaction(() => {
            for (const a of assets) {
                // Upsert asset metadata
                db.prepare(`
                    INSERT INTO assets (id, name, symbol, manualPrice)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        symbol = excluded.symbol,
                        manualPrice = excluded.manualPrice
                `).run(a.id, a.name, a.symbol, a.manualPrice);

                if (a.holdings && Array.isArray(a.holdings)) {
                    for (const h of a.holdings) {
                        const existing = db.prepare('SELECT * FROM holdings WHERE id = ?').get(h.id);

                        // Upsert holding
                        db.prepare(`
                            INSERT INTO holdings (id, assetId, amount, blockchain, walletAddress, proceeding, suspectName, injuredPartyName, label, date, status, statusDate, timestamp, historicFiatValueEur)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                                amount = excluded.amount,
                                blockchain = excluded.blockchain,
                                walletAddress = excluded.walletAddress,
                                proceeding = excluded.proceeding,
                                suspectName = excluded.suspectName,
                                injuredPartyName = excluded.injuredPartyName,
                                label = excluded.label,
                                date = excluded.date,
                                status = excluded.status,
                                statusDate = excluded.statusDate,
                                historicFiatValueEur = excluded.historicFiatValueEur
                        `).run(h.id, a.id, h.amount, h.blockchain, h.walletAddress, h.proceeding, h.suspectName, h.injuredPartyName || null, h.label, h.date, h.status || 'active', h.statusDate, h.timestamp || new Date().toISOString(), h.historicFiatValueEur || null);

                        // Audit Trail
                        if (!existing) {
                            recordHistory(h.id, req.user.id, 'create', h);
                        } else {
                            // Detect changes
                            const changes = {};
                            const fields = ['amount', 'status', 'walletAddress', 'proceeding'];
                            fields.forEach(field => {
                                if (String(existing[field] || '') !== String(h[field] || '')) {
                                    changes[field] = { old: existing[field], new: h[field] };
                                }
                            });
                            if (Object.keys(changes).length > 0) {
                                recordHistory(h.id, req.user.id, 'update', changes);
                            }
                        }
                    }
                }
            }
        });
        transaction();
        res.json({ success: true, message: 'Assets updated successfully' });
    } catch (e) {
        console.error('[API] Asset update failed:', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Backup Routes ---
// #2 FIX: Tutte le route backup richiedono autenticazione admin

api.get('/backup/list', requireAdmin, (req, res) => {
    try {
        const backupDir = dataDir;
        const files = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
            .map(f => {
                const stats = fs.statSync(path.join(backupDir, f));
                return { filename: f, date: stats.mtime };
            })
            .sort((a, b) => b.date - a.date);
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

api.get('/backup/:filename', requireAdmin, (req, res) => {
    const requestedFile = req.params.filename;
    if (!requestedFile.startsWith('backup-') || !requestedFile.endsWith('.json') || requestedFile.includes('..') || requestedFile.includes('/') || requestedFile.includes('\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }
    const filePath = path.join(dataDir, requestedFile);
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Latest backup
api.get('/backup', requireAdmin, (req, res) => {
    const filePath = path.join(dataDir, 'crypto-monitor-auto-backup.json');
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    } else {
        res.status(404).json({ error: 'No backup found' });
    }
});

// #7 FIX: Limite 50mb solo per la route backup POST
api.post('/backup', requireAdmin, express.json({ limit: '50mb' }), (req, res) => {
    const { data } = req.body;
    if (!data || !data.assets || !Array.isArray(data.assets)) {
        return res.status(400).json({ error: 'Il file di backup non è valido o mancano gli asset.' });
    }

    try {
        // Supporto per il ripristino nel nuovo DB SQLite
        const transaction = db.transaction(() => {
            // Pulisce tabelle attuali
            db.prepare('DELETE FROM holdings').run();
            // OPZIONALE: db.prepare('DELETE FROM assets').run();

            const assetStmt = db.prepare('INSERT OR REPLACE INTO assets (id, name, symbol, currentPrice, manualPrice, lastUpdated) VALUES (?, ?, ?, ?, ?, ?)');
            const holdingStmt = db.prepare('INSERT OR REPLACE INTO holdings (id, assetId, amount, blockchain, walletAddress, proceeding, suspectName, injuredPartyName, label, date, status, statusDate, timestamp, historicFiatValueEur) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

            for (const a of data.assets) {
                assetStmt.run(a.id, a.name, a.symbol, a.currentPrice || 0, a.manualPrice, a.lastUpdated);
                if (a.holdings) {
                    for (const h of a.holdings) {
                        holdingStmt.run(h.id, a.id, h.amount, h.blockchain, h.walletAddress, h.proceeding || h.legalProceeding, h.suspectName, h.injuredPartyName || null, h.label, h.date || h.seizureDate, h.status || 'active', h.statusDate, h.timestamp, h.historicFiatValueEur || null);
                    }
                }
            }
        });
        transaction();

        // Salva comunque una copia JSON per sicurezza
        const latestPath = path.join(dataDir, 'crypto-monitor-auto-backup.json');
        fs.writeFileSync(latestPath, JSON.stringify(data, null, 2));

        res.json({ success: true, message: 'Backup ripristinato ed importato nel database SQLite' });
    } catch (err) {
        console.error('[Backup] Restore failed:', err);
        res.status(500).json({ error: 'Ripristino fallito: errore interno del database.' });
    }
});


// Mount API
app.use('/api', api);


// --- Frontend Serving ---

if (!isProduction) {
    // Development: Use Vite Middleware
    console.log('Starting in DEVELOPMENT mode with Vite Middleware...');
    const vite = await import('vite');
    const viteServer = await vite.createServer({
        server: { middlewareMode: true },
        appType: 'spa'
    });
    app.use(viteServer.middlewares);
} else {
    // Production: Serve Static Files
    console.log('Starting in PRODUCTION mode serving dist/...');
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`[Security] Secure server running on https://localhost:${PORT}`);
    console.log(`[Security] Accessible on LAN at https://${process.env.STATIC_IP || '127.0.0.1'}:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
