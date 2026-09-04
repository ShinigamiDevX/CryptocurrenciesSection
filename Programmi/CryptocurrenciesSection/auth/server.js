'use strict';
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { Users, Invitations, ProfileChangeRequests, AdminActionRequests, Notifications, PasswordResets, profileDefaults } = require('./db');
const { mountCorsiRoutes } = require('./corsi-content');

const app  = express();
app.use(express.json({ limit: '1mb' }));

const PORT             = process.env.PORT || 4000;
const DATA_DIR         = path.join(__dirname, 'data');
const SECRET_FILE      = path.join(DATA_DIR, 'secret.key');
const SUPERADMIN_EMAIL = 'portalecrypto@proton.me';
const SUPERADMIN_NOME  = 'Super Admin';
const SUPERADMIN_COGNOME = '';
const PORTAL_URL       = (process.env.PORTAL_URL || 'https://cryptosection.chainholder.dev').replace(/\/$/, '');
const ROLE_LEVEL       = { reader: 0, user: 1, admin: 2, superadmin: 3 }; // reader: solo profili strumento / legacy
/** Ruoli assegnabili a utenti umani (inviti / cambio ruolo). */
const ALL_ROLES        = ['user', 'admin', 'superadmin'];
/** Schede dashboard assegnabili in invito (gestione-utenti resta solo per admin/superadmin). */
const ASSIGNABLE_CARDS = [
    'ai', 'analisi-report', 'apinga', 'chainholder', 'cluster', 'corsi',
    'cryptomonitor', 'cryptoscanner', 'gelato', 'li-tools', 'materiali', 'siena', 'terra', 'vysion', 'xpublicator',
];
const STRUMENTO_EMAIL_DOMAIN = 'strumento.local';
const CARD_HOME = {
    'analisi-report': '/analisi-report',
    'cluster': 'https://192.168.4.80:3444',
    'corsi': '/corsi',
    'cryptomonitor': 'https://192.168.4.80:5173',
    'materiali': 'https://192.168.4.80:5174',
    'apinga': 'http://192.168.4.80:5001',
    'cryptoscanner': '/cryptoscanner',
    'xpublicator': '/xpublicator',
    'gelato': 'http://192.168.4.80:5005',
    'li-tools': '/li-tools',
    'siena': '/siena-constructor/',
    'terra': 'http://192.168.4.80:7860',
    'vysion': 'http://192.168.4.80:3002',
};
const VYSION_URL = (process.env.VYSION_URL || 'http://192.168.4.80:3002').replace(/\/$/, '');
const CHAINHOLDER_URL = (process.env.CHAINHOLDER_URL || 'http://192.168.1.73:3000').replace(/\/$/, '');
const CHAINHOLDER_HOME = process.env.CHAINHOLDER_HOME || '/dashboard/requests';
const CRYPTOMONITOR_URL = (process.env.CRYPTOMONITOR_URL || 'https://192.168.4.80:5173').replace(/\/$/, '');
const SSO_TTL_MS = 90 * 1000;
/** Ticket monouso: hash → { tool, userId, exp }. */
const ssoTickets = new Map();

function ssoHash(ticket) {
    return crypto.createHash('sha256').update(String(ticket)).digest('hex');
}

function purgeSsoTickets() {
    const now = Date.now();
    for (const [h, row] of ssoTickets) {
        if (!row || row.exp <= now) ssoTickets.delete(h);
    }
}

function ssoRedirectUrl(tool, ticket) {
    const q = encodeURIComponent(ticket);
    if (tool === 'cryptomonitor') return `${CRYPTOMONITOR_URL}/?sso=${q}`;
    if (tool === 'chainholder') {
        const home = CHAINHOLDER_HOME.startsWith('http')
            ? CHAINHOLDER_HOME
            : `${CHAINHOLDER_URL}${CHAINHOLDER_HOME.startsWith('/') ? '' : '/'}${CHAINHOLDER_HOME}`;
        const cb = encodeURIComponent(home);
        return `${CHAINHOLDER_URL}/portal-sso?ticket=${q}&callbackUrl=${cb}`;
    }
    if (tool === 'vysion') {
        const cb = encodeURIComponent(`${VYSION_URL}/dashboard`);
        return `${VYSION_URL}/portal-sso?ticket=${q}&callbackUrl=${cb}`;
    }
    return null;
}

function userCanAccessCard(user, cardId) {
    if (!user || !cardId) return false;
    if (user.role === 'superadmin' && !isStrumentoAccount(user)) return true;
    return cardsFromStored(user.allowedCards, user.role, user.accountType).includes(cardId);
}

const SSO_TOOLS = new Set(['chainholder', 'cryptomonitor', 'vysion']);

function isStrumentoAccount(user) {
    if (!user) return false;
    if (user.accountType === 'strumento') return true;
    const email = String(user.email || '').toLowerCase();
    return email.endsWith('@' + STRUMENTO_EMAIL_DOMAIN);
}

function strumentoSyntheticEmail(username) {
    return `${String(username).trim().toLowerCase()}@${STRUMENTO_EMAIL_DOMAIN}`;
}

function normalizeUsername(raw) {
    const u = String(raw || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(u)) return null;
    if (u.includes('@')) return null;
    return u;
}

function defaultCardsForRole(role) {
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

function cardsFromStored(raw, role, accountType) {
    const isStrumento = accountType === 'strumento';
    if (raw == null || String(raw).trim() === '') {
        return isStrumento ? [] : defaultCardsForRole(role);
    }
    try {
        const parsed = sanitizeCards(JSON.parse(raw));
        if (parsed) return parsed;
        return isStrumento ? [] : defaultCardsForRole(role);
    } catch {
        return isStrumento ? [] : defaultCardsForRole(role);
    }
}

function cardsToStored(cards) {
    return JSON.stringify(cards);
}

function cardOrderFromStored(raw) {
    if (raw == null || String(raw).trim() === '') return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim());
    } catch {
        return [];
    }
}

function cardOrderToStored(order) {
    return JSON.stringify(Array.isArray(order) ? order : []);
}

/** Aggiunge schede nuove alle allowlist già salvate, senza toccare account strumento. */
(function grantNewAssignableCards() {
    const NEW_CARDS = ['apinga', 'cryptoscanner', 'gelato', 'li-tools', 'siena', 'terra', 'vysion', 'xpublicator'];
    try {
        const users = Users.findActive();
        for (const user of users) {
            if (user.accountType === 'strumento') continue;
            if (user.role === 'reader') continue; // legacy / non migrato
            const raw = user.allowedCards;
            if (raw == null || String(raw).trim() === '') continue;
            let parsed;
            try { parsed = JSON.parse(raw); } catch { continue; }
            if (!Array.isArray(parsed)) continue;
            const next = parsed.filter((c) => typeof c === 'string');
            let changed = false;
            for (const id of NEW_CARDS) {
                if (!next.includes(id)) {
                    next.push(id);
                    changed = true;
                }
            }
            if (changed) Users.updateAllowedCards(user.id, cardsToStored(next));
        }
    } catch (err) {
        console.warn('[AUTH] Migrazione schede Apinga saltata:', err.message);
    }
})();

/** Ex-reader umani → user (i profili strumento restano reader / sola lettura). */
(function migrateHumanReadersToUser() {
    try {
        for (const user of Users.findActive()) {
            if (user.accountType === 'strumento') continue;
            if (user.role !== 'reader') continue;
            Users.updateRole(user.id, 'user');
            console.log('[AUTH] Migrato ex-reader → user:', user.email);
        }
    } catch (err) {
        console.warn('[AUTH] Migrazione reader→user saltata:', err.message);
    }
})();

function homeForCards(cards) {
    if (!Array.isArray(cards) || cards.length !== 1) return '/portal';
    return CARD_HOME[cards[0]] || '/portal';
}

function displayLoginId(user) {
    if (!user) return '';
    if (isStrumentoAccount(user) && user.username) return user.username;
    return user.email || user.username || '';
}

/** La categoria Docente è selezionabile solo per i ruoli Utente e Admin. */
function roleCanBeDocente(role) {
    return role === 'user' || role === 'admin';
}

function normalizeDocente(role, flag) {
    return roleCanBeDocente(role) && !!flag;
}

function isUserVisible(user) {
    if (!user) return false;
    return user.visible !== false && user.visible !== 0;
}

function isAccountUsable(user) {
    return !!(user && !user.revokedAt && isUserVisible(user));
}

/**
 * Super Admin ha sempre tutti i permessi (presenti e futuri).
 * Altre categorie: mappa capability → regola specifica.
 */
function userCan(user, capability) {
    if (!isAccountUsable(user)) return false;
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
        .filter(u => isUserVisible(u) && (u.role === 'admin' || u.role === 'superadmin') && u.id !== exceptUserId)
        .forEach(u => notifyUser(u.id, type, title, body, link));
}

/** Notifica Super Admin e utenti con categoria Docente (escluso l’attore). */
function notifyCorsiEditors(exceptUserId, type, title, body, link) {
    Users.findActive()
        .filter((u) => u.id !== exceptUserId && isUserVisible(u) && userCan(u, 'corsi.manage'))
        .forEach((u) => notifyUser(u.id, type, title, body, link));
}

function notifySuperadmins(type, title, body, link) {
    Users.findActive()
        .filter((u) => u.role === 'superadmin' && isUserVisible(u))
        .forEach((u) => notifyUser(u.id, type, title, body, link));
}

const OTP_MAX_FAILS = 3;
const OTP_MAX_SENDS = 3;
const LOGIN_LOCK_MS = 2 * 60 * 60 * 1000;

function isLoginLocked(user) {
    if (!user || !user.loginLockedUntil) return false;
    return new Date(user.loginLockedUntil).getTime() > Date.now();
}

function expireLoginLockIfNeeded(user) {
    if (!user || !user.loginLockedUntil) return user;
    if (new Date(user.loginLockedUntil).getTime() > Date.now()) return user;
    Users.clearLoginLock(user.id);
    return Users.findById(user.id);
}

function formatLockUntil(iso) {
    try {
        return new Date(iso).toLocaleString('it-IT', {
            timeZone: 'Europe/Rome',
            dateStyle: 'short',
            timeStyle: 'short',
        });
    } catch {
        return iso || '';
    }
}

function loginLockedPayload(user) {
    const until = user && user.loginLockedUntil;
    return {
        error: `Account bloccato per troppi tentativi. Riprova dopo le ${formatLockUntil(until)} (blocco di 2 ore).`,
        locked: true,
        lockedUntil: until || null,
        code: 'LOGIN_LOCKED',
    };
}

function applyLoginLock(user, reason) {
    const fresh = Users.findById(user.id);
    if (!fresh) return fresh;
    if (isLoginLocked(fresh)) return fresh;
    const until = new Date(Date.now() + LOGIN_LOCK_MS).toISOString();
    Users.setLoginLock(fresh.id, until, reason);
    const updated = Users.findById(fresh.id);
    if (updated && updated.role !== 'superadmin') {
        const why = reason === 'otp_fail'
            ? '3 codici OTP errati'
            : '3 invii del codice OTP';
        notifySuperadmins(
            'login_locked',
            'Accesso bloccato',
            `${subjectLabel(updated)} è stato bloccato per 2 ore (${why}). Puoi sbloccare l'account prima della scadenza da Gestione Utenti.`,
            '/gestione-utenti'
        );
    }
    return updated;
}

const ROLE_LABEL = { reader: 'Sola lettura', user: 'Utente', admin: 'Admin', superadmin: 'Super Admin' };
const CARD_LABEL = {
    chainholder: 'Chainholder',
    corsi: 'Corsi',
    cluster: 'Cluster',
    ai: 'AI',
    'analisi-report': 'Analisi Report',
    cryptomonitor: 'CryptoMonitor',
    materiali: 'Materiali',
    apinga: 'Apinga',
    cryptoscanner: 'CryptoScanner',
    gelato: 'GELATO',
    'li-tools': 'LI Tools',
    siena: 'SIENA Constructor',
    terra: 'Terra',
    vysion: 'Vysion',
    xpublicator: 'Xpublicator',
};

/** Nome anagrafico del profilo: "COGNOME Nome", oppure solo la parte disponibile. */
function personName(user) {
    if (!user) return '';
    const cognome = String(user.cognome || '').trim();
    const nome = String(user.nome || '').trim();
    if (cognome && nome) return `${cognome.toUpperCase()} ${nome}`;
    if (nome) return nome;
    if (cognome) return cognome.toUpperCase();
    return '';
}

/** Etichetta soggetto (target/richiedente) senza ruolo: preferisce il nome profilo. */
function subjectLabel(user) {
    return personName(user) || (user && user.email) || 'utente';
}

function actorLabel(user) {
    if (!user) return 'un amministratore';
    const role = ROLE_LABEL[user.role] || user.role || 'Admin';
    const person = personName(user);
    if (person) return `${person} (${role})`;
    return `${user.email || 'amministratore'} (${role})`;
}

function formatDateIT(iso) {
    const s = String(iso || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
    const [y, m, d] = s.split('-');
    return `${d}.${m}.${y}`;
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
    const beforeDom = before.domicilioComeResidenza
        || String(before.domicilio || '').trim() === String(before.residenza || '').trim()
        ? ''
        : (before.domicilio || '');
    const afterDom = after.domicilioComeResidenza
        || String(after.domicilio || '').trim() === String(after.residenza || '').trim()
        ? ''
        : (after.domicilio || '');
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
        p.domicilioComeResidenza
            || !p.domicilio
            || String(p.domicilio).trim() === String(p.residenza || '').trim()
            ? ''
            : `domicilio: ${p.domicilio}`,
        formatTelDisplay(p) ? `tel: ${formatTelDisplay(p)}` : '',
    ].filter(Boolean);
    return parts.join(' · ');
}

// ── Approvazioni azioni admin ─────────────────────────────────────────────────
// Le azioni admin/superadmin su altri utenti sono dirette (tranne ripristino /
// reset password / creazione strumento, riservati al Super Admin).
// Le richieste pendenti restano gestibili per compatibilità con dati legacy.
// Le modifiche profilo degli utenti (ruolo user) passano da profile_change_requests.
const ADMIN_APPROVALS_NEEDED = 2;
const ACTION_LABEL = { delete: 'Visibilità utente', visibility: 'Visibilità utente', role: 'Cambio ruolo', profile: 'Modifica profilo' };

function createAdminActionRequest(type, target, payload, summary, requester) {
    const id = uuidv4();
    AdminActionRequests.insert({
        id,
        type,
        targetUserId: target.id,
        targetEmail: target.email,
        payload: JSON.stringify(payload || {}),
        summary,
        requestedById: requester.id,
        requestedByEmail: requester.email,
        requestedAt: new Date().toISOString(),
    });
    const visibilityOnly = type === 'visibility';
    const waitHint = visibilityOnly
        ? 'Serve l\'approvazione del Super Admin.'
        : `Serve l'approvazione del Super Admin o di altri ${ADMIN_APPROVALS_NEEDED} admin.`;
    if (visibilityOnly) {
        notifySuperadmins(
            'admin_action_request',
            `Approvazione richiesta: ${ACTION_LABEL[type] || type}`,
            `${actorLabel(requester)} ha richiesto: ${summary}. ${waitHint}`,
            '/gestione-utenti#approvals'
        );
    } else {
        notifyAdmins(
            'admin_action_request',
            `Approvazione richiesta: ${ACTION_LABEL[type] || type}`,
            `${actorLabel(requester)} ha richiesto: ${summary}. ${waitHint}`,
            '/gestione-utenti#approvals',
            requester.id
        );
    }
    notifyUser(
        requester.id,
        'admin_action_request_sent',
        'Richiesta inviata',
        `La tua richiesta (${summary}) è in attesa di approvazione. ${waitHint}`,
        '/gestione-utenti#approvals'
    );
    return id;
}

/** Applica una richiesta approvata. Ritorna null se ok, altrimenti il motivo dell'errore. */
async function executeAdminAction(r) {
    const target = Users.findById(r.targetUserId);
    const requester = Users.findById(r.requestedById) || { id: r.requestedById, email: r.requestedByEmail };
    let payload = {};
    try { payload = JSON.parse(r.payload || '{}'); } catch {}
    if (!target || target.revokedAt) return 'l\'utente non è più attivo.';
    if (target.role === 'superadmin') return 'l\'utente è diventato Super Admin.';

    if (r.type === 'visibility' || r.type === 'delete') {
        const wantVisible = r.type === 'delete' ? false : !!payload.visible;
        await applyVisibility(target, wantVisible);
        return null;
    }

    if (r.type === 'role') {
        const newRole = payload.newRole;
        if (!ALL_ROLES.includes(newRole)) return 'il ruolo richiesto non è valido.';
        const prevRole = target.role;
        Users.updateRole(target.id, newRole);
        if (!roleCanBeDocente(newRole)) Users.updateDocente(target.id, false);
        notifyUser(
            target.id,
            'role_changed',
            'Ruolo modificato',
            `${actorLabel(requester)} ha cambiato il tuo ruolo da ${ROLE_LABEL[prevRole] || prevRole} a ${ROLE_LABEL[newRole] || newRole} (richiesta approvata).`,
            '/profilo'
        );
        return null;
    }

    if (r.type === 'profile') {
        const beforeCards = cardsFromStored(target.allowedCards, target.role);
        let afterCards = beforeCards;
        if (payload.profile) {
            Users.updateProfile(target.id, payload.profile);
        }
        if (Array.isArray(payload.cards) && payload.cards.length) {
            if (isUserVisible(target)) {
                Users.updateAllowedCards(target.id, cardsToStored(payload.cards));
                afterCards = payload.cards;
            }
        }
        const beforeDocente = normalizeDocente(target.role, target.docente);
        let afterDocente = beforeDocente;
        if (payload.docente !== undefined && payload.docente !== null && isUserVisible(target)) {
            afterDocente = normalizeDocente(target.role, payload.docente);
            Users.updateDocente(target.id, afterDocente);
        }
        if (target.id !== requester.id) {
            const changes = payload.profile ? profileDiffLines(target, payload.profile) : [];
            const cardsLine = cardsDiffLine(beforeCards, afterCards);
            if (cardsLine) changes.push(cardsLine);
            if (beforeDocente !== afterDocente) {
                changes.push(afterDocente ? 'Categoria Docente: attivata' : 'Categoria Docente: rimossa');
            }
            notifyUser(
                target.id,
                'profile_updated',
                'Profilo aggiornato da un amministratore',
                `${actorLabel(requester)} ha modificato i tuoi dati (richiesta approvata). ${summarizeChanges(changes)}`,
                '/profilo'
            );
        }
        return null;
    }

    return 'tipo di richiesta sconosciuto.';
}

const SMTP_HOST = process.env.SMTP_HOST, SMTP_PORT = parseInt(process.env.SMTP_PORT||'587',10);
const SMTP_SECURE = process.env.SMTP_SECURE==='true', SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS, SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

function createSmtpTransport() {
    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        tls: { rejectUnauthorized: false },
        pool: false,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
    });
}

async function smtpSend(mail) {
    const t = createSmtpTransport();
    try {
        await t.sendMail(mail);
    } finally {
        t.close();
    }
}

const transporter = (SMTP_HOST && SMTP_USER && SMTP_PASS) ? true : null;
if (transporter) console.log(`[AUTH] SMTP: ${SMTP_HOST}:${SMTP_PORT}`);
else console.log('[AUTH] SMTP non configurato.');

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
        console.log('[AUTH] Superadmin creato (password iniziale da cambiare al primo accesso)');
    } else {
        // Profilo di sistema fisso: Super Admin, senza cognome né grado
        Users.updateProfile(existing.id, { nome: SUPERADMIN_NOME, cognome: SUPERADMIN_COGNOME, grado: '' });
    }
})();

async function sendInviteEmail(toEmail, inviteToken, assignedRole) {
    const link=`${PORTAL_URL}/register?token=${inviteToken}`;
    const rLabel={reader:'Sola lettura',user:'Utente',admin:'Admin',superadmin:'Super Admin'}[assignedRole]||assignedRole;
    const html=`<!DOCTYPE html><html lang="it"><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;"><tr><td style="background:#030E1C;padding:28px 32px;"><span style="color:#00C8FF;font-size:1.2rem;font-weight:700;">CryptocurrenciesSection</span></td></tr><tr><td style="padding:32px;"><h2 style="color:#1a2a3a;margin:0 0 12px;">Sei stato invitato</h2><p style="color:#4a5568;line-height:1.6;margin:0 0 8px;">Ruolo: <strong>${rLabel}</strong>. Link valido <strong>15 minuti</strong>.</p><a href="${link}" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#00C8FF;color:#030E1C;text-decoration:none;border-radius:8px;font-weight:700;">Registrati</a><p style="color:#a0aec0;font-size:0.8rem;margin-top:16px;word-break:break-all;">${link}</p></td></tr></table></td></tr></table></body></html>`;
    if (transporter) { await smtpSend({from:SMTP_FROM,to:toEmail,subject:`[CryptocurrenciesSection] Invito come ${rLabel}`,html}); console.log(`[AUTH] Email invito → ${toEmail}`); }
    else { console.log(`[AUTH] Invito (${rLabel}) per ${toEmail}: email non inviata (SMTP non configurato).`); }
}

async function sendPasswordResetEmail(toEmail, tempPassword) {
    const link = `${PORTAL_URL}/login.html`;
    const safePass = String(tempPassword).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const html = `<!DOCTYPE html><html lang="it"><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;"><tr><td style="background:#030E1C;padding:28px 32px;"><span style="color:#00C8FF;font-size:1.2rem;font-weight:700;">CryptocurrenciesSection</span></td></tr><tr><td style="padding:32px;"><h2 style="color:#1a2a3a;margin:0 0 12px;">Reset password</h2><p style="color:#4a5568;line-height:1.6;margin:0 0 12px;">Un super amministratore ha resettato la password del tuo account.</p><p style="color:#4a5568;line-height:1.6;margin:0 0 8px;">Password temporanea:</p><p style="margin:0 0 16px;padding:12px 16px;background:#f0f7fa;border-radius:8px;font-family:Consolas,Monaco,monospace;font-size:1.05rem;font-weight:700;color:#030E1C;letter-spacing:0.04em;">${safePass}</p><p style="color:#4a5568;line-height:1.6;margin:0 0 8px;">Al primo accesso ti verrà chiesto di impostare una nuova password.</p><a href="${link}" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#00C8FF;color:#030E1C;text-decoration:none;border-radius:8px;font-weight:700;">Accedi al portale</a><p style="color:#a0aec0;font-size:0.8rem;margin-top:16px;word-break:break-all;">${link}</p></td></tr></table></td></tr></table></body></html>`;
    if (!transporter) {
        console.log(`[AUTH] Reset password per ${toEmail}: email non inviata (SMTP non configurato).`);
        return false;
    }
    await smtpSend({
        from: SMTP_FROM,
        to: toEmail,
        subject: '[CryptocurrenciesSection] Password resettata',
        html,
    });
    console.log(`[AUTH] Email reset password → ${toEmail}`);
    return true;
}

async function applyVisibility(user, wantVisible) {
    if (wantVisible) {
        const tempPassword = crypto.randomBytes(9).toString('base64url');
        Users.setVisible(user.id, true);
        Users.resetPassword(user.id, await bcrypt.hash(tempPassword, 12));
        Users.clearLoginLock(user.id);
        let emailSent = false;
        try {
            emailSent = await sendPasswordResetEmail(user.email, tempPassword);
        } catch (e) {
            console.error('[AUTH] Email ripristino credenziali:', e.message);
        }
        return { visible: true, emailSent, temporaryPassword: emailSent ? undefined : tempPassword };
    }
    Users.setVisible(user.id, false);
    PasswordResets.invalidateForUser(user.id);
    return { visible: false, revoked: true };
}

async function sendForgotPasswordEmail(toEmail, resetToken) {
    // Fragment (#): non viene inviato al server nella GET della pagina → non finisce nei log access
    const link = `${PORTAL_URL}/reset-password#token=${encodeURIComponent(resetToken)}`;
    const html = `<!DOCTYPE html><html lang="it"><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;"><tr><td style="background:#030E1C;padding:28px 32px;"><span style="color:#00C8FF;font-size:1.2rem;font-weight:700;">CryptocurrenciesSection</span></td></tr><tr><td style="padding:32px;"><h2 style="color:#1a2a3a;margin:0 0 12px;">Reset password</h2><p style="color:#4a5568;line-height:1.6;margin:0 0 8px;">Hai richiesto il reset della password del portale operativo.</p><p style="color:#4a5568;line-height:1.6;margin:0 0 28px;">Clicca sul pulsante qui sotto per impostarne una nuova. Il link è valido per <strong>1 ora</strong>.</p><a href="${link}" style="display:inline-block;padding:14px 28px;background:#00C8FF;color:#030E1C;text-decoration:none;border-radius:8px;font-weight:700;">Imposta nuova password</a><p style="color:#a0aec0;font-size:0.8rem;margin:24px 0 0;">Se non hai richiesto tu il reset, ignora questa email.<br>Link: <span style="color:#00C8FF;word-break:break-all;">${link}</span></p></td></tr></table></td></tr></table></body></html>`;
    if (!transporter) {
        console.log(`[AUTH] Forgot-password per ${toEmail}: email non inviata (SMTP non configurato).`);
        return false;
    }
    await smtpSend({
        from: SMTP_FROM,
        to: toEmail,
        subject: '[CryptocurrenciesSection] Reset password',
        html,
    });
    console.log(`[AUTH] Email forgot-password → ${toEmail}`);
    return true;
}

function authenticate(req,res,next){
    const h=req.headers['authorization'], t=h&&h.startsWith('Bearer ')?h.slice(7):null;
    if (!t) return res.status(401).json({error:'Token mancante.'});
    try {
        req.user=jwt.verify(t,JWT_SECRET);
        if (req.user.purpose === 'login_otp') return res.status(401).json({error:'Token non valido.'});
        const dbUser = Users.findById(req.user.id);
        if (!isAccountUsable(dbUser)) return res.status(401).json({error:'Sessione non valida.'});
        const tokenVer = Number(req.user.tokenVersion) || 0;
        const dbVer = Number(dbUser.tokenVersion) || 0;
        if (tokenVer !== dbVer) return res.status(401).json({error:'Sessione non valida. Effettua di nuovo l\'accesso.'});
        // Ruolo e flag sempre dal DB, mai dal JWT (un admin declassato non deve restare admin).
        req.user.role = dbUser.role;
        req.user.email = dbUser.email;
        req.user.mustChangePassword = !!dbUser.mustChangePassword;
        next();
    } catch { res.status(401).json({error:'Token non valido o scaduto.'}); }
}
function requireAdmin(req,res,next){ if(req.user.role!=='superadmin'&&req.user.role!=='admin') return res.status(403).json({error:'Accesso negato.'}); next(); }
function requireSuperadmin(req,res,next){ if(req.user.role!=='superadmin') return res.status(403).json({error:'Solo i super admin possono eseguire questa operazione.'}); next(); }
/** Gestione contenuti Corsi: Docente oppure Super Admin (tutti i permessi). */
function requireDocente(req, res, next) {
    if (req.user.role === 'superadmin') return next();
    const user = Users.findById(req.user.id);
    if (!userCan(user, 'corsi.manage')) {
        return res.status(403).json({ error: 'Solo i docenti o i Super Admin possono gestire i contenuti dei corsi.' });
    }
    next();
}

/** Lettura dei corsi: serve la scheda «corsi» in dashboard. */
function requireCorsiAccess(req, res, next) {
    if (req.user.role === 'superadmin') return next();
    const user = Users.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'Sessione non valida.' });
    if (!cardsFromStored(user.allowedCards, user.role, user.accountType).includes('corsi')) {
        return res.status(403).json({ error: 'Non hai accesso all\'area Corsi.' });
    }
    next();
}

function otpEmailHtml(otp) {
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;"><tr><td style="background:#030E1C;padding:28px 32px;"><span style="color:#00C8FF;font-size:1.2rem;font-weight:700;">CryptocurrenciesSection</span></td></tr><tr><td style="padding:32px;"><h2 style="color:#1a2a3a;margin:0 0 12px;">Codice di verifica</h2><p style="color:#4a5568;margin:0 0 20px;">Valido <strong>10 minuti</strong>.</p><div style="background:#f0f9ff;border:2px solid #00C8FF;border-radius:10px;padding:20px 32px;text-align:center;letter-spacing:0.3rem;font-size:2.2rem;font-weight:700;color:#030E1C;">${otp}</div></td></tr></table></td></tr></table></body></html>`;
}

async function sendVerificationOtpEmail(toEmail, otp) {
    const html = otpEmailHtml(otp);
    if (transporter) {
        await smtpSend({
            from: SMTP_FROM,
            to: toEmail,
            subject: '[CryptocurrenciesSection] Codice di verifica',
            html,
        });
        console.error(`[AUTH] OTP email → ${toEmail}`);
        return true;
    }
    console.error(`[AUTH] OTP per ${toEmail}: non inviato (SMTP non configurato).`);
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
        console.error('[AUTH] OTP login email:', e.message || e);
        emailSent = false;
    }
    const challenge = jwt.sign(
        { id: user.id, email: user.email, purpose: 'login_otp' },
        JWT_SECRET,
        { expiresIn: '10m' }
    );
    return { challenge, emailSent };
}

async function issueLoginOtpGuarded(user) {
    user = expireLoginLockIfNeeded(Users.findById(user.id));
    if (!isAccountUsable(user)) return { invalid: true };
    if (isLoginLocked(user)) return { locked: true, user };
    if ((Number(user.otpSendCount) || 0) >= OTP_MAX_SENDS) {
        return { locked: true, user: applyLoginLock(user, 'otp_send') };
    }
    const result = await issueLoginOtp(user);
    Users.incrementOtpSend(user.id);
    user = Users.findById(user.id);
    if ((Number(user.otpSendCount) || 0) >= OTP_MAX_SENDS) {
        applyLoginLock(user, 'otp_send');
        user = Users.findById(user.id);
    }
    return { locked: false, challenge: result.challenge, emailSent: result.emailSent, user };
}

function issueSessionToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            mustChangePassword: !!user.mustChangePassword,
            tokenVersion: Number(user.tokenVersion) || 0,
        },
        JWT_SECRET,
        { expiresIn: '12h' }
    );
}

app.post('/api/auth/login', async(req,res)=>{
    const body = req.body || {};
    const login = String(body.login || body.email || body.username || '').trim();
    const password = body.password;
    if (!login || !password) return res.status(400).json({error:'Credenziali obbligatorie.'});
    const user = Users.findByLogin(login);
    if (!isAccountUsable(user) || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({error:'Credenziali non valide.'});
    }
    const cards = cardsFromStored(user.allowedCards, user.role, user.accountType);
    if (isStrumentoAccount(user)) {
        if (!cards.length) {
            return res.status(403).json({ error: 'Profilo strumento senza strumenti assegnati. Contatta il Super Admin.' });
        }
        const token = issueSessionToken(user);
        return res.json({
            token,
            role: user.role,
            mustChangePassword: !!user.mustChangePassword,
            accountType: 'strumento',
            cards,
            redirect: homeForCards(cards),
            ssoTool: cards.length === 1 && SSO_TOOLS.has(cards[0]) ? cards[0] : null,
            requiresOtp: false,
        });
    }
    try {
        const result = await issueLoginOtpGuarded(user);
        if (result.invalid) return res.status(401).json({error:'Credenziali non valide.'});
        if (result.locked) return res.status(423).json(loginLockedPayload(result.user));
        res.json({
            requiresOtp: true,
            challenge: result.challenge,
            emailSent: result.emailSent,
            smtpConfigured: !!transporter,
            message: result.emailSent
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
    let user = expireLoginLockIfNeeded(Users.findById(payload.id));
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Utente non valido.' });
    if (isLoginLocked(user) && (user.loginLockedReason === 'otp_fail' || (Number(user.otpFailCount) || 0) >= OTP_MAX_FAILS)) {
        return res.status(423).json(loginLockedPayload(user));
    }
    if (!user.loginOtp || !user.loginOtpExpiry) {
        return res.status(400).json({ error: 'Nessun codice attivo. Richiedi un nuovo codice.' });
    }
    if (new Date() > new Date(user.loginOtpExpiry)) {
        Users.clearLoginOtp(user.id);
        return res.status(400).json({ error: 'Codice scaduto. Richiedi un nuovo codice.' });
    }
    if (!(await bcrypt.compare(String(otp).trim(), user.loginOtp))) {
        Users.incrementOtpFail(user.id);
        user = Users.findById(user.id);
        if ((Number(user.otpFailCount) || 0) >= OTP_MAX_FAILS) {
            user = applyLoginLock(user, 'otp_fail');
            return res.status(423).json(loginLockedPayload(user));
        }
        const left = OTP_MAX_FAILS - (Number(user.otpFailCount) || 0);
        return res.status(401).json({
            error: left === 1
                ? 'Codice non corretto. Ultimo tentativo prima del blocco di 2 ore.'
                : `Codice non corretto. Tentativi rimasti: ${left}.`,
            attemptsLeft: left,
        });
    }
    Users.clearLoginLock(user.id);
    const token = issueSessionToken(user);
    const cards = cardsFromStored(user.allowedCards, user.role, user.accountType);
    res.json({
        token,
        role: user.role,
        mustChangePassword: !!user.mustChangePassword,
        accountType: isStrumentoAccount(user) ? 'strumento' : 'user',
        cards,
        redirect: '/portal',
        ssoTool: null,
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
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Utente non valido.' });
    try {
        const result = await issueLoginOtpGuarded(user);
        if (result.invalid) return res.status(401).json({ error: 'Utente non valido.' });
        if (result.locked) return res.status(423).json(loginLockedPayload(result.user));
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
    if (!isAccountUsable(user)) return res.status(401).json({error:'Sessione non valida.'});
    const accountType = isStrumentoAccount(user) ? 'strumento' : 'user';
    res.json({
        valid: true,
        id: user.id,
        email: accountType === 'strumento' ? '' : user.email,
        username: user.username || null,
        displayName: displayLoginId(user),
        role: user.role,
        originalRole: user.role,
        accountType,
        cards: cardsFromStored(user.allowedCards, user.role, accountType),
        cardOrder: cardOrderFromStored(user.cardOrder),
        docente: accountType === 'strumento' ? false : normalizeDocente(user.role, user.docente),
        canManageCorsi: accountType === 'strumento' ? false : userCan(user, 'corsi.manage'),
        onboardingDismissed: accountType === 'strumento' ? true : !!user.onboardingDismissed,
    });
});

/** Conferma lettura guida portale; opzionalmente non mostrarla più agli accessi successivi. */
app.post('/api/auth/onboarding-dismiss', authenticate, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
    if (isStrumentoAccount(user)) return res.status(403).json({ error: 'Non applicabile.' });
    const permanent = !!(req.body && req.body.permanent);
    if (permanent) Users.setOnboardingDismissed(user.id, true);
    res.json({ success: true, onboardingDismissed: permanent || !!user.onboardingDismissed });
});

/** Ordine personalizzato delle schede sul portale. */
app.post('/api/auth/card-order', authenticate, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
    const order = Array.isArray((req.body || {}).order) ? (req.body || {}).order : null;
    if (!order) return res.status(400).json({ error: 'Ordine non valido.' });
    const cleaned = [];
    for (const id of order) {
        if (typeof id === 'string' && id.trim() && !cleaned.includes(id.trim())) cleaned.push(id.trim());
    }
    Users.updateCardOrder(user.id, cardOrderToStored(cleaned));
    res.json({ ok: true, cardOrder: cleaned });
});

/** Strumenti con login proprio: ticket monouso dopo login+OTP del portale. */
app.post('/api/auth/sso/ticket', authenticate, (req, res) => {
    const tool = String((req.body || {}).tool || '').trim();
    if (!SSO_TOOLS.has(tool)) return res.status(400).json({ error: 'Strumento non valido.' });
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
    if (!userCanAccessCard(user, tool)) {
        return res.status(403).json({ error: 'Non hai accesso a questo strumento.' });
    }
    purgeSsoTickets();
    const ticket = crypto.randomBytes(32).toString('base64url');
    ssoTickets.set(ssoHash(ticket), {
        tool,
        userId: user.id,
        exp: Date.now() + SSO_TTL_MS,
    });
    const url = ssoRedirectUrl(tool, ticket);
    res.json({ url, tool, expiresIn: Math.floor(SSO_TTL_MS / 1000) });
});

app.options('/api/auth/sso/consume', (req, res) => {
    res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.status(204).end();
});

app.post('/api/auth/sso/consume', (req, res) => {
    res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
    const ticket = String((req.body || {}).ticket || '').trim();
    const tool = String((req.body || {}).tool || '').trim();
    if (!ticket || !SSO_TOOLS.has(tool)) {
        return res.status(400).json({ error: 'Ticket non valido.' });
    }
    purgeSsoTickets();
    const h = ssoHash(ticket);
    const row = ssoTickets.get(h);
    ssoTickets.delete(h);
    if (!row || row.tool !== tool || row.exp <= Date.now()) {
        return res.status(401).json({ error: 'Ticket scaduto o già usato.' });
    }
    const user = Users.findById(row.userId);
    if (!isAccountUsable(user) || !userCanAccessCard(user, tool)) {
        return res.status(401).json({ error: 'Ticket non valido.' });
    }
    const accountType = isStrumentoAccount(user) ? 'strumento' : 'user';
    res.json({
        id: user.id,
        email: user.email || '',
        username: user.username || null,
        displayName: displayLoginId(user),
        nome: user.nome || '',
        cognome: user.cognome || '',
        role: user.role,
        accountType,
        cards: cardsFromStored(user.allowedCards, user.role, accountType),
    });
});

/** SHA-256 hex della frase easter-egg (mai in chiaro). Override: ELEVATE_PHRASE_HASH */
const ELEVATE_PHRASE_HASH = String(
    process.env.ELEVATE_PHRASE_HASH
    || 'dd337a47035257934c25d247363368216330ebbba38ba66328341748a6ea9721'
).toLowerCase();
const _elevateAttempts = new Map(); // userId → { n, resetAt }

function hashElevatePhrase(phrase) {
    return crypto.createHash('sha256').update(String(phrase).toLowerCase(), 'utf8').digest('hex');
}

function elevatePhraseMatches(phrase) {
    const actual = hashElevatePhrase(phrase);
    try {
        const a = Buffer.from(actual, 'hex');
        const b = Buffer.from(ELEVATE_PHRASE_HASH, 'hex');
        if (a.length !== b.length || a.length !== 32) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

function elevateRateLimited(userId) {
    const now = Date.now();
    let entry = _elevateAttempts.get(userId);
    if (!entry || now > entry.resetAt) {
        entry = { n: 0, resetAt: now + 60_000 };
        _elevateAttempts.set(userId, entry);
    }
    entry.n += 1;
    return entry.n > 40;
}

app.post('/api/auth/elevate-session', authenticate, async (req, res) => {
    try {
        if (elevateRateLimited(req.user.id)) {
            return res.status(429).json({ error: 'Troppi tentativi.' });
        }
        const phrase = String((req.body || {}).phrase || '');
        if (!phrase || phrase.length < 6 || phrase.length > 64 || !elevatePhraseMatches(phrase)) {
            return res.status(404).json({ error: 'Non trovato.' });
        }
        const user = Users.findById(req.user.id);
        if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
        if (isStrumentoAccount(user)) return res.status(404).json({ error: 'Non trovato.' });
        res.json({ ok: true, message: 'ZITTO COGLIONE' });
    } catch (err) {
        console.error('[AUTH] elevate-session:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

/** Rate limit forgot-password: max 3 richieste / 3 ore per IP e per email. */
const FORGOT_PW_MAX = 3;
const FORGOT_PW_WINDOW_MS = 3 * 60 * 60 * 1000;
const _forgotPwAttempts = new Map(); // key → { n, resetAt }

/** IP client: preferisce X-Real-IP impostato da nginx ($remote_addr), non spoofabile. */
function clientIp(req) {
    const real = String(req.headers['x-real-ip'] || '').trim();
    if (real) return real;
    return req.socket?.remoteAddress || req.ip || 'unknown';
}

function forgotPasswordRateLimited(key) {
    const now = Date.now();
    let entry = _forgotPwAttempts.get(key);
    if (!entry || now > entry.resetAt) {
        entry = { n: 0, resetAt: now + FORGOT_PW_WINDOW_MS };
        _forgotPwAttempts.set(key, entry);
    }
    entry.n += 1;
    return entry.n > FORGOT_PW_MAX;
}

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const email = String((req.body || {}).email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return res.status(400).json({ error: 'Email non valida.' });
        const ip = clientIp(req);
        if (forgotPasswordRateLimited('ip:' + ip) || forgotPasswordRateLimited('email:' + email)) {
            return res.status(429).json({
                error: 'Troppe richieste. Riprova tra qualche ora.',
            });
        }
        const generic = {
            success: true,
            message: 'Se l\'email è registrata, riceverai un link per reimpostare la password.',
        };
        const user = Users.findByEmail(email);
        if (!isAccountUsable(user) || isStrumentoAccount(user)) return res.json(generic);

        PasswordResets.invalidateForUser(user.id);
        const token = uuidv4();
        PasswordResets.create({
            token,
            userId: user.id,
            email: user.email,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        });
        try { await sendForgotPasswordEmail(user.email, token); }
        catch (e) { console.error('[AUTH] forgot-password email:', e.message); }
        res.json({ ...generic, emailSent: !!transporter });
    } catch (err) {
        console.error('[AUTH] forgot-password:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

function respondResetInfo(res, token) {
    if (!token) return res.status(400).json({ error: 'Token mancante.' });
    const row = PasswordResets.findByToken(token);
    if (!row || row.used) return res.status(404).json({ error: 'Link non valido o già utilizzato.' });
    if (new Date() > new Date(row.expiresAt)) return res.status(400).json({ error: 'Link scaduto. Richiedi un nuovo reset.' });
    return res.json({ email: row.email });
}

/** Preferire POST (token nel body, non nei log URL). GET mantenuto per compatibilità. */
app.post('/api/auth/reset-info', (req, res) => {
    try {
        respondResetInfo(res, String((req.body || {}).token || '').trim());
    } catch (err) {
        console.error('[AUTH] reset-info:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

app.get('/api/auth/reset-info', (req, res) => {
    try {
        respondResetInfo(res, String(req.query.token || '').trim());
    } catch (err) {
        console.error('[AUTH] reset-info:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body || {};
        if (!token || !password) return res.status(400).json({ error: 'Token e password obbligatori.' });
        if (password.length < 8) return res.status(400).json({ error: 'Password di almeno 8 caratteri.' });
        const row = PasswordResets.findByToken(token);
        if (!row || row.used) return res.status(400).json({ error: 'Link non valido o già utilizzato.' });
        if (new Date() > new Date(row.expiresAt)) return res.status(400).json({ error: 'Link scaduto. Richiedi un nuovo reset.' });
        const user = Users.findById(row.userId);
        if (!isAccountUsable(user)) return res.status(400).json({ error: 'Utente non trovato.' });
        Users.changePassword(user.id, await bcrypt.hash(password, 12));
        PasswordResets.markUsed(token);
        res.json({ success: true });
    } catch (err) {
        console.error('[AUTH] reset-password:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
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
        .filter(u => u.email !== SUPERADMIN_EMAIL)
        .map((raw) => {
            const u = expireLoginLockIfNeeded(raw);
            const {
                passwordHash, loginOtp, loginOtpExpiry, tokenVersion,
                otpFailCount, otpSendCount,
                ...safe
            } = u;
            const role = ALL_ROLES.includes(u.role) ? u.role : 'user';
            const locked = isLoginLocked(u);
            const accountType = isStrumentoAccount(u) ? 'strumento' : 'user';
            return {
                ...safe,
                role,
                accountType,
                username: u.username || null,
                displayName: displayLoginId(u),
                cards: cardsFromStored(u.allowedCards, role, accountType),
                docente: accountType === 'strumento' ? false : normalizeDocente(role, u.docente),
                visible: isUserVisible(u),
                hiddenAt: u.hiddenAt || null,
                loginLocked: locked,
                loginLockedUntil: locked ? u.loginLockedUntil : null,
                loginLockedReason: locked ? (u.loginLockedReason || '') : '',
            };
        }));
});

/** Crea un profilo strumento (solo Super Admin): username + password, ruolo reader, solo schede scelte. */
app.post('/api/auth/strumenti', authenticate, requireSuperadmin, async (req, res) => {
    const username = normalizeUsername((req.body || {}).username);
    const password = String((req.body || {}).password || '');
    const cards = sanitizeCards((req.body || {}).cards);
    if (!username) {
        return res.status(400).json({
            error: 'Nome utente non valido. Usa 3–32 caratteri: lettere, numeri, punto, _ o -.',
        });
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password minimo 8 caratteri.' });
    if (!cards) return res.status(400).json({ error: 'Seleziona almeno uno strumento da monitorare.' });
    if (Users.findByUsername(username) || Users.findByEmail(strumentoSyntheticEmail(username))) {
        return res.status(409).json({ error: 'Nome utente già in uso.' });
    }
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    Users.insert({
        id,
        email: strumentoSyntheticEmail(username),
        username,
        accountType: 'strumento',
        passwordHash,
        role: 'reader',
        createdAt: new Date().toISOString(),
        mustChangePassword: false,
        allowedCards: cardsToStored(cards),
        docente: false,
        nome: username,
        cognome: '',
        grado: '',
    });
    res.json({
        id,
        username,
        role: 'reader',
        accountType: 'strumento',
        cards,
    });
});

app.post('/api/auth/users/bulk-cards', authenticate, requireAdmin, (req, res) => {
    const raw = Array.isArray(req.body && req.body.updates) ? req.body.updates : [];
    if (!raw.length) return res.status(400).json({ error: 'Nessuna modifica da salvare.' });

    const actor = Users.findById(req.user.id) || req.user;
    const myLevel = ROLE_LEVEL[req.user.role] ?? 0;
    const prepared = [];
    for (const item of raw) {
        const id = String((item && item.userId) || '').trim();
        if (!id || id === req.user.id) continue;
        const user = Users.findById(id);
        if (!user || user.revokedAt || user.role === 'superadmin' || isLockedProfile(user.email)) continue;
        if (isStrumentoAccount(user)) continue;
        if ((ROLE_LEVEL[user.role] ?? 0) >= myLevel) continue;
        if (!isUserVisible(user)) {
            return res.status(403).json({
                error: `Le autorizzazioni di ${user.email} non si possono modificare: utente non visibile.`,
            });
        }
        const currentCards = cardsFromStored(user.allowedCards, user.role);
        const hasCards = Object.prototype.hasOwnProperty.call(item, 'cards');
        let cards = currentCards;
        if (hasCards) {
            cards = sanitizeCards(item.cards);
            if (!cards) {
                return res.status(400).json({ error: `Ogni utente deve avere almeno una scheda (${user.email}).` });
            }
        }
        const currentDocente = normalizeDocente(user.role, user.docente);
        const hasDocente = Object.prototype.hasOwnProperty.call(item, 'docente');
        const docente = hasDocente
            ? normalizeDocente(user.role, item.docente)
            : currentDocente;
        const cardsLine = cardsDiffLine(currentCards, cards);
        const docenteChanged = currentDocente !== docente;
        prepared.push({ user, cards, docente, cardsLine, docenteChanged, currentCards });
    }
    if (!prepared.length) return res.status(400).json({ error: 'Nessun utente aggiornabile.' });

    let updated = 0;
    let unchanged = 0;
    for (const item of prepared) {
        if (!item.cardsLine && !item.docenteChanged) { unchanged++; continue; }
        if (item.cardsLine) Users.updateAllowedCards(item.user.id, cardsToStored(item.cards));
        if (item.docenteChanged) Users.updateDocente(item.user.id, item.docente);
        updated++;
        const parts = [];
        if (item.cardsLine) parts.push(item.cardsLine);
        if (item.docenteChanged) {
            parts.push(item.docente ? 'Categoria Docente: attivata' : 'Categoria Docente: rimossa');
        }
        notifyUser(
            item.user.id,
            'cards_granted',
            'Accessi del portale aggiornati',
            `${actorLabel(actor)} ha aggiornato i tuoi accessi. ${parts.join('; ')}.`,
            '/portal'
        );
    }
    res.json({ success: true, updated, unchanged });
});

app.patch('/api/auth/users/:id/visibility', authenticate, requireAdmin, async (req, res) => {
    const wantVisible = req.body && req.body.visible;
    if (typeof wantVisible !== 'boolean') {
        return res.status(400).json({ error: 'Indica se l\'utente deve essere visibile.' });
    }
    const user = Users.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utente non trovato.' });
    if (user.revokedAt) return res.status(403).json({ error: 'Utente revocato.' });
    if (user.role === 'superadmin') {
        return res.status(403).json({ error: 'I superadmin non possono essere nascosti.' });
    }
    if (req.user.id === user.id) {
        return res.status(403).json({ error: 'Non puoi modificare la visibilità del tuo profilo.' });
    }
    const myLevel = ROLE_LEVEL[req.user.role] ?? 0;
    const targetLevel = ROLE_LEVEL[user.role] ?? 0;
    if (targetLevel >= myLevel) return res.status(403).json({ error: 'Permessi insufficienti.' });
    if (isUserVisible(user) === wantVisible) {
        return res.json({ success: true, visible: wantVisible, unchanged: true });
    }
    // Ripristino utenti eliminati: solo Super Admin
    if (wantVisible && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Solo il Super Admin può ripristinare gli utenti eliminati.' });
    }
    const result = await applyVisibility(user, wantVisible);
    return res.json({ success: true, ...result });
});

app.patch('/api/auth/users/:id', authenticate, requireAdmin,(req,res)=>{
    const {role:newRole}=req.body||{};
    if (!ALL_ROLES.includes(newRole)) return res.status(400).json({error:'Ruolo non valido.'});
    const user=Users.findById(req.params.id);
    if (!user) return res.status(404).json({error:'Utente non trovato.'});
    if (user.revokedAt) return res.status(403).json({error:'Utente revocato.'});
    if (user.role==='superadmin') return res.status(403).json({error:'I superadmin non possono essere modificati.'});
    if (req.user.id===user.id) return res.status(403).json({error:'Non puoi modificare il tuo ruolo.'});
    if (isStrumentoAccount(user)) {
        return res.status(403).json({ error: 'I profili strumento restano in sola lettura. Modifica solo gli strumenti assegnati.' });
    }
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

/** Sblocca un account bloccato per troppi tentativi OTP (prima delle 2 ore). */
app.post('/api/auth/users/:id/unlock-login', authenticate, requireAdmin, (req, res) => {
    let user = Users.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utente non trovato.' });
    if (user.revokedAt) return res.status(403).json({ error: 'Utente revocato.' });
    if (user.role === 'superadmin') {
        return res.status(403).json({ error: 'Il Super Admin non può essere sbloccato in anticipo: attendere le 2 ore.' });
    }
    const myLevel = ROLE_LEVEL[req.user.role] ?? 0;
    const targetLevel = ROLE_LEVEL[user.role] ?? 0;
    if (targetLevel >= myLevel) return res.status(403).json({ error: 'Permessi insufficienti.' });
    user = expireLoginLockIfNeeded(user);
    Users.clearLoginLock(user.id);
    notifyUser(
        user.id,
        'login_unlocked',
        'Accesso sbloccato',
        'Un amministratore ha sbloccato il tuo account. Puoi accedere di nuovo.',
        '/login.html'
    );
    res.json({ success: true });
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

    if (isStrumentoAccount(user)) {
        return res.json({
            success: true,
            emailSent: false,
            temporaryPassword: tempPassword,
            warning: 'Profilo strumento: comunica manualmente la password temporanea (nessuna email).',
        });
    }

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
    const updated = Users.findById(user.id);
    const token = issueSessionToken({ ...updated, mustChangePassword: false });
    res.json({success:true,token});
});

// ── PATCH /api/auth/users/:id/profile  (admin/SA: diretto; strumento: solo SA) ─
app.patch('/api/auth/users/:id/profile', authenticate, requireAdmin,(req,res)=>{
    const user=Users.findById(req.params.id);
    if (!user) return res.status(404).json({error:'Utente non trovato.'});
    if (isLockedProfile(user.email)) return res.status(403).json({error:'Il profilo di sistema non può essere modificato.'});
    const beforeCards = cardsFromStored(user.allowedCards, user.role, user.accountType);
    let hasCards = Object.prototype.hasOwnProperty.call(req.body || {}, 'cards');
    let selectedCards = null;
    if (hasCards) {
        selectedCards = sanitizeCards(req.body.cards);
        if (!selectedCards) return res.status(400).json({error:'Seleziona almeno una scheda del portale.'});
    }
    let hasDocente = Object.prototype.hasOwnProperty.call(req.body || {}, 'docente');
    if (isStrumentoAccount(user)) {
        hasDocente = false;
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ error: 'Solo il Super Admin gestisce i profili strumento.' });
        }
        if (!hasCards) {
            return res.status(400).json({ error: 'Seleziona almeno uno strumento per questo profilo.' });
        }
        Users.updateAllowedCards(user.id, cardsToStored(selectedCards));
        return res.json({
            success: true,
            cards: selectedCards,
            accountType: 'strumento',
            username: user.username,
        });
    }
    if (!isUserVisible(user) && (hasCards || hasDocente)) {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({
                error: 'Le autorizzazioni di un utente non visibile non si possono modificare. Rendilo di nuovo visibile prima.',
            });
        }
        hasCards = false;
        selectedCards = null;
        hasDocente = false;
    }

    // Admin/SA: azione diretta (stessi poteri, con vincolo di livello)
    if (req.user.id !== user.id) {
        const myLevel = ROLE_LEVEL[req.user.role] ?? 0;
        const targetLevel = ROLE_LEVEL[user.role] ?? 0;
        if (user.role === 'superadmin' || targetLevel >= myLevel) {
            return res.status(403).json({error:'Permessi insufficienti.'});
        }
    }

    const parsed = parseProfileBody(req.body);
    // Admin può aggiornare solo cards/docente senza anagrafica completa
    const hasProfileFields = !!(
        String((req.body || {}).nome || '').trim()
        || String((req.body || {}).cognome || '').trim()
        || String((req.body || {}).grado || '').trim()
    );
    if (hasProfileFields && parsed.error) return res.status(400).json({error: parsed.error});
    if (!hasProfileFields && !hasCards && !hasDocente) {
        return res.status(400).json({error:'Nessuna modifica consentita.'});
    }

    let afterCards = beforeCards;
    if (hasProfileFields && !parsed.error) {
        Users.updateProfile(user.id, parsed.profile);
    }
    if (hasCards) {
        Users.updateAllowedCards(user.id, cardsToStored(selectedCards));
        afterCards = selectedCards;
    }
    let afterDocente = normalizeDocente(user.role, user.docente);
    if (hasDocente) {
        afterDocente = normalizeDocente(user.role, req.body.docente);
        Users.updateDocente(user.id, afterDocente);
    }
    if (user.id !== req.user.id) {
        const actor = Users.findById(req.user.id) || req.user;
        const changes = hasProfileFields && !parsed.error ? profileDiffLines(user, parsed.profile) : [];
        const cardsLine = cardsDiffLine(beforeCards, afterCards);
        if (cardsLine) changes.push(cardsLine);
        if (!!normalizeDocente(user.role, user.docente) !== afterDocente) {
            changes.push(afterDocente ? 'Categoria Docente: attivata' : 'Categoria Docente: rimossa');
        }
        if (changes.length) {
            notifyUser(
                user.id,
                'profile_updated',
                'Profilo aggiornato da un amministratore',
                `${actorLabel(actor)} ha modificato i tuoi dati. ${summarizeChanges(changes)}`,
                '/profilo'
            );
        }
    }
    const updated = Users.findById(user.id);
    res.json({
        success: true,
        cards: cardsFromStored(updated.allowedCards, updated.role, updated.accountType),
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
    const whoUser = {
        ...me,
        nome: me.nome || parsed.profile.nome,
        cognome: me.cognome || parsed.profile.cognome,
    };
    notifyAdmins(
        'profile_request',
        'Nuova richiesta di modifica profilo',
        `${subjectLabel(whoUser)} ha inviato una richiesta di modifica. ${changeSummary}`,
        '/gestione-utenti#approvals',
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

// ── GET /api/auth/admin-requests  (azioni admin in attesa di approvazione) ────
app.get('/api/auth/admin-requests', authenticate, requireAdmin,(req,res)=>{
    res.json(AdminActionRequests.findPending().map(r => {
        let approvals = [];
        try { approvals = JSON.parse(r.approvals || '[]'); } catch {}
        const requester = Users.findById(r.requestedById);
        const target = Users.findById(r.targetUserId);
        let payloadProfile = null;
        try {
            const payload = JSON.parse(r.payload || '{}');
            if (payload && payload.profile) payloadProfile = payload.profile;
        } catch { /* ignore */ }
        const requesterLabel = subjectLabel({
            ...(requester || { email: r.requestedByEmail }),
            nome: (requester && requester.nome) || (payloadProfile && r.requestedById === r.targetUserId ? payloadProfile.nome : '') || '',
            cognome: (requester && requester.cognome) || (payloadProfile && r.requestedById === r.targetUserId ? payloadProfile.cognome : '') || '',
        });
        const targetLabel = subjectLabel({
            ...(target || { email: r.targetEmail }),
            nome: (target && target.nome) || (payloadProfile && payloadProfile.nome) || '',
            cognome: (target && target.cognome) || (payloadProfile && payloadProfile.cognome) || '',
        });
        return {
            id: r.id,
            type: r.type,
            typeLabel: ACTION_LABEL[r.type] || r.type,
            targetEmail: r.targetEmail,
            targetLabel,
            summary: r.summary,
            requestedById: r.requestedById,
            requestedByEmail: r.requestedByEmail,
            requestedByLabel: requesterLabel,
            requestedAt: r.requestedAt,
            approvals: approvals.map(a => {
                const u = Users.findById(a.id);
                return { id: a.id, email: a.email, label: subjectLabel(u || { email: a.email }), at: a.at };
            }),
            needed: (r.type === 'visibility' || r.type === 'delete') ? 1 : ADMIN_APPROVALS_NEEDED,
            superadminOnly: r.type === 'visibility' || r.type === 'delete',
        };
    }));
});

// ── POST /api/auth/admin-requests/:id/approve ─────────────────────────────────
app.post('/api/auth/admin-requests/:id/approve', authenticate, requireAdmin, async (req,res)=>{
    const r = AdminActionRequests.findById(req.params.id);
    if (!r || r.status !== 'pending') return res.status(404).json({error:'Richiesta non trovata.'});
    if (r.requestedById === req.user.id) return res.status(403).json({error:'Non puoi approvare una tua richiesta.'});
    if ((r.type === 'visibility' || r.type === 'delete') && req.user.role !== 'superadmin') {
        return res.status(403).json({error:'Solo il Super Admin può approvare le richieste di visibilità.'});
    }
    let approvals = [];
    try { approvals = JSON.parse(r.approvals || '[]'); } catch {}
    if (approvals.some(a => a.id === req.user.id)) return res.status(409).json({error:'Hai già approvato questa richiesta.'});
    const approver = Users.findById(req.user.id) || req.user;

    if (req.user.role !== 'superadmin') {
        approvals.push({ id: req.user.id, email: req.user.email, at: new Date().toISOString() });
        AdminActionRequests.setApprovals(r.id, JSON.stringify(approvals));
        if (approvals.length < ADMIN_APPROVALS_NEEDED) {
            notifyUser(
                r.requestedById,
                'admin_action_progress',
                'Richiesta approvata parzialmente',
                `${actorLabel(approver)} ha approvato la tua richiesta (${r.summary}). Approvazioni: ${approvals.length}/${ADMIN_APPROVALS_NEEDED}.`,
                '/gestione-utenti#approvals'
            );
            return res.json({ success: true, executed: false, approvals: approvals.length, needed: ADMIN_APPROVALS_NEEDED });
        }
    }

    const err = await executeAdminAction(r);
    if (err) {
        AdminActionRequests.reject(r.id, 'system');
        notifyUser(
            r.requestedById,
            'admin_action_rejected',
            'Richiesta annullata',
            `La tua richiesta (${r.summary}) non è più applicabile: ${err}`,
            '/gestione-utenti#approvals'
        );
        return res.status(409).json({error:`Impossibile applicare la richiesta: ${err} La richiesta è stata annullata.`});
    }
    AdminActionRequests.approve(r.id, req.user.email);
    notifyUser(
        r.requestedById,
        'admin_action_approved',
        'Richiesta approvata ed eseguita',
        `${actorLabel(approver)} ha approvato la tua richiesta: ${r.summary}. L'operazione è stata applicata.`,
        '/gestione-utenti'
    );
    res.json({ success: true, executed: true });
});

// ── DELETE /api/auth/admin-requests/:id  (rifiuta o annulla) ──────────────────
app.delete('/api/auth/admin-requests/:id', authenticate, requireAdmin,(req,res)=>{
    const r = AdminActionRequests.findById(req.params.id);
    if (!r || r.status !== 'pending') return res.status(404).json({error:'Richiesta non trovata.'});
    AdminActionRequests.reject(r.id, req.user.email);
    if (r.requestedById !== req.user.id) {
        notifyUser(
            r.requestedById,
            'admin_action_rejected',
            'Richiesta rifiutata',
            `${actorLabel(Users.findById(req.user.id) || req.user)} ha rifiutato la tua richiesta: ${r.summary}.`,
            '/gestione-utenti#approvals'
        );
    }
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
mountCorsiRoutes(app, { authenticate, requireDocente, requireCorsiAccess, notifyCorsiEditors, actorLabel });

app.listen(PORT,'0.0.0.0',()=>console.log(`Auth service in ascolto su http://0.0.0.0:${PORT}`));
