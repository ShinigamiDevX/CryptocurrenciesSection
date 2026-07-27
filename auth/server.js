'use strict';
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { Users, Invitations, ProfileChangeRequests, Notifications } = require('./db');

const app  = express();
app.use(express.json());

const PORT             = process.env.PORT || 4000;
const DATA_DIR         = path.join(__dirname, 'data');
const SECRET_FILE      = path.join(DATA_DIR, 'secret.key');
const SUPERADMIN_EMAIL = 'portalecrypto@proton.me';
const SUPERADMIN_NOME  = 'Portale';
const SUPERADMIN_COGNOME = 'Crypto';
const PORTAL_URL       = (process.env.PORTAL_URL || 'https://192.168.4.77:5200').replace(/\/$/, '');
const ROLE_LEVEL       = { reader: 0, user: 1, admin: 2, superadmin: 3 };
const ALL_ROLES        = ['reader', 'user', 'admin', 'superadmin'];

function isLockedProfile(email) {
    return !!(email && email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase());
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

const ROLE_LABEL = { reader: 'Reader', user: 'Utente', admin: 'Admin', superadmin: 'Super Admin' };

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
        // Profilo di sistema fisso: Portale Crypto, senza grado
        Users.updateProfile(existing.id, SUPERADMIN_NOME, SUPERADMIN_COGNOME, '');
    }
})();

async function sendInviteEmail(toEmail, inviteToken, assignedRole) {
    const link=`${PORTAL_URL}/register?token=${inviteToken}`;
    const rLabel={reader:'Reader',user:'Utente',admin:'Admin',superadmin:'Super Admin'}[assignedRole]||assignedRole;
    const html=`<!DOCTYPE html><html lang="it"><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;"><tr><td style="background:#030E1C;padding:28px 32px;"><span style="color:#00C8FF;font-size:1.2rem;font-weight:700;">CryptocurrenciesSection</span></td></tr><tr><td style="padding:32px;"><h2 style="color:#1a2a3a;margin:0 0 12px;">Sei stato invitato</h2><p style="color:#4a5568;line-height:1.6;margin:0 0 8px;">Ruolo: <strong>${rLabel}</strong>. Link valido <strong>15 minuti</strong>.</p><a href="${link}" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#00C8FF;color:#030E1C;text-decoration:none;border-radius:8px;font-weight:700;">Registrati</a><p style="color:#a0aec0;font-size:0.8rem;margin-top:16px;word-break:break-all;">${link}</p></td></tr></table></td></tr></table></body></html>`;
    if (transporter) { await transporter.sendMail({from:SMTP_FROM,to:toEmail,subject:`[CryptocurrenciesSection] Invito come ${rLabel}`,html}); console.log(`[AUTH] Email invito → ${toEmail}`); }
    else { console.log(`[AUTH] Invito (${rLabel}) per ${toEmail}: ${link}`); }
}

function authenticate(req,res,next){
    const h=req.headers['authorization'], t=h&&h.startsWith('Bearer ')?h.slice(7):null;
    if (!t) return res.status(401).json({error:'Token mancante.'});
    try { req.user=jwt.verify(t,JWT_SECRET); next(); } catch { res.status(401).json({error:'Token non valido o scaduto.'}); }
}
function requireAdmin(req,res,next){ if(req.user.role!=='superadmin'&&req.user.role!=='admin') return res.status(403).json({error:'Accesso negato.'}); next(); }

app.post('/api/auth/login', async(req,res)=>{
    const {email,password}=req.body||{};
    if (!email||!password) return res.status(400).json({error:'Email e password obbligatori.'});
    const user=Users.findByEmail(email);
    if (!user||user.revokedAt||!(await bcrypt.compare(password,user.passwordHash))) return res.status(401).json({error:'Credenziali non valide.'});
    const token=jwt.sign({id:user.id,email:user.email,role:user.role,mustChangePassword:user.mustChangePassword},JWT_SECRET,{expiresIn:'12h'});
    res.json({token,role:user.role,mustChangePassword:user.mustChangePassword});
});

app.get('/api/auth/verify', authenticate,(req,res)=>{
    const user=Users.findById(req.user.id);
    if (!user||user.revokedAt) return res.status(401).json({error:'Sessione non valida.'});
    res.json({valid:true,email:user.email,role:user.role});
});

app.post('/api/auth/send-otp', async(req,res)=>{
    const {token}=req.body||{};
    if (!token) return res.status(400).json({error:'Token mancante.'});
    const inv=Invitations.findByToken(token);
    if (!inv||inv.used||new Date()>new Date(inv.expiresAt)) return res.status(400).json({error:'Invito non valido o scaduto.'});
    const otp=Math.floor(100000+Math.random()*900000).toString();
    Invitations.setOtp(token,await bcrypt.hash(otp,10),new Date(Date.now()+10*60*1000).toISOString());
    const html=`<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;"><tr><td style="background:#030E1C;padding:28px 32px;"><span style="color:#00C8FF;font-size:1.2rem;font-weight:700;">CryptocurrenciesSection</span></td></tr><tr><td style="padding:32px;"><h2 style="color:#1a2a3a;margin:0 0 12px;">Codice di verifica</h2><p style="color:#4a5568;margin:0 0 20px;">Valido <strong>10 minuti</strong>.</p><div style="background:#f0f9ff;border:2px solid #00C8FF;border-radius:10px;padding:20px 32px;text-align:center;letter-spacing:0.3rem;font-size:2.2rem;font-weight:700;color:#030E1C;">${otp}</div></td></tr></table></td></tr></table></body></html>`;
    if (transporter) transporter.sendMail({from:SMTP_FROM,to:inv.email,subject:'[CryptocurrenciesSection] Codice di verifica',html}).catch(e=>console.error('[AUTH] OTP email:',e.message));
    else console.log(`[AUTH] OTP per ${inv.email}: ${otp}`);
    res.json({sent:true,smtpConfigured:!!transporter});
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
        const { token, password, otp, nome, cognome, grado } = req.body || {};
        if (!token||!password||!otp) return res.status(400).json({error:'Token, password e codice OTP obbligatori.'});
        if (!nome||!cognome||!grado) return res.status(400).json({error:'Nome, cognome e grado sono obbligatori.'});
        if (password.length<8) return res.status(400).json({error:'Password di almeno 8 caratteri.'});
        const inv=Invitations.findByToken(token);
        if (!inv||inv.used) return res.status(400).json({error:'Invito non valido o già utilizzato.'});
        if (new Date()>new Date(inv.expiresAt)) return res.status(400).json({error:'Invito scaduto.'});
        if (!inv.otp||inv.otpUsed) return res.status(400).json({error:'Codice non richiesto o già utilizzato.'});
        if (new Date()>new Date(inv.otpExpiry)) return res.status(400).json({error:'Codice scaduto. Richiedi un nuovo codice.'});
        if (!(await bcrypt.compare(otp.trim(),inv.otp))) return res.status(400).json({error:'Codice non corretto.'});
        const ex=Users.findByEmail(inv.email);
        if (ex&&!ex.revokedAt) return res.status(409).json({error:'Utente già registrato. Usa il login.'});
        const passwordHash=await bcrypt.hash(password,12);
        const profile={
            passwordHash,
            role:inv.role||'user',
            createdAt:new Date().toISOString(),
            mustChangePassword:false,
            nome:nome.trim(),
            cognome:cognome.trim(),
            grado,
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
    const {email,role:requestedRole}=req.body||{};
    if (!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Email non valida.'});
    const myLevel=ROLE_LEVEL[req.user.role]??0;
    const assignedRole=(ALL_ROLES.includes(requestedRole)&&ROLE_LEVEL[requestedRole]<=myLevel)?requestedRole:'user';
    const ex=Users.findByEmail(email);
    if (ex&&!ex.revokedAt) return res.status(409).json({error:'Utente già registrato.'});
    Invitations.invalidateByEmail(email);
    const token=uuidv4();
    Invitations.insert({token,email,role:assignedRole,invitedBy:req.user.email,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+15*60*1000).toISOString()});
    sendInviteEmail(email,token,assignedRole).catch(e=>console.error('[AUTH] Email invito:',e.message));
    res.json({token,link:`/register?token=${token}`,role:assignedRole,emailSent:!!transporter});
});

app.get('/api/auth/users', authenticate, requireAdmin,(req,res)=>{
    res.json(Users.findActive()
        .filter(u => u.email !== SUPERADMIN_EMAIL)  // il fondatore non compare nella lista
        .map(({passwordHash,...u})=>({...u,role:ALL_ROLES.includes(u.role)?u.role:'user'})));
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
    notifyUser(
        user.id,
        'role_changed',
        'Ruolo aggiornato',
        `Il tuo ruolo è passato da ${ROLE_LABEL[prevRole] || prevRole} a ${ROLE_LABEL[newRole] || newRole}.`,
        '/profilo'
    );
    res.json({success:true,role:newRole});
});

app.get('/api/auth/invitations', authenticate, requireAdmin,(req,res)=>{
    res.json(Invitations.findActive());
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
    const {nome,cognome,grado}=req.body||{};
    if (!nome||!cognome||!grado) return res.status(400).json({error:'Nome, cognome e grado obbligatori.'});
    const user=Users.findById(req.params.id);
    if (!user) return res.status(404).json({error:'Utente non trovato.'});
    if (isLockedProfile(user.email)) return res.status(403).json({error:'Il profilo di sistema non può essere modificato.'});
    Users.updateProfile(user.id,nome.trim(),cognome.trim(),grado);
    if (user.id !== req.user.id) {
        notifyUser(
            user.id,
            'profile_updated',
            'Profilo aggiornato',
            `Un amministratore ha aggiornato il tuo profilo: ${cognome.trim().toUpperCase()} ${nome.trim()} — ${grado}.`,
            '/profilo'
        );
    }
    res.json({success:true});
});

// ── GET /api/auth/my-profile  (qualsiasi utente autenticato) ─────────────────
app.get('/api/auth/my-profile', authenticate,(req,res)=>{
    const user=Users.findById(req.user.id);
    if (!user) return res.status(404).json({error:'Utente non trovato.'});
    const locked = isLockedProfile(user.email);
    res.json({
        email: user.email,
        role: user.role,
        nome: locked ? SUPERADMIN_NOME : user.nome,
        cognome: locked ? SUPERADMIN_COGNOME : user.cognome,
        grado: locked ? '' : user.grado,
        canEdit: !locked,
    });
});

// ── POST /api/auth/profile-change-request  (user: richiesta modifica profilo) ─
app.post('/api/auth/profile-change-request', authenticate,(req,res)=>{
    if (isLockedProfile(req.user.email)) return res.status(403).json({error:'Il profilo di sistema non può essere modificato.'});
    const {nome,cognome,grado}=req.body||{};
    if (!nome||!cognome||!grado) return res.status(400).json({error:'Nome, cognome e grado obbligatori.'});
    // Blocca se c'è già una richiesta pendente
    const existing=ProfileChangeRequests.findPendingByUser(req.user.id);
    if (existing) return res.status(409).json({error:'Hai già una richiesta di modifica profilo in attesa di approvazione.'});
    ProfileChangeRequests.insert({id:uuidv4(),userId:req.user.id,userEmail:req.user.email,nome:nome.trim(),cognome:cognome.trim(),grado,requestedAt:new Date().toISOString()});
    notifyAdmins(
        'profile_request',
        'Nuova richiesta di modifica profilo',
        `${req.user.email} ha richiesto di aggiornare nome/cognome/grado.`,
        '/gestione-utenti#profiles',
        req.user.id
    );
    notifyUser(
        req.user.id,
        'profile_request_sent',
        'Richiesta inviata',
        'La tua richiesta di modifica profilo è in attesa di approvazione.',
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
    Users.updateProfile(pcr.userId,pcr.nome,pcr.cognome,pcr.grado);
    ProfileChangeRequests.approve(req.params.id,req.user.email);
    notifyUser(
        pcr.userId,
        'profile_approved',
        'Modifica profilo approvata',
        `La richiesta è stata approvata. Nuovo profilo: ${pcr.cognome.toUpperCase()} ${pcr.nome} — ${pcr.grado}.`,
        '/profilo'
    );
    res.json({success:true});
});

// ── DELETE /api/auth/profile-change-requests/:id  (rifiuta) ──────────────────
app.delete('/api/auth/profile-change-requests/:id', authenticate, requireAdmin,(req,res)=>{
    const pcr=ProfileChangeRequests.findById(req.params.id);
    if (!pcr||pcr.status!=='pending') return res.status(404).json({error:'Richiesta non trovata.'});
    ProfileChangeRequests.reject(req.params.id,req.user.email);
    notifyUser(
        pcr.userId,
        'profile_rejected',
        'Modifica profilo rifiutata',
        'La tua richiesta di modifica profilo è stata rifiutata. Puoi inviarne una nuova dalla pagina profilo.',
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

app.listen(PORT,'0.0.0.0',()=>console.log(`Auth service in ascolto su http://0.0.0.0:${PORT}`));
