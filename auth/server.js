'use strict';
const express      = require('express');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const nodemailer   = require('nodemailer');
const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app  = express();
app.use(express.json());

const PORT             = process.env.PORT || 4000;
const DATA_DIR         = path.join(__dirname, 'data');
const USERS_FILE       = path.join(DATA_DIR, 'users.json');
const INVITATIONS_FILE = path.join(DATA_DIR, 'invitations.json');
const SECRET_FILE      = path.join(DATA_DIR, 'secret.key');
const REQUESTS_FILE    = path.join(DATA_DIR, 'role_change_requests.json');
const SUPERADMIN_EMAIL = 'portalecrypto@proton.me';
const PORTAL_URL       = (process.env.PORTAL_URL || 'https://192.168.4.77:5200').replace(/\/$/, '');

// Livelli ruolo — usati per validare inviti e modifiche
const ROLE_LEVEL = { reader: 0, user: 1, admin: 2, superadmin: 3 };
const ALL_ROLES  = ['reader', 'user', 'admin', 'superadmin'];

// ── SMTP setup ──────────────────────────────────────────────────────────────
const SMTP_HOST   = process.env.SMTP_HOST;
const SMTP_PORT   = parseInt(process.env.SMTP_PORT  || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER   = process.env.SMTP_USER;
const SMTP_PASS   = process.env.SMTP_PASS;
const SMTP_FROM   = process.env.SMTP_FROM || SMTP_USER;

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
        host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        tls: { rejectUnauthorized: false }
    });
    console.log(`[AUTH] SMTP configurato: ${SMTP_HOST}:${SMTP_PORT}`);
} else {
    console.log('[AUTH] SMTP non configurato — i link di invito saranno visibili solo nel pannello admin.');
}

async function sendInviteEmail(toEmail, inviteToken, assignedRole) {
    const link      = `${PORTAL_URL}/register?token=${inviteToken}`;
    const roleLabel = assignedRole === 'admin' ? 'Amministratore' : 'Utente';
    if (!transporter) {
        console.log(`[AUTH] Link invito (${roleLabel}) per ${toEmail}: ${link}`);
        return;
    }
    const html = `
    <!DOCTYPE html><html lang="it"><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;">
      <tr><td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr><td style="background:#030E1C;padding:28px 32px;">
            <span style="color:#00C8FF;font-size:1.2rem;font-weight:700;">CryptocurrenciesSection</span>
            <span style="color:#5ABBC8;font-size:0.9rem;"> — Portale Operativo</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h2 style="color:#1a2a3a;margin:0 0 12px;">Sei stato invitato</h2>
            <p style="color:#4a5568;line-height:1.6;margin:0 0 8px;">Hai ricevuto un invito per accedere al portale operativo interno come <strong>${roleLabel}</strong>.</p>
            <p style="color:#4a5568;line-height:1.6;margin:0 0 28px;">Clicca sul pulsante qui sotto per completare la registrazione. Il link è valido per <strong>15 minuti</strong>.</p>
            <a href="${link}" style="display:inline-block;padding:14px 28px;background:#00C8FF;color:#030E1C;text-decoration:none;border-radius:8px;font-weight:700;font-size:0.95rem;">Completa la registrazione</a>
            <p style="color:#a0aec0;font-size:0.8rem;margin:24px 0 0;">Se il pulsante non funziona, copia questo link nel browser:<br><span style="color:#00C8FF;word-break:break-all;">${link}</span></p>
          </td></tr>
          <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
            <p style="color:#a0aec0;font-size:0.75rem;margin:0;">Uso interno riservato. Non condividere questa email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
    </body></html>`;
    await transporter.sendMail({
        from:    SMTP_FROM,
        to:      toEmail,
        subject: `[CryptocurrenciesSection] Invito come ${roleLabel}`,
        html
    });
    console.log(`[AUTH] Email invito inviata a ${toEmail}`);
}

// ── Setup directory e file dati ──────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR))         fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE))       fs.writeFileSync(USERS_FILE,       '[]');
if (!fs.existsSync(INVITATIONS_FILE)) fs.writeFileSync(INVITATIONS_FILE, '[]');
if (!fs.existsSync(REQUESTS_FILE))    fs.writeFileSync(REQUESTS_FILE,    '[]');

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

// admin O superadmin
function requireAdmin(req, res, next) {
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin')
        return res.status(403).json({ error: 'Accesso negato.' });
    next();
}

// ── POST /api/auth/login ─────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email e password obbligatori.' });
    const users = readJSON(USERS_FILE);
    const user  = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    // Risposta generica per non rivelare se l'email esiste
    if (!user || user.revokedAt || !(await bcrypt.compare(password, user.passwordHash))) {
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
    // Legge il ruolo aggiornato dal DB (non dal JWT che potrebbe essere obsoleto)
    const users = readJSON(USERS_FILE);
    const user  = users.find(u => u.id === req.user.id);
    if (!user || user.revokedAt) return res.status(401).json({ error: 'Sessione non valida.' });
    res.json({ valid: true, email: user.email, role: user.role });
});

// ── POST /api/auth/invite  (superadmin o admin) ─────────────────────────────
app.post('/api/auth/invite', authenticate, requireAdmin, async (req, res) => {
    const { email, role: requestedRole } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'Email non valida.' });
    // Admin e superadmin possono scegliere il ruolo dell'invitato (user o admin)
    const allowedRoles = ['user', 'admin'];
    const assignedRole = allowedRoles.includes(requestedRole) ? requestedRole : 'user';
    const users = readJSON(USERS_FILE);
    // Solo utenti attivi (non revocati)
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase() && !u.revokedAt))
        return res.status(409).json({ error: 'Utente già registrato.' });
    const invitations = readJSON(INVITATIONS_FILE);
    // Invalida inviti precedenti per la stessa email
    invitations.forEach(i => { if (i.email.toLowerCase() === email.toLowerCase()) i.used = true; });
    const token = uuidv4();
    invitations.push({
        token,
        email,
        role:      assignedRole,
        invitedBy: req.user.email,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        used: false
    });
    writeJSON(INVITATIONS_FILE, invitations);
    // Invia email in background (non blocca la risposta)
    sendInviteEmail(email, token, assignedRole).catch(err => console.error('[AUTH] Errore invio email:', err.message));
    res.json({ token, link: `/register?token=${token}`, role: assignedRole, emailSent: !!transporter });
});

// ── POST /api/auth/send-otp  — invia codice verifica all'email invitata (pubblica) ──
app.post('/api/auth/send-otp', async (req, res) => {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Token mancante.' });
    const invitations = readJSON(INVITATIONS_FILE);
    const inv = invitations.find(i => i.token === token && !i.used);
    if (!inv || new Date() > new Date(inv.expiresAt))
        return res.status(400).json({ error: 'Invito non valido o scaduto.' });
    const otp    = Math.floor(100000 + Math.random() * 900000).toString();
    inv.otp       = await bcrypt.hash(otp, 10);
    inv.otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    inv.otpUsed   = false;
    writeJSON(INVITATIONS_FILE, invitations);
    const html = `<!DOCTYPE html><html lang="it"><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#030E1C;padding:28px 32px;"><span style="color:#00C8FF;font-size:1.2rem;font-weight:700;">CryptocurrenciesSection</span></td></tr>
<tr><td style="padding:32px;">
<h2 style="color:#1a2a3a;margin:0 0 12px;">Codice di verifica</h2>
<p style="color:#4a5568;line-height:1.6;margin:0 0 20px;">Usa questo codice per completare la registrazione. Valido per <strong>10 minuti</strong>.</p>
<div style="background:#f0f9ff;border:2px solid #00C8FF;border-radius:10px;padding:20px 32px;text-align:center;letter-spacing:0.3rem;font-size:2.2rem;font-weight:700;color:#030E1C;">${otp}</div>
<p style="color:#a0aec0;font-size:0.8rem;margin-top:20px;">Se non hai richiesto tu questa registrazione, ignora questa email.</p>
</td></tr></table></td></tr></table></body></html>`;
    if (transporter) {
        transporter.sendMail({ from: SMTP_FROM, to: inv.email, subject: '[CryptocurrenciesSection] Codice di verifica', html })
            .catch(err => console.error('[AUTH] Errore invio OTP:', err.message));
    } else {
        console.log(`[AUTH] OTP per ${inv.email}: ${otp}  (SMTP non configurato)`);
    }
    res.json({ sent: true, smtpConfigured: !!transporter });
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
    const { token, password, otp } = req.body || {};
    if (!token || !password || !otp)  return res.status(400).json({ error: 'Token, password e codice OTP obbligatori.' });
    if (password.length < 8)          return res.status(400).json({ error: 'Password di almeno 8 caratteri.' });
    const invitations = readJSON(INVITATIONS_FILE);
    const inv = invitations.find(i => i.token === token && !i.used);
    if (!inv)                                 return res.status(400).json({ error: 'Invito non valido o già utilizzato.' });
    if (new Date() > new Date(inv.expiresAt)) return res.status(400).json({ error: 'Invito scaduto.' });
    if (!inv.otp || inv.otpUsed)              return res.status(400).json({ error: 'Codice non richiesto o già utilizzato. Richiedi un nuovo codice.' });
    if (new Date() > new Date(inv.otpExpiry)) return res.status(400).json({ error: 'Codice scaduto. Richiedi un nuovo codice.' });
    const otpValid = await bcrypt.compare(otp.trim(), inv.otp);
    if (!otpValid) return res.status(400).json({ error: 'Codice non corretto.' });
    const users = readJSON(USERS_FILE);
    if (users.find(u => u.email.toLowerCase() === inv.email.toLowerCase() && !u.revokedAt))
        return res.status(409).json({ error: 'Utente già registrato.' });
    users.push({ id: uuidv4(), email: inv.email, passwordHash: await bcrypt.hash(password, 12), role: inv.role || 'user', createdAt: new Date().toISOString() });
    writeJSON(USERS_FILE, users);
    inv.used    = true;
    inv.otpUsed = true;
    writeJSON(INVITATIONS_FILE, invitations);
    res.json({ success: true, email: inv.email });
});

// ── GET /api/auth/users  (superadmin o admin) ───────────────────────────────
app.get('/api/auth/users', authenticate, requireAdmin, (req, res) => {
    // Restituisce solo gli utenti attivi; quelli revocati restano nel DB
    res.json(readJSON(USERS_FILE)
        .filter(u => !u.revokedAt)
        .map(({ passwordHash, revokedAt, ...u }) => u));
});

// ── DELETE /api/auth/users/:id  (superadmin o admin, + auto-eliminazione superadmin) ──
app.delete('/api/auth/users/:id', authenticate, requireAdmin, (req, res) => {
    const users = readJSON(USERS_FILE);
    const user  = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Utente non trovato.' });

    const myLevel     = ROLE_LEVEL[req.user.role] ?? 0;
    const targetLevel = ROLE_LEVEL[user.role]     ?? 0;

    // Auto-eliminazione: solo il superadmin può eliminare se stesso
    if (req.user.id === user.id) {
        if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Non puoi eliminare il tuo profilo.' });
        user.revokedAt    = new Date().toISOString();
        user.passwordHash = '';
        writeJSON(USERS_FILE, users);
        return res.json({ success: true, selfDeleted: true });
    }
    // Non si può eliminare un altro superadmin
    if (user.role === 'superadmin') return res.status(403).json({ error: 'Impossibile eliminare un superadmin.' });
    // Il target deve avere livello STRETTAMENTE inferiore a chi agisce
    if (targetLevel >= myLevel) return res.status(403).json({ error: 'Permessi insufficienti per eliminare questo utente.' });
    // Soft delete: conserva storico e dati, impedisce solo l'accesso
    user.revokedAt    = new Date().toISOString();
    user.passwordHash = '';
    writeJSON(USERS_FILE, users);
    res.json({ success: true });
});

// ── GET /api/auth/invitations  (superadmin o admin) ──────────────────────────
app.get('/api/auth/invitations', authenticate, requireAdmin, (req, res) => {
    res.json(readJSON(INVITATIONS_FILE).filter(i => !i.used && new Date() < new Date(i.expiresAt)));
});

// ── PATCH /api/auth/users/:id  — cambia ruolo (è richiesta per i superadmin) ───────
app.patch('/api/auth/users/:id', authenticate, requireAdmin, (req, res) => {
    const { role: newRole } = req.body || {};
    if (!ALL_ROLES.includes(newRole)) return res.status(400).json({ error: 'Ruolo non valido.' });
    const users = readJSON(USERS_FILE);
    const user  = users.find(u => u.id === req.params.id);
    if (!user)          return res.status(404).json({ error: 'Utente non trovato.' });
    if (user.revokedAt) return res.status(403).json({ error: 'Impossibile modificare un utente revocato.' });
    // L'account fondatore non può mai essere retrocesso
    if (user.email === SUPERADMIN_EMAIL)
        return res.status(403).json({ error: `L'account ${SUPERADMIN_EMAIL} non può essere modificato.` });

    const isSuperadminTarget = user.role === 'superadmin';
    const isSelfChange       = req.user.id === user.id;

    // Target è superadmin (o modifica del proprio ruolo da superadmin) → richiede consenso
    if (isSuperadminTarget || isSelfChange) {
        // Riverifica il ruolo dal DB (il JWT potrebbe essere obsoleto dopo un cambio ruolo)
        const allUsers    = readJSON(USERS_FILE);
        const currentUser = allUsers.find(u => u.id === req.user.id);
        if (!currentUser || currentUser.revokedAt || currentUser.role !== 'superadmin')
            return res.status(403).json({ error: 'Solo un superadmin può richiedere questo cambio.' });
        if (ROLE_LEVEL[newRole] > ROLE_LEVEL['superadmin'])
            return res.status(400).json({ error: 'Ruolo non valido.' });
        // Controlla che non esista già una richiesta pendente per questo target
        const requests = readJSON(REQUESTS_FILE);
        const existing = requests.find(r =>
            r.targetId === user.id && r.status === 'pending' && new Date() < new Date(r.expiresAt));
        if (existing) return res.status(409).json({
            error: 'Esiste già una richiesta pendente per questo utente.',
            requestId: existing.id
        });
        const newReq = {
            id:          uuidv4(),
            requestedBy: { id: req.user.id, email: req.user.email },
            targetId:    user.id,
            targetEmail: user.email,
            currentRole: user.role,
            newRole,
            createdAt:   new Date().toISOString(),
            expiresAt:   new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            status:      'pending'
        };
        requests.push(newReq);
        writeJSON(REQUESTS_FILE, requests);
        // Notifica email al target
        if (user.id !== req.user.id) {
            const ROLE_LABEL_MAP = { reader:'Reader', user:'Utente', admin:'Admin', superadmin:'Super Admin' };
            const subj = `[CryptocurrenciesSection] Richiesta cambio ruolo`;
            const link = `${PORTAL_URL}/portal`;
            const html = `<!DOCTYPE html><html lang="it"><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
<tr><td style="background:#030E1C;padding:28px 32px;"><span style="color:#00C8FF;font-size:1.2rem;font-weight:700;">CryptocurrenciesSection</span></td></tr>
<tr><td style="padding:32px;">
<h2 style="color:#1a2a3a;margin:0 0 12px;">Richiesta cambio ruolo</h2>
<p style="color:#4a5568;line-height:1.6;margin:0 0 8px;"><strong>${req.user.email}</strong> ha richiesto di cambiare il tuo ruolo da <strong>${ROLE_LABEL_MAP[user.role]}</strong> a <strong>${ROLE_LABEL_MAP[newRole]}</strong>.</p>
<p style="color:#4a5568;line-height:1.6;margin:0 0 28px;">Accedi al portale per approvare o ignorare la richiesta. Scade tra <strong>24 ore</strong>.</p>
<a href="${link}" style="display:inline-block;padding:14px 28px;background:#00C8FF;color:#030E1C;text-decoration:none;border-radius:8px;font-weight:700;">Vai al portale</a>
</td></tr>
<tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;"><p style="color:#a0aec0;font-size:0.75rem;margin:0;">Uso interno riservato.</p></td></tr>
</table></td></tr></table></body></html>`;
            if (transporter) {
                transporter.sendMail({ from: SMTP_FROM, to: user.email, subject: subj, html })
                    .catch(err => console.error('[AUTH] Errore email notifica:', err.message));
            } else {
                console.log(`[AUTH] Notifica cambio ruolo per ${user.email}: ${req.user.email} richiede ${newRole}`);
            }
        }
        return res.status(202).json({ requestCreated: true, requestId: newReq.id });
    }

    // Modifica standard (target non è superadmin)
    if (ROLE_LEVEL[newRole] > ROLE_LEVEL[req.user.role])
        return res.status(403).json({ error: 'Non puoi assegnare un ruolo superiore al tuo.' });
    if (ROLE_LEVEL[user.role] >= ROLE_LEVEL[req.user.role])
        return res.status(403).json({ error: 'Permessi insufficienti per modificare questo utente.' });
    user.role = newRole;
    writeJSON(USERS_FILE, users);
    res.json({ success: true, role: newRole });
});

// ── GET /api/auth/role-change-requests  (solo superadmin) ───────────────────────
app.get('/api/auth/role-change-requests', authenticate, requireSuperadmin, (req, res) => {
    res.json(readJSON(REQUESTS_FILE).filter(r =>
        r.status === 'pending' && new Date() < new Date(r.expiresAt)));
});

// ── POST /api/auth/role-change-requests/:id/approve  (solo superadmin) ───────────
app.post('/api/auth/role-change-requests/:id/approve', authenticate, requireSuperadmin, (req, res) => {
    const requests = readJSON(REQUESTS_FILE);
    const rcr      = requests.find(r => r.id === req.params.id && r.status === 'pending');
    if (!rcr) return res.status(404).json({ error: 'Richiesta non trovata o già gestita.' });
    if (new Date() > new Date(rcr.expiresAt)) {
        rcr.status = 'expired'; writeJSON(REQUESTS_FILE, requests);
        return res.status(400).json({ error: 'Richiesta scaduta.' });
    }
    // L'approvatore non deve essere il richiedente
    // Il TARGET può approvare la modifica del proprio ruolo (consenso diretto)
    if (req.user.id === rcr.requestedBy.id)
        return res.status(403).json({ error: 'Non puoi approvare la tua stessa richiesta.' });
    // Applica il cambio ruolo
    const users = readJSON(USERS_FILE);
    const user  = users.find(u => u.id === rcr.targetId);
    if (!user) return res.status(404).json({ error: 'Utente target non trovato.' });
    // Protezione extra: l'account fondatore non può mai essere retrocesso
    if (user.email === SUPERADMIN_EMAIL) {
        rcr.status = 'cancelled'; rcr.cancelledAt = new Date().toISOString();
        writeJSON(REQUESTS_FILE, requests);
        return res.status(403).json({ error: `L'account ${SUPERADMIN_EMAIL} non può essere modificato.` });
    }
    user.role = rcr.newRole;
    writeJSON(USERS_FILE, users);
    rcr.status     = 'approved';
    rcr.approvedBy = { id: req.user.id, email: req.user.email };
    rcr.approvedAt = new Date().toISOString();
    writeJSON(REQUESTS_FILE, requests);
    res.json({ success: true, newRole: rcr.newRole });
});

// ── DELETE /api/auth/role-change-requests/:id  — annulla richiesta (solo superadmin) ──
app.delete('/api/auth/role-change-requests/:id', authenticate, requireSuperadmin, (req, res) => {
    const requests = readJSON(REQUESTS_FILE);
    const rcr      = requests.find(r => r.id === req.params.id && r.status === 'pending');
    if (!rcr) return res.status(404).json({ error: 'Richiesta non trovata.' });
    rcr.status      = 'cancelled';
    rcr.cancelledAt = new Date().toISOString();
    writeJSON(REQUESTS_FILE, requests);
    res.json({ success: true });
});

// ── DELETE /api/auth/invitations/:token  — annulla invito (superadmin o admin) ─
app.delete('/api/auth/invitations/:token', authenticate, requireAdmin, (req, res) => {
    const invitations = readJSON(INVITATIONS_FILE);
    const inv = invitations.find(i => i.token === req.params.token && !i.used);
    if (!inv) return res.status(404).json({ error: 'Invito non trovato o già utilizzato.' });
    inv.used = true;
    writeJSON(INVITATIONS_FILE, invitations);
    res.json({ success: true });
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
