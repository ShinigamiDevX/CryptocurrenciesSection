'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app  = express();
app.use(express.json());

const PORT             = process.env.PORT || 4000;
const DATA_DIR         = path.join(__dirname, 'data');
const USERS_FILE       = path.join(DATA_DIR, 'users.json');
const INVITATIONS_FILE = path.join(DATA_DIR, 'invitations.json');
const SECRET_FILE      = path.join(DATA_DIR, 'secret.key');
const SUPERADMIN_EMAIL = 'portalecrypto@proton.me';

// ── Setup directory e file dati ──────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR))         fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE))       fs.writeFileSync(USERS_FILE,       '[]');
if (!fs.existsSync(INVITATIONS_FILE)) fs.writeFileSync(INVITATIONS_FILE, '[]');

// JWT secret persistente (sopravvive ai restart del container)
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (fs.existsSync(SECRET_FILE)) {
        JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
    } else {
        JWT_SECRET = crypto.randomBytes(48).toString('hex');
        fs.writeFileSync(SECRET_FILE, JWT_SECRET, { mode: 0o600 });
    }
}

// ── Helper lettura/scrittura ─────────────────────────────────────────────────
const readJSON  = (f) => JSON.parse(fs.readFileSync(f, 'utf-8'));
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// ── Creazione superadmin al primo avvio ──────────────────────────────────────
(async () => {
    const users = readJSON(USERS_FILE);
    if (!users.find(u => u.email === SUPERADMIN_EMAIL)) {
        const hash = await bcrypt.hash('1234', 12);
        users.push({ id: uuidv4(), email: SUPERADMIN_EMAIL, passwordHash: hash, role: 'superadmin', mustChangePassword: true, createdAt: new Date().toISOString() });
        writeJSON(USERS_FILE, users);
        console.log('\n[AUTH] Superadmin creato con password iniziale: 1234 (da cambiare al primo accesso)\n');
    }
})();

// ── Middleware autenticazione ────────────────────────────────────────────────
function authenticate(req, res, next) {
    const header = req.headers['authorization'];
    const token  = header && header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Token mancante.' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Token non valido o scaduto.' });
    }
}

function requireSuperadmin(req, res, next) {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Accesso negato.' });
    next();
}

// ── POST /api/auth/login ─────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email e password obbligatori.' });
    const users = readJSON(USERS_FILE);
    const user  = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    // Risposta generica per non rivelare se l'email esiste
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ error: 'Credenziali non valide.' });
    }
    const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, mustChangePassword: !!user.mustChangePassword },
        JWT_SECRET,
        { expiresIn: '12h' }
    );
    res.json({ token, role: user.role, mustChangePassword: !!user.mustChangePassword });
});

// ── GET /api/auth/verify ─────────────────────────────────────────────────────
app.get('/api/auth/verify', authenticate, (req, res) => {
    res.json({ valid: true, email: req.user.email, role: req.user.role });
});

// ── POST /api/auth/invite  (solo superadmin) ─────────────────────────────────
app.post('/api/auth/invite', authenticate, requireSuperadmin, (req, res) => {
    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'Email non valida.' });
    const users = readJSON(USERS_FILE);
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
        return res.status(409).json({ error: 'Utente già registrato.' });
    const invitations = readJSON(INVITATIONS_FILE);
    // Invalida inviti precedenti per la stessa email
    invitations.forEach(i => { if (i.email.toLowerCase() === email.toLowerCase()) i.used = true; });
    const token = uuidv4();
    invitations.push({
        token,
        email,
        createdAt:  new Date().toISOString(),
        expiresAt:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        used: false
    });
    writeJSON(INVITATIONS_FILE, invitations);
    res.json({ token, link: `/register?token=${token}` });
});

// ── GET /api/auth/invite-info?token=...  (pubblica, per la pagina register) ──
app.get('/api/auth/invite-info', (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token mancante.' });
    const inv = readJSON(INVITATIONS_FILE).find(i => i.token === token && !i.used);
    if (!inv)                              return res.status(404).json({ error: 'Invito non valido o già utilizzato.' });
    if (new Date() > new Date(inv.expiresAt)) return res.status(400).json({ error: 'Invito scaduto.' });
    res.json({ email: inv.email });
});

// ── POST /api/auth/register ──────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password)      return res.status(400).json({ error: 'Token e password obbligatori.' });
    if (password.length < 8)      return res.status(400).json({ error: 'Password di almeno 8 caratteri.' });
    const invitations = readJSON(INVITATIONS_FILE);
    const inv = invitations.find(i => i.token === token && !i.used);
    if (!inv)                              return res.status(400).json({ error: 'Invito non valido o già utilizzato.' });
    if (new Date() > new Date(inv.expiresAt)) return res.status(400).json({ error: 'Invito scaduto.' });
    const users = readJSON(USERS_FILE);
    if (users.find(u => u.email.toLowerCase() === inv.email.toLowerCase()))
        return res.status(409).json({ error: 'Utente già registrato.' });
    users.push({ id: uuidv4(), email: inv.email, passwordHash: await bcrypt.hash(password, 12), role: 'user', createdAt: new Date().toISOString() });
    writeJSON(USERS_FILE, users);
    inv.used = true;
    writeJSON(INVITATIONS_FILE, invitations);
    res.json({ success: true, email: inv.email });
});

// ── GET /api/auth/users  (solo superadmin) ───────────────────────────────────
app.get('/api/auth/users', authenticate, requireSuperadmin, (req, res) => {
    res.json(readJSON(USERS_FILE).map(({ passwordHash, ...u }) => u));
});

// ── DELETE /api/auth/users/:id  (solo superadmin) ────────────────────────────
app.delete('/api/auth/users/:id', authenticate, requireSuperadmin, (req, res) => {
    const users = readJSON(USERS_FILE);
    const user  = users.find(u => u.id === req.params.id);
    if (!user)                       return res.status(404).json({ error: 'Utente non trovato.' });
    if (user.email === SUPERADMIN_EMAIL) return res.status(403).json({ error: 'Impossibile eliminare il superadmin.' });
    writeJSON(USERS_FILE, users.filter(u => u.id !== req.params.id));
    res.json({ success: true });
});

// ── GET /api/auth/invitations  (solo superadmin) ─────────────────────────────
app.get('/api/auth/invitations', authenticate, requireSuperadmin, (req, res) => {
    res.json(readJSON(INVITATIONS_FILE).filter(i => !i.used && new Date() < new Date(i.expiresAt)));
});

// ── POST /api/auth/change-password ───────────────────────────────────────────
app.post('/api/auth/change-password', authenticate, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Parametri mancanti.' });
    if (newPassword.length < 8)           return res.status(400).json({ error: 'Password di almeno 8 caratteri.' });
    const users = readJSON(USERS_FILE);
    const user  = users.find(u => u.id === req.user.id);
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash)))
        return res.status(401).json({ error: 'Password attuale non corretta.' });
    user.passwordHash        = await bcrypt.hash(newPassword, 12);
    user.mustChangePassword  = false;
    writeJSON(USERS_FILE, users);
    // Emetti nuovo token senza il flag mustChangePassword
    const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, mustChangePassword: false },
        JWT_SECRET,
        { expiresIn: '12h' }
    );
    res.json({ success: true, token });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Auth service in ascolto su http://0.0.0.0:${PORT}`));
