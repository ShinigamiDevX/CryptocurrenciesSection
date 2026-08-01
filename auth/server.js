'use strict';
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { Users, Invitations, ProfileChangeRequests, Notifications, profileDefaults } = require('./db');
const { mountCorsiRoutes } = require('./corsi-content');

const app  = express();
app.use(express.json({ limit: '1mb' }));

const PORT             = process.env.PORT || 4000;
const DATA_DIR         = path.join(__dirname, 'data');
const SECRET_FILE      = path.join(DATA_DIR, 'secret.key');
const SUPERADMIN_EMAIL = 'portalecrypto@proton.me';
const SUPERADMIN_NOME  = 'Super Admin';
const SUPERADMIN_COGNOME = '';
const PORTAL_URL       = (process.env.PORTAL_URL || 'https://192.168.4.77:5200').replace(/\/$/, '');
const ROLE_LEVEL       = { reader: 0, user: 1, admin: 2, superadmin: 3 };
const ALL_ROLES        = ['reader', 'user', 'admin', 'superadmin'];
/** Schede dashboard assegnabili in invito (gestione-utenti resta solo per admin/superadmin). */
const ASSIGNABLE_CARDS = ['blockchain', 'osint', 'chainholder', 'corsi', 'cluster', 'ai', 'analisi-report'];

function defaultCardsForRole(role) {
    if (role === 'reader') return ['corsi'];
    return ASSIGNABLE_CARDS.slice();
}

function sanitizeCards(input) {
    if (!Array.isArray(input)) return null;
    const allowed = new Set(ASSIGNABLE_CARDS);
    const out = [];
    for (const c of input) {
        if (typeof c === 'string' && allowed.has(c) && !out.includes(c)) out.push(c);
    }
    return out.length ? out : null;
}

function cardsFromStored(raw, role) {
    if (raw == null || String(raw).trim() === '') return defaultCardsForRole(role);
    try {
        const parsed = sanitizeCards(JSON.parse(raw));
        return parsed || defaultCardsForRole(role);
    } catch {
        return defaultCardsForRole(role);
    }
}

function cardsToStored(cards) {
    return JSON.stringify(cards);
}

/** La categoria Docente è selezionabile solo per i ruoli Utente e Admin. */
function roleCanBeDocente(role) {
    return role === 'user' || role === 'admin';
}

function normalizeDocente(role, flag) {
    return roleCanBeDocente(role) && !!flag;
}

/**
 * Super Admin ha sempre tutti i permessi (presenti e futuri).
 * Altre categorie: mappa capability → regola specifica.
 */
function userCan(user, capability) {
    if (!user || user.revokedAt) return false;
    if (user.role === 'superadmin') return true;
    switch (capability) {
        case 'corsi.manage':
            return normalizeDocente(user.role, user.docente);
        case 'admin.panel':
            return user.role === 'admin';
        default:
            return false;
    }
}

function isLockedProfile(email) {
    return !!(email && email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase());
}

/** Estrae e normalizza i campi anagrafici dal body. Obbligatori: nome, cognome, grado. */
function isValidIsoDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const [y, m, d] = iso.split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function parseProfileBody(body) {
    const b = body || {};
    const nome = String(b.nome || '').trim();
    const cognome = String(b.cognome || '').trim();
    const grado = String(b.grado || '').trim();
    if (!nome || !cognome || !grado) {
        return { error: 'Nome, cognome e grado sono obbligatori.' };
    }
    const dataNascita = String(b.dataNascita || '').trim();
    if (dataNascita && !isValidIsoDate(dataNascita)) {
        return { error: 'Data di nascita non valida.' };
    }
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    if (dataNascita && dataNascita > todayIso) {
        return { error: 'La data di nascita non può essere nel futuro.' };
    }
    const profile = profileDefaults({
        nome,
        cognome,
        grado,
        dataNascita,
        luogoNascita: String(b.luogoNascita || '').trim(),
        luogoNascitaTipo: String(b.luogoNascitaTipo || '').trim(),
        luogoNascitaProvincia: String(b.luogoNascitaProvincia || '').trim(),
        luogoNascitaComune: String(b.luogoNascitaComune || '').trim(),
        luogoNascitaStato: String(b.luogoNascitaStato || '').trim(),
        residenza: String(b.residenza || '').trim(),
        residenzaTipo: String(b.residenzaTipo || '').trim(),
        residenzaProvincia: String(b.residenzaProvincia || '').trim(),
        residenzaComune: String(b.residenzaComune || '').trim(),
        residenzaStato: String(b.residenzaStato || '').trim(),
        residenzaIndirizzo: String(b.residenzaIndirizzo || '').trim(),
        residenzaCivico: String(b.residenzaCivico || '').trim(),
        domicilio: String(b.domicilio || '').trim(),
        domicilioTipo: String(b.domicilioTipo || '').trim(),
        domicilioProvincia: String(b.domicilioProvincia || '').trim(),
        domicilioComune: String(b.domicilioComune || '').trim(),
        domicilioStato: String(b.domicilioStato || '').trim(),
        domicilioIndirizzo: String(b.domicilioIndirizzo || '').trim(),
        domicilioCivico: String(b.domicilioCivico || '').trim(),
        domicilioComeResidenza: !!b.domicilioComeResidenza,
        telefono: String(b.telefono || '').trim(),
        telefonoPrefisso: String(b.telefonoPrefisso || '+39').trim() || '+39',
    });
    // profilo API: booleano più comodo per i client
    return {
        profile: {
            ...profile,
            domicilioComeResidenza: !!profile.domicilioComeResidenza,
        },
    };
}

function publicProfile(user, locked) {
    const emptyGeo = (prefix, withAddress = false) => {
        const out = {
            [prefix]: '',
            [`${prefix}Tipo`]: '',
            [`${prefix}Provincia`]: '',
            [`${prefix}Comune`]: '',
            [`${prefix}Stato`]: '',
        };
        if (withAddress) {
            out[`${prefix}Indirizzo`] = '';
            out[`${prefix}Civico`] = '';
        }
        return out;
    };
    if (locked) {
        return {
            email: user.email,
            role: user.role,
            nome: SUPERADMIN_NOME,
            cognome: SUPERADMIN_COGNOME,
            grado: '',
            dataNascita: '',
            ...emptyGeo('luogoNascita'),
            ...emptyGeo('residenza', true),
            ...emptyGeo('domicilio', true),
            domicilioComeResidenza: false,
            telefono: '',
            telefonoPrefisso: '+39',
            canEdit: false,
        };
    }
    return {
        email: user.email,
        role: user.role,
        nome: user.nome || '',
        cognome: user.cognome || '',
        grado: user.grado || '',
        dataNascita: user.dataNascita || '',
        luogoNascita: user.luogoNascita || '',
        luogoNascitaTipo: user.luogoNascitaTipo || '',
        luogoNascitaProvincia: user.luogoNascitaProvincia || '',
        luogoNascitaComune: user.luogoNascitaComune || '',
        luogoNascitaStato: user.luogoNascitaStato || '',
        residenza: user.residenza || '',
        residenzaTipo: user.residenzaTipo || '',
        residenzaProvincia: user.residenzaProvincia || '',
        residenzaComune: user.residenzaComune || '',
        residenzaStato: user.residenzaStato || '',
        residenzaIndirizzo: user.residenzaIndirizzo || '',
        residenzaCivico: user.residenzaCivico || '',
        domicilio: user.domicilio || '',
        domicilioTipo: user.domicilioTipo || '',
        domicilioProvincia: user.domicilioProvincia || '',
        domicilioComune: user.domicilioComune || '',
        domicilioStato: user.domicilioStato || '',
        domicilioIndirizzo: user.domicilioIndirizzo || '',
        domicilioCivico: user.domicilioCivico || '',
        domicilioComeResidenza: !!user.domicilioComeResidenza,
        telefono: user.telefono || '',
        telefonoPrefisso: user.telefonoPrefisso || '+39',
        canEdit: true,
    };
}

function notifyUser(userId, type, title, body, link) {
    if (!userId) return;
    Notifications.insert({
        id: uuidv4(),
        userId,
        type,
        title,
        body: body || '',
        link: link || '',
        createdAt: new Date().toISOString(),
    });
}

function notifyAdmins(type, title, body, link, exceptUserId) {
    Users.findActive()
        .filter(u => (u.role === 'admin' || u.role === 'superadmin') && u.id !== exceptUserId)
        .forEach(u => notifyUser(u.id, type, title, body, link));
}

/** Notifica Super Admin e utenti con categoria Docente (escluso l’attore). */
function notifyCorsiEditors(exceptUserId, type, title, body, link) {
    Users.findActive()
        .filter((u) => u.id !== exceptUserId && userCan(u, 'corsi.manage'))
        .forEach((u) => notifyUser(u.id, type, title, body, link));
}

const ROLE_LABEL = { reader: 'Reader', user: 'Utente', admin: 'Admin', superadmin: 'Super Admin' };
const CARD_LABEL = {
    blockchain: 'Tracciamento Blockchain',
    osint: 'OSINT & Intelligence',
    chainholder: 'Chainholder',
    corsi: 'Corsi',
    cluster: 'Cluster',
    ai: 'AI',
    'analisi-report': 'Analisi Report',
};

function actorLabel(user) {
    if (!user) return 'un amministratore';
    const role = ROLE_LABEL[user.role] || user.role || 'Admin';
    const cognome = String(user.cognome || '').trim();
    const nome = String(user.nome || '').trim();
    const person = cognome && nome ? `${cognome.toUpperCase()} ${nome}` : (nome || cognome);
    if (person) return `${person} (${role})`;
    return `${user.email || 'amministratore'} (${role})`;
}

function formatDateIT(iso) {
    const s = String(iso || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
}

function formatTelDisplay(p) {
    const num = String(p?.telefono || '').trim();
    if (!num) return '';
    const pref = String(p?.telefonoPrefisso || '').trim();
    return pref ? `${pref} ${num}` : num;
}

function profileDiffLines(before, after) {
    const lines = [];
    const push = (label, oldVal, newVal) => {
        const a = String(oldVal ?? '').trim() || '—';
        const b = String(newVal ?? '').trim() || '—';
        if (a === b) return;
        lines.push(`${label}: «${a}» → «${b}»`);
    };
    push('Nome', before.nome, after.nome);
    push('Cognome', before.cognome, after.cognome);
    push('Grado', before.grado, after.grado);
    push('Data di nascita', formatDateIT(before.dataNascita), formatDateIT(after.dataNascita));
    push('Luogo di nascita', before.luogoNascita, after.luogoNascita);
    push('Residenza', before.residenza, after.residenza);
    const beforeDom = before.domicilioComeResidenza ? 'come residenza' : (before.domicilio || '');
    const afterDom = after.domicilioComeResidenza ? 'come residenza' : (after.domicilio || '');
    push('Domicilio', beforeDom, afterDom);
    push('Telefono', formatTelDisplay(before), formatTelDisplay(after));
    return lines;
}

function cardsDiffLine(beforeCards, afterCards) {
    const norm = arr => (arr || []).slice().sort().join('|');
    if (norm(beforeCards) === norm(afterCards)) return null;
    const label = arr => (arr && arr.length ? arr.map(c => CARD_LABEL[c] || c).join(', ') : 'nessuna');
    return `Schede portale: «${label(beforeCards)}» → «${label(afterCards)}»`;
}

function summarizeChanges(lines) {
    if (!lines.length) return 'Nessuna variazione nei dati principali.';
    return lines.join('; ');
}

function profileSnapshot(p) {
    const parts = [
        `${String(p.cognome || '').toUpperCase()} ${p.nome || ''}`.trim(),
        p.grado || '',
        p.dataNascita ? `nato/a il ${formatDateIT(p.dataNascita)}` : '',
        p.luogoNascita ? `luogo: ${p.luogoNascita}` : '',
        p.residenza ? `residenza: ${p.residenza}` : '',
        p.domicilioComeResidenza ? 'domicilio: come residenza' : (p.domicilio ? `domicilio: ${p.domicilio}` : ''),
        formatTelDisplay(p) ? `tel: ${formatTelDisplay(p)}` : '',
    ].filter(Boolean);
    return parts.join(' · ');
}

const SMTP_HOST = process.env.SMTP_HOST, SMTP_PORT = parseInt(process.env.SMTP_PORT||'587',10);
const SMTP_SECURE = process.env.SMTP_SECURE==='true', SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS, SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({ host:SMTP_HOST, port:SMTP_PORT, secure:SMTP_SECURE, auth:{user:SMTP_USER,pass:SMTP_PASS}, tls:{rejectUnauthorized:false} });
    console.log(`[AUTH] SMTP: ${SMTP_HOST}:${SMTP_PORT}`);
} else { console.log('[AUTH] SMTP non configurato.'); }

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true});
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (fs.existsSync(SECRET_FILE)) { JWT_SECRET = fs.readFileSync(SECRET_FILE,'utf-8').trim(); }
    else { JWT_SECRET = crypto.randomBytes(48).toString('hex'); fs.writeFileSync(SECRET_FILE,JWT_SECRET,{mode:0o600}); }
}

(async()=>{
    const existing = Users.findByEmail(SUPERADMIN_EMAIL);
    if (!existing) {
        Users.insert({
            id: uuidv4(),
            email: SUPERADMIN_EMAIL,
            passwordHash: await bcrypt.hash('1234', 12),
            role: 'superadmin',
            createdAt: new Date().toISOString(),
            mustChangePassword: true,
            nome: SUPERADMIN_NOME,
            cognome: SUPERADMIN_COGNOME,
            grado: '',
        });
        console.log('[AUTH] Superadmin creato con password iniziale: 1234');
    } else {
        // Profilo di sistema fisso: Super Admin, senza cognome né grado
        Users.updateProfile(existing.id, { nome: SUPERADMIN_NOME, cognome: SUPERADMIN_COGNOME, grado: '' });
    }
})();

async function sendInviteEmail(toEmail, inviteToken, assignedRole) {
    const link=`${PORTAL_URL}/register?token=${inviteToken}`;
    const rLabel={reader:'Reader',user:'Utente',admin:'Admin',superadmin:'Super Admin'}[assignedRole]||assignedRole;
    const html=`<!DOCTYPE html><html lang="it"><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;"><tr><td style="background:#030E1C;padding:28px 32px;"><span style="color:#00C8FF;font-size:1.2rem;font-weight:700;">CryptocurrenciesSection</span></td></tr><tr><td style="padding:32px;"><h2 style="color:#1a2a3a;margin:0 0 12px;">Sei stato invitato</h2><p style="color:#4a5568;line-height:1.6;margin:0 0 8px;">Ruolo: <strong>${rLabel}</strong>. Link valido <strong>15 minuti</strong>.</p><a href="${link}" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#00C8FF;color:#030E1C;text-decoration:none;border-radius:8px;font-weight:700;">Registrati</a><p style="color:#a0aec0;font-size:0.8rem;margin-top:16px;word-break:break-all;">${link}</p></td></tr></table></td></tr></table></body></html>`;
    if (transporter) { await transporter.sendMail({from:SMTP_FROM,to:toEmail,subject:`[CryptocurrenciesSection] Invito come ${rLabel}`,html}); console.log(`[AUTH] Email invito → ${toEmail}`); }
    else { console.log(`[AUTH] Invito (${rLabel}) per ${toEmail}: ${link}`); }
}

async function sendPasswordResetEmail(toEmail, tempPassword) {
    const link = `${PORTAL_URL}/login.html`;
    const safePass = String(tempPassword).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const html = `<!DOCTYPE html><html lang="it"><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;"><tr><td style="background:#030E1C;padding:28px 32px;"><span style="color:#00C8FF;font-size:1.2rem;font-weight:700;">CryptocurrenciesSection</span></td></tr><tr><td style="padding:32px;"><h2 style="color:#1a2a3a;margin:0 0 12px;">Reset password</h2><p style="color:#4a5568;line-height:1.6;margin:0 0 12px;">Un super amministratore ha resettato la password del tuo account.</p><p style="color:#4a5568;line-height:1.6;margin:0 0 8px;">Password temporanea:</p><p style="margin:0 0 16px;padding:12px 16px;background:#f0f7fa;border-radius:8px;font-family:Consolas,Monaco,monospace;font-size:1.05rem;font-weight:700;color:#030E1C;letter-spacing:0.04em;">${safePass}</p><p style="color:#4a5568;line-height:1.6;margin:0 0 8px;">Al primo accesso ti verrà chiesto di impostare una nuova password.</p><a href="${link}" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#00C8FF;color:#030E1C;text-decoration:none;border-radius:8px;font-weight:700;">Accedi al portale</a><p style="color:#a0aec0;font-size:0.8rem;margin-top:16px;word-break:break-all;">${link}</p></td></tr></table></td></tr></table></body></html>`;
    if (!transporter) {
        console.log(`[AUTH] Reset password per ${toEmail} (SMTP off): ${tempPassword}`);
        return false;
    }
    await transporter.sendMail({
        from: SMTP_FROM,
        to: toEmail,
        subject: '[CryptocurrenciesSection] Password resettata',
        html,
    });
    console.log(`[AUTH] Email reset password → ${toEmail}`);
    return true;
}

function authenticate(req,res,next){
    const h=req.headers['authorization'], t=h&&h.startsWith('Bearer ')?h.slice(7):null;
    if (!t) return res.status(401).json({error:'Token mancante.'});
    try {
        req.user=jwt.verify(t,JWT_SECRET);
        if (req.user.purpose === 'login_otp') return res.status(401).json({error:'Token non valido.'});
        next();
    } catch { res.status(401).json({error:'Token non valido o scaduto.'}); }
}
function requireAdmin(req,res,next){ if(req.user.role!=='superadmin'&&req.user.role!=='admin') return res.status(403).json({error:'Accesso negato.'}); next(); }
function requireSuperadmin(req,res,next){ if(req.user.role!=='superadmin') return res.status(403).json({error:'Solo i super admin possono eseguire questa operazione.'}); next(); }
/** Gestione contenuti Corsi: Docente oppure Super Admin (tutti i permessi). */
function requireDocente(req, res, next) {
    const user = Users.findById(req.user.id);
    if (!userCan(user, 'corsi.manage')) {
        return res.status(403).json({ error: 'Solo i docenti o i Super Admin possono gestire i contenuti dei corsi.' });
    }
    next();
}

function otpEmailHtml(otp) {
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;"><tr><td style="background:#030E1C;padding:28px 32px;"><span style="color:#00C8FF;font-size:1.2rem;font-weight:700;">CryptocurrenciesSection</span></td></tr><tr><td style="padding:32px;"><h2 style="color:#1a2a3a;margin:0 0 12px;">Codice di verifica</h2><p style="color:#4a5568;margin:0 0 20px;">Valido <strong>10 minuti</strong>.</p><div style="background:#f0f9ff;border:2px solid #00C8FF;border-radius:10px;padding:20px 32px;text-align:center;letter-spacing:0.3rem;font-size:2.2rem;font-weight:700;color:#030E1C;">${otp}</div></td></tr></table></td></tr></table></body></html>`;
}

async function sendVerificationOtpEmail(toEmail, otp) {
    const html = otpEmailHtml(otp);
    if (transporter) {
        await transporter.sendMail({
            from: SMTP_FROM,
            to: toEmail,
            subject: '[CryptocurrenciesSection] Codice di verifica',
            html,
        });
        console.log(`[AUTH] OTP email → ${toEmail}`);
        return true;
    }
    console.log(`[AUTH] OTP per ${toEmail}: ${otp}`);
    return false;
}

async function issueLoginOtp(user) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    Users.setLoginOtp(user.id, await bcrypt.hash(otp, 10), expiry);
    let emailSent = false;
    try {
        emailSent = await sendVerificationOtpEmail(user.email, otp);
    } catch (e) {
        console.error('[AUTH] OTP login email:', e.message);
        throw e;
    }
    const challenge = jwt.sign(
        { id: user.id, email: user.email, purpose: 'login_otp' },
        JWT_SECRET,
        { expiresIn: '10m' }
    );
    return { challenge, emailSent };
}

function issueSessionToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, mustChangePassword: !!user.mustChangePassword },
        JWT_SECRET,
        { expiresIn: '12h' }
    );
}

app.post('/api/auth/login', async(req,res)=>{
    const {email,password}=req.body||{};
    if (!email||!password) return res.status(400).json({error:'Email e password obbligatori.'});
    const user=Users.findByEmail(email);
    if (!user||user.revokedAt||!(await bcrypt.compare(password,user.passwordHash))) {
        return res.status(401).json({error:'Credenziali non valide.'});
    }
    try {
        const { challenge, emailSent } = await issueLoginOtp(user);
        res.json({
            requiresOtp: true,
            challenge,
            emailSent,
            smtpConfigured: !!transporter,
            message: emailSent
                ? 'Ti abbiamo inviato un codice di verifica via email.'
                : 'Codice generato (SMTP non configurato: controlla i log del server).',
        });
    } catch {
        res.status(502).json({ error: 'Impossibile inviare il codice di verifica. Riprova.' });
    }
});

app.post('/api/auth/login/verify-otp', async (req, res) => {
    const { challenge, otp } = req.body || {};
    if (!challenge || !otp) return res.status(400).json({ error: 'Codice di verifica obbligatorio.' });
    let payload;
    try {
        payload = jwt.verify(challenge, JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Sessione di verifica scaduta. Effettua di nuovo il login.' });
    }
    if (payload.purpose !== 'login_otp' || !payload.id) {
        return res.status(401).json({ error: 'Sessione di verifica non valida.' });
    }
    const user = Users.findById(payload.id);
    if (!user || user.revokedAt) return res.status(401).json({ error: 'Utente non valido.' });
    if (!user.loginOtp || !user.loginOtpExpiry) {
        return res.status(400).json({ error: 'Nessun codice attivo. Richiedi un nuovo codice.' });
    }
    if (new Date() > new Date(user.loginOtpExpiry)) {
        Users.clearLoginOtp(user.id);
        return res.status(400).json({ error: 'Codice scaduto. Richiedi un nuovo codice.' });
    }
    if (!(await bcrypt.compare(String(otp).trim(), user.loginOtp))) {
        return res.status(401).json({ error: 'Codice non corretto.' });
    }
    Users.clearLoginOtp(user.id);
    const token = issueSessionToken(user);
    res.json({
        token,
        role: user.role,
        mustChangePassword: !!user.mustChangePassword,
    });
});

app.post('/api/auth/login/resend-otp', async (req, res) => {
    const { challenge } = req.body || {};
    if (!challenge) return res.status(400).json({ error: 'Sessione di verifica mancante.' });
    let payload;
    try {
        payload = jwt.verify(challenge, JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Sessione di verifica scaduta. Effettua di nuovo il login.' });
    }
    if (payload.purpose !== 'login_otp' || !payload.id) {
        return res.status(401).json({ error: 'Sessione di verifica non valida.' });
    }
    const user = Users.findById(payload.id);
    if (!user || user.revokedAt) return res.status(401).json({ error: 'Utente non valido.' });
    try {
        const result = await issueLoginOtp(user);
        res.json({
            requiresOtp: true,
            challenge: result.challenge,
            emailSent: result.emailSent,
            smtpConfigured: !!transporter,
        });
    } catch {
        res.status(502).json({ error: 'Impossibile inviare il codice di verifica. Riprova.' });
    }
});

app.get('/api/auth/verify', authenticate,(req,res)=>{
    const user=Users.findById(req.user.id);
    if (!user||user.revokedAt) return res.status(401).json({error:'Sessione non valida.'});
    res.json({
        valid: true,
        id: user.id,
        email: user.email,
        role: user.role,
        cards: cardsFromStored(user.allowedCards, user.role),
        docente: normalizeDocente(user.role, user.docente),
        canManageCorsi: userCan(user, 'corsi.manage'),
    });
});

app.post('/api/auth/send-otp', async(req,res)=>{
    const {token}=req.body||{};
    if (!token) return res.status(400).json({error:'Token mancante.'});
    const inv=Invitations.findByToken(token);
    if (!inv||inv.used||new Date()>new Date(inv.expiresAt)) return res.status(400).json({error:'Invito non valido o scaduto.'});
    const otp=Math.floor(100000+Math.random()*900000).toString();
    Invitations.setOtp(token,await bcrypt.hash(otp,10),new Date(Date.now()+10*60*1000).toISOString());
    try {
        const emailSent = await sendVerificationOtpEmail(inv.email, otp);
        res.json({sent:true,smtpConfigured:!!transporter,emailSent});
    } catch (e) {
        console.error('[AUTH] OTP email:', e.message);
        res.status(502).json({error:'Impossibile inviare il codice. Riprova.'});
    }
});

app.get('/api/auth/invite-info',(req,res)=>{
    const {token}=req.query;
    if (!token) return res.status(400).json({error:'Token mancante.'});
    const inv=Invitations.findByToken(token);
    if (!inv||inv.used) return res.status(404).json({error:'Invito non valido o già utilizzato.'});
    if (new Date()>new Date(inv.expiresAt)) return res.status(400).json({error:'Invito scaduto.'});
    res.json({email:inv.email});
});

app.post('/api/auth/register', async(req,res)=>{
    try {
        const { token, password, otp } = req.body || {};
        if (!token||!password||!otp) return res.status(400).json({error:'Token, password e codice OTP obbligatori.'});
        if (password.length<8) return res.status(400).json({error:'Password di almeno 8 caratteri.'});
        const parsed = parseProfileBody(req.body);
        if (parsed.error) return res.status(400).json({error: parsed.error});
        const inv=Invitations.findByToken(token);
        if (!inv||inv.used) return res.status(400).json({error:'Invito non valido o già utilizzato.'});
        if (new Date()>new Date(inv.expiresAt)) return res.status(400).json({error:'Invito scaduto.'});
        if (!inv.otp||inv.otpUsed) return res.status(400).json({error:'Codice non richiesto o già utilizzato.'});
        if (new Date()>new Date(inv.otpExpiry)) return res.status(400).json({error:'Codice scaduto. Richiedi un nuovo codice.'});
        if (!(await bcrypt.compare(otp.trim(),inv.otp))) return res.status(400).json({error:'Codice non corretto.'});
        const ex=Users.findByEmail(inv.email);
        if (ex&&!ex.revokedAt) return res.status(409).json({error:'Utente già registrato. Usa il login.'});
        const passwordHash=await bcrypt.hash(password,12);
        const allowedCards = inv.allowedCards && String(inv.allowedCards).trim()
            ? inv.allowedCards
            : cardsToStored(defaultCardsForRole(inv.role || 'user'));
        const assignedRole = inv.role || 'user';
        const profile={
            passwordHash,
            role: assignedRole,
            createdAt:new Date().toISOString(),
            mustChangePassword:false,
            allowedCards,
            docente: normalizeDocente(assignedRole, inv.docente),
            ...parsed.profile,
        };
        if (ex&&ex.revokedAt) {
            Users.reactivate(ex.id, profile);
        } else {
            Users.insert({id:uuidv4(),email:inv.email,...profile});
        }
        Invitations.markUsed(token);
        res.json({success:true,email:inv.email});
    } catch (err) {
        console.error('[AUTH] register error:', err.message);
        res.status(500).json({error:'Errore interno durante la registrazione. Riprovare.'});
    }
});

app.post('/api/auth/invite', authenticate, requireAdmin, async(req,res)=>{
    const {email,role:requestedRole,cards,docente}=req.body||{};
    if (!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Email non valida.'});
    const myLevel=ROLE_LEVEL[req.user.role]??0;
    const assignedRole=(ALL_ROLES.includes(requestedRole)&&ROLE_LEVEL[requestedRole]<=myLevel)?requestedRole:'user';
    const selectedCards = cards !== undefined ? sanitizeCards(cards) : defaultCardsForRole(assignedRole);
    if (!selectedCards) return res.status(400).json({error:'Seleziona almeno una scheda del portale.'});
    const isDocente = normalizeDocente(assignedRole, docente);
    const ex=Users.findByEmail(email);
    if (ex&&!ex.revokedAt) return res.status(409).json({error:'Utente già registrato.'});
    Invitations.invalidateByEmail(email);
    const token=uuidv4();
    Invitations.insert({
        token,
        email,
        role: assignedRole,
        invitedBy: req.user.email,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now()+15*60*1000).toISOString(),
        allowedCards: cardsToStored(selectedCards),
        docente: isDocente,
    });
    sendInviteEmail(email,token,assignedRole).catch(e=>console.error('[AUTH] Email invito:',e.message));
    res.json({token,link:`/register?token=${token}`,role:assignedRole,cards:selectedCards,docente:isDocente,emailSent:!!transporter});
});

app.get('/api/auth/users', authenticate, requireAdmin,(req,res)=>{
    res.json(Users.findActive()
        .filter(u => u.email !== SUPERADMIN_EMAIL)  // il fondatore non compare nella lista
        .map(({passwordHash, ...u}) => {
            const role = ALL_ROLES.includes(u.role) ? u.role : 'user';
            return {
                ...u,
                role,
                cards: cardsFromStored(u.allowedCards, role),
                docente: normalizeDocente(role, u.docente),
            };
        }));
});

app.delete('/api/auth/users/:id', authenticate, requireAdmin,(req,res)=>{
    const user=Users.findById(req.params.id);
    if (!user) return res.status(404).json({error:'Utente non trovato.'});
    if (user.role==='superadmin') return res.status(403).json({error:'I superadmin non possono essere eliminati.'});
    if (req.user.id===user.id) return res.status(403).json({error:'Non puoi eliminare il tuo profilo.'});
    const myLevel=ROLE_LEVEL[req.user.role]??0, targetLevel=ROLE_LEVEL[user.role]??0;
    if (targetLevel>=myLevel) return res.status(403).json({error:'Permessi insufficienti.'});
    Users.revoke(user.id);
    res.json({success:true});
});

app.patch('/api/auth/users/:id', authenticate, requireAdmin,(req,res)=>{
    const {role:newRole}=req.body||{};
    if (!ALL_ROLES.includes(newRole)) return res.status(400).json({error:'Ruolo non valido.'});
    const user=Users.findById(req.params.id);
    if (!user) return res.status(404).json({error:'Utente non trovato.'});
    if (user.revokedAt) return res.status(403).json({error:'Utente revocato.'});
    if (user.role==='superadmin') return res.status(403).json({error:'I superadmin non possono essere modificati.'});
    if (req.user.id===user.id) return res.status(403).json({error:'Non puoi modificare il tuo ruolo.'});
    if (ROLE_LEVEL[newRole]>ROLE_LEVEL[req.user.role]) return res.status(403).json({error:'Non puoi assegnare un ruolo superiore al tuo.'});
    if (ROLE_LEVEL[user.role]>=ROLE_LEVEL[req.user.role]) return res.status(403).json({error:'Permessi insufficienti.'});
    const prevRole = user.role;
    Users.updateRole(user.id,newRole);
    if (!roleCanBeDocente(newRole)) Users.updateDocente(user.id, false);
    const actor = Users.findById(req.user.id) || req.user;
    notifyUser(
        user.id,
        'role_changed',
        'Ruolo modificato',
        `${actorLabel(actor)} ha cambiato il tuo ruolo da ${ROLE_LABEL[prevRole] || prevRole} a ${ROLE_LABEL[newRole] || newRole}.`,
        '/profilo'
    );
    res.json({success:true,role:newRole});
});

/** Superadmin: reset password di qualsiasi ruolo → email con password temporanea. */
app.post('/api/auth/users/:id/reset-password', authenticate, requireSuperadmin, async (req, res) => {
    const user = Users.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utente non trovato.' });
    if (user.revokedAt) return res.status(403).json({ error: 'Utente revocato.' });
    if (req.user.id === user.id) return res.status(403).json({ error: 'Non puoi resettare la tua password da qui.' });
    if (isLockedProfile(user.email)) return res.status(403).json({ error: 'Il profilo di sistema non può essere resettato.' });

    const tempPassword = crypto.randomBytes(9).toString('base64url');
    Users.resetPassword(user.id, await bcrypt.hash(tempPassword, 12));

    let emailSent = false;
    try {
        emailSent = await sendPasswordResetEmail(user.email, tempPassword);
    } catch (e) {
        console.error('[AUTH] Email reset password:', e.message);
        return res.status(502).json({
            error: 'Password resettata ma invio email fallito. Riprova o comunica la password temporanea all\'utente.',
            temporaryPassword: tempPassword,
            emailSent: false,
        });
    }

    notifyUser(
        user.id,
        'password_reset',
        'Password resettata da Super Admin',
        `${actorLabel(Users.findById(req.user.id) || req.user)} ha resettato la password del tuo account${emailSent ? ' e ti ha inviato un\'email' : ''} con una password temporanea. Al prossimo accesso dovrai impostarne una nuova.`,
        '/login.html'
    );

    if (!emailSent) {
        return res.json({
            success: true,
            emailSent: false,
            temporaryPassword: tempPassword,
            warning: 'SMTP non configurato: comunica manualmente la password temporanea all\'utente.',
        });
    }
    res.json({ success: true, emailSent: true });
});

app.get('/api/auth/invitations', authenticate, requireAdmin,(req,res)=>{
    res.json(Invitations.findActive().map(i => ({
        ...i,
        cards: cardsFromStored(i.allowedCards, i.role),
        docente: normalizeDocente(i.role, i.docente),
    })));
});

app.delete('/api/auth/invitations/:token', authenticate, requireAdmin,(req,res)=>{
    const inv=Invitations.findByToken(req.params.token);
    if (!inv||inv.used) return res.status(404).json({error:'Invito non trovato.'});
    Invitations.cancel(req.params.token);
    res.json({success:true});
});

app.post('/api/auth/change-password', authenticate, async(req,res)=>{
    const {currentPassword,newPassword}=req.body||{};
    if (!currentPassword||!newPassword) return res.status(400).json({error:'Parametri mancanti.'});
    if (newPassword.length<8) return res.status(400).json({error:'Password di almeno 8 caratteri.'});
    const user=Users.findById(req.user.id);
    if (!user||!(await bcrypt.compare(currentPassword,user.passwordHash))) return res.status(401).json({error:'Password attuale non corretta.'});
    Users.changePassword(user.id,await bcrypt.hash(newPassword,12));
    const token=jwt.sign({id:user.id,email:user.email,role:user.role,mustChangePassword:false},JWT_SECRET,{expiresIn:'12h'});
    res.json({success:true,token});
});

// ── PATCH /api/auth/users/:id/profile  (admin/superadmin — modifica diretta) ─
app.patch('/api/auth/users/:id/profile', authenticate, requireAdmin,(req,res)=>{
    const parsed = parseProfileBody(req.body);
    if (parsed.error) return res.status(400).json({error: parsed.error});
    const user=Users.findById(req.params.id);
    if (!user) return res.status(404).json({error:'Utente non trovato.'});
    if (isLockedProfile(user.email)) return res.status(403).json({error:'Il profilo di sistema non può essere modificato.'});
    const beforeCards = cardsFromStored(user.allowedCards, user.role);
    let afterCards = beforeCards;
    Users.updateProfile(user.id, parsed.profile);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'cards')) {
        const selected = sanitizeCards(req.body.cards);
        if (!selected) return res.status(400).json({error:'Seleziona almeno una scheda del portale.'});
        Users.updateAllowedCards(user.id, cardsToStored(selected));
        afterCards = selected;
    }
    let afterDocente = normalizeDocente(user.role, user.docente);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'docente')) {
        afterDocente = normalizeDocente(user.role, req.body.docente);
        Users.updateDocente(user.id, afterDocente);
    }
    if (user.id !== req.user.id) {
        const actor = Users.findById(req.user.id) || req.user;
        const changes = profileDiffLines(user, parsed.profile);
        const cardsLine = cardsDiffLine(beforeCards, afterCards);
        if (cardsLine) changes.push(cardsLine);
        if (!!normalizeDocente(user.role, user.docente) !== afterDocente) {
            changes.push(afterDocente ? 'Categoria Docente: attivata' : 'Categoria Docente: rimossa');
        }
        notifyUser(
            user.id,
            'profile_updated',
            'Profilo aggiornato da un amministratore',
            `${actorLabel(actor)} ha modificato i tuoi dati. ${summarizeChanges(changes)}`,
            '/profilo'
        );
    }
    const updated = Users.findById(user.id);
    res.json({
        success: true,
        cards: cardsFromStored(updated.allowedCards, updated.role),
        docente: normalizeDocente(updated.role, updated.docente),
    });
});

// ── GET /api/auth/my-profile  (qualsiasi utente autenticato) ─────────────────
app.get('/api/auth/my-profile', authenticate,(req,res)=>{
    const user=Users.findById(req.user.id);
    if (!user) return res.status(404).json({error:'Utente non trovato.'});
    res.json(publicProfile(user, isLockedProfile(user.email)));
});

// ── POST /api/auth/profile-change-request  (user: richiesta modifica profilo) ─
app.post('/api/auth/profile-change-request', authenticate,(req,res)=>{
    if (isLockedProfile(req.user.email)) return res.status(403).json({error:'Il profilo di sistema non può essere modificato.'});
    const parsed = parseProfileBody(req.body);
    if (parsed.error) return res.status(400).json({error: parsed.error});
    // Blocca se c'è già una richiesta pendente
    const existing=ProfileChangeRequests.findPendingByUser(req.user.id);
    if (existing) return res.status(409).json({error:'Hai già una richiesta di modifica profilo in attesa di approvazione.'});
    const me = Users.findById(req.user.id) || { email: req.user.email };
    const changes = profileDiffLines(me, parsed.profile);
    const changeSummary = summarizeChanges(changes);
    ProfileChangeRequests.insert({
        id: uuidv4(),
        userId: req.user.id,
        userEmail: req.user.email,
        requestedAt: new Date().toISOString(),
        ...parsed.profile,
    });
    const who = `${String(me.cognome || '').toUpperCase()} ${me.nome || ''}`.trim() || req.user.email;
    notifyAdmins(
        'profile_request',
        'Nuova richiesta di modifica profilo',
        `${who} (${req.user.email}) ha inviato una richiesta di modifica. ${changeSummary}`,
        '/gestione-utenti#profiles',
        req.user.id
    );
    notifyUser(
        req.user.id,
        'profile_request_sent',
        'Richiesta di modifica inviata',
        `La tua richiesta è in attesa di approvazione. Hai chiesto di aggiornare: ${changeSummary}`,
        '/profilo'
    );
    res.json({success:true});
});

// ── GET /api/auth/profile-change-requests  (admin/superadmin) ────────────────
app.get('/api/auth/profile-change-requests', authenticate, requireAdmin,(req,res)=>{
    res.json(ProfileChangeRequests.findPending());
});

// ── POST /api/auth/profile-change-requests/:id/approve ───────────────────────
app.post('/api/auth/profile-change-requests/:id/approve', authenticate, requireAdmin,(req,res)=>{
    const pcr=ProfileChangeRequests.findById(req.params.id);
    if (!pcr||pcr.status!=='pending') return res.status(404).json({error:'Richiesta non trovata.'});
    const before = Users.findById(pcr.userId) || {};
    Users.updateProfile(pcr.userId, pcr);
    ProfileChangeRequests.approve(req.params.id,req.user.email);
    const actor = Users.findById(req.user.id) || req.user;
    const changes = profileDiffLines(before, pcr);
    notifyUser(
        pcr.userId,
        'profile_approved',
        'Modifica profilo approvata',
        `${actorLabel(actor)} ha approvato la tua richiesta. ${summarizeChanges(changes)} Profilo attuale: ${profileSnapshot(pcr)}.`,
        '/profilo'
    );
    res.json({success:true});
});

// ── DELETE /api/auth/profile-change-requests/:id  (rifiuta) ──────────────────
app.delete('/api/auth/profile-change-requests/:id', authenticate, requireAdmin,(req,res)=>{
    const pcr=ProfileChangeRequests.findById(req.params.id);
    if (!pcr||pcr.status!=='pending') return res.status(404).json({error:'Richiesta non trovata.'});
    ProfileChangeRequests.reject(req.params.id,req.user.email);
    const actor = Users.findById(req.user.id) || req.user;
    notifyUser(
        pcr.userId,
        'profile_rejected',
        'Modifica profilo rifiutata',
        `${actorLabel(actor)} ha rifiutato la tua richiesta di modifica profilo (${profileSnapshot(pcr)}). Puoi inviarne una nuova dalla pagina Profilo.`,
        '/profilo'
    );
    res.json({success:true});
});

// ── GET /api/auth/notifications ───────────────────────────────────────────────
app.get('/api/auth/notifications', authenticate,(req,res)=>{
    const items = Notifications.findForUser(req.user.id).map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        createdAt: n.createdAt,
        read: !!n.readAt,
    }));
    res.json({ unread: Notifications.countUnread(req.user.id), items });
});

// ── POST /api/auth/notifications/:id/read ─────────────────────────────────────
app.post('/api/auth/notifications/:id/read', authenticate,(req,res)=>{
    Notifications.markRead(req.params.id, req.user.id);
    res.json({ success: true, unread: Notifications.countUnread(req.user.id) });
});

// ── POST /api/auth/notifications/read-all ─────────────────────────────────────
app.post('/api/auth/notifications/read-all', authenticate,(req,res)=>{
    Notifications.markAllRead(req.user.id);
    res.json({ success: true, unread: 0 });
});

// ── Corsi CMS (admin/superadmin = docenti) ────────────────────────────────────
mountCorsiRoutes(app, { authenticate, requireDocente, notifyCorsiEditors, actorLabel });

app.listen(PORT,'0.0.0.0',()=>console.log(`Auth service in ascolto su http://0.0.0.0:${PORT}`));
