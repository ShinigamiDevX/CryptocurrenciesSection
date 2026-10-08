'use strict';
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { Users, Invitations, ProfileChangeRequests, Notifications, Idee, Messages, Groups, Attachments, StickerFavorites, AppMeta, PasswordResets, TelegramLinks, profileDefaults, startBackupScheduler, pruneStaleAuthData } = require('./db');
const { mountCorsiRoutes } = require('./corsi-content');
const { mountBibbiaRoutes } = require('./bibbia-routes');
const { mountSeedPhraseRoutes } = require('./seed-phrase-generate');
const { createTelegramCriptogram } = require('./telegram-criptogram');

const app  = express();
app.use(express.json({ limit: '16mb' }));

const PORT             = process.env.PORT || 4000;
const DATA_DIR         = path.join(__dirname, 'data');
const ATTACHMENTS_DIR  = path.join(DATA_DIR, 'attachments');
const SECRET_FILE      = path.join(DATA_DIR, 'secret.key');
try { fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true }); } catch { /* ok */ }
const SUPERADMIN_EMAIL = 'portalecrypto@proton.me';
const SUPERADMIN_NOME  = 'Super Admin';
const SUPERADMIN_COGNOME = '';
const SUPERADMIN_USERNAME = 'Amministratore Portale';
const PORTAL_URL       = (process.env.PORTAL_URL || 'https://cryptosection.chainholder.dev').replace(/\/$/, '');
const telegramCriptogram = createTelegramCriptogram({ TelegramLinks, portalUrl: PORTAL_URL });
const ROLE_LEVEL       = { reader: 0, user: 1, admin: 2, superadmin: 3 }; // reader = profili strumento (sola lettura)
/** Ruoli assegnabili a utenti umani (inviti / cambio ruolo). */
const ALL_ROLES        = ['user', 'admin', 'superadmin'];
/** Schede dashboard assegnabili in invito (gestione-utenti resta solo per admin/superadmin). */
const ASSIGNABLE_CARDS = [
    'ai', 'analisi-report', 'apinga', 'chainholder', 'cluster', 'corsi',
    'cryptomonitor', 'cryptoscanner', 'gelato', 'la-bibbia', 'li-tools', 'materiali', 'monitoring',
    'seed-phrase', 'siena', 'terra', 'tools-europol', 'vysion', 'xpublicator',
];
const STRUMENTO_EMAIL_DOMAIN = 'strumento.local';
const CARD_HOME = {
    'analisi-report': '/analisi-report',
    'cluster': 'https://192.168.4.80:3444',
    'corsi': '/corsi',
    'cryptomonitor': 'https://192.168.4.80:5173',
    'materiali': 'https://192.168.4.80:5174',
    'monitoring': 'http://localhost:5002/holdertrack/monitor.php',
    'apinga': 'http://192.168.4.80:5001',
    'cryptoscanner': '/cryptoscanner',
    'la-bibbia': '/la-bibbia',
    'seed-phrase': '/seed-phrase',
    'xpublicator': '/xpublicator',
    'gelato': 'http://192.168.4.80:5005',
    'li-tools': '/li-tools',
    'siena': '/siena-constructor/',
    'terra': 'http://192.168.4.80:7860',
    'tools-europol': '/tools-europol',
    'vysion': 'http://192.168.4.80:3002',
};
const VYSION_URL = (process.env.VYSION_URL || 'http://192.168.4.80:3002').replace(/\/$/, '');
const CHAINHOLDER_URL = (process.env.CHAINHOLDER_URL || 'http://192.168.1.73:3000').replace(/\/$/, '');
const CHAINHOLDER_HOME = process.env.CHAINHOLDER_HOME || '/dashboard/requests';
const CRYPTOMONITOR_URL = (process.env.CRYPTOMONITOR_URL || 'https://192.168.4.80:5173').replace(/\/$/, '');
const MONITORING_URL = (process.env.MONITORING_URL || 'http://localhost:5002/holdertrack/monitor.php').replace(/\/$/, '');
const SSO_TTL_MS = 15 * 60 * 1000;
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
    if (tool === 'monitoring') {
        const base = MONITORING_URL.includes('?') ? MONITORING_URL.split('?')[0] : MONITORING_URL;
        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}sso=${q}`;
    }
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

const EUROTOOLS_CARD_CHILDREN = new Set([
    'apinga', 'cryptoscanner', 'xpublicator', 'gelato', 'li-tools', 'siena', 'terra', 'vysion',
]);

function userCanAccessCard(user, cardId) {
    if (!user || !cardId) return false;
    if (user.role === 'superadmin' && !isStrumentoAccount(user)) return true;
    const cards = cardsFromStored(user.allowedCards, user.role, user.accountType);
    if (cards.includes(cardId)) return true;
    if (EUROTOOLS_CARD_CHILDREN.has(cardId) && cards.includes('tools-europol')) return true;
    return false;
}

const SSO_TOOLS = new Set(['chainholder', 'cryptomonitor', 'monitoring', 'vysion']);

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
    const u = String(raw || '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(u)) return null;
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
    const NEW_CARDS = ['apinga', 'cryptoscanner', 'gelato', 'la-bibbia', 'li-tools', 'monitoring', 'seed-phrase', 'siena', 'terra', 'tools-europol', 'vysion', 'xpublicator'];
    const EURO_CHILDREN = ['apinga', 'cryptoscanner', 'xpublicator', 'gelato', 'li-tools', 'siena', 'terra', 'vysion'];
    try {
        const users = Users.findActive();
        for (const user of users) {
            if (user.accountType === 'strumento') continue;
            if (user.role === 'reader') continue; // profili strumento
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
            if (!next.includes('tools-europol') && EURO_CHILDREN.some((id) => next.includes(id))) {
                next.push('tools-europol');
                changed = true;
            }
            if (changed) Users.updateAllowedCards(user.id, cardsToStored(next));
        }
    } catch (err) {
        console.warn('[AUTH] Migrazione schede nuove saltata:', err.message);
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
            username: SUPERADMIN_USERNAME,
            accountType: user.accountType || 'user',
            canSetUsername: false,
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
        username: user.username || '',
        accountType: user.accountType || 'user',
        canSetUsername: !isStrumentoAccount(user),
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

function packNotifBody(body, meta) {
    if (!meta || typeof meta !== 'object') return body || '';
    return JSON.stringify({
        v: 1,
        actor: String(meta.actor || '').trim(),
        topic: String(meta.topic || '').trim(),
        detail: meta.detail != null ? String(meta.detail) : String(body || ''),
    });
}

function notifyUser(userId, type, title, body, link, meta) {
    if (!userId) return;
    Notifications.insert({
        id: uuidv4(),
        userId,
        type,
        title,
        body: packNotifBody(body, meta),
        link: link || '',
        createdAt: new Date().toISOString(),
    });
}

function notifyAdmins(type, title, body, link, exceptUserId, meta) {
    Users.findActive()
        .filter(u => isUserVisible(u) && (u.role === 'admin' || u.role === 'superadmin') && u.id !== exceptUserId)
        .forEach(u => notifyUser(u.id, type, title, body, link, meta));
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
    const reason = (user && user.loginLockedReason) || '';
    if (reason === 'admin') {
        return {
            error: 'Account bloccato',
            locked: true,
            lockedUntil: until || null,
            code: 'LOGIN_LOCKED',
            reason: 'admin',
        };
    }
    return {
        error: `Account bloccato per troppi tentativi. Riprova dopo le ${formatLockUntil(until)} (blocco di 2 ore).`,
        locked: true,
        lockedUntil: until || null,
        code: 'LOGIN_LOCKED',
        reason: reason || 'otp',
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
            : reason === 'admin'
                ? 'blocco Super Admin'
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
    monitoring: 'Monitoring',
    apinga: 'Apinga',
    cryptoscanner: 'CryptoScanner',
    gelato: 'GELATO',
    'li-tools': 'LI Tools',
    siena: 'SIENA Constructor',
    terra: 'Terra',
    'tools-europol': 'Tools Europol',
    vysion: 'Vysion',
    xpublicator: 'Xpublicator',
    'la-bibbia': 'LA BIBBIA 3.1',
    'seed-phrase': 'Seed Phrase',
    idee: 'Idee e proposte',
};

const IDEA_TOPICS = [{ key: 'portale', label: 'Portale' }].concat(
    Object.keys(CARD_LABEL)
        .filter((key) => key !== 'idee')
        .map((key) => ({ key, label: CARD_LABEL[key] }))
        .sort((a, b) => a.label.localeCompare(b.label, 'it'))
);

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
            username: SUPERADMIN_USERNAME,
        });
        console.log('[AUTH] Superadmin creato (password iniziale da cambiare al primo accesso)');
    } else {
        // Profilo di sistema fisso: Super Admin, senza cognome né grado
        Users.updateProfile(existing.id, { nome: SUPERADMIN_NOME, cognome: SUPERADMIN_COGNOME, grado: '' });
        if (String(existing.username || '').trim() !== SUPERADMIN_USERNAME) {
            Users.setUsername(existing.id, SUPERADMIN_USERNAME);
        }
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
        let dbUser = Users.findById(req.user.id);
        if (!isAccountUsable(dbUser)) return res.status(401).json({error:'Sessione non valida.'});
        dbUser = expireLoginLockIfNeeded(dbUser);
        if (isLoginLocked(dbUser)) {
            return res.status(401).json({
                error: dbUser.loginLockedReason === 'admin' ? 'Account bloccato' : 'Sessione non valida.',
                code: 'LOGIN_LOCKED',
                reason: dbUser.loginLockedReason || '',
            });
        }
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
    const isStrumento = isStrumentoAccount(user);
    const payload = {
        id: user.id,
        email: user.email,
        role: user.role,
        mustChangePassword: !!user.mustChangePassword,
        tokenVersion: Number(user.tokenVersion) || 0,
        accountType: isStrumento ? 'strumento' : 'user',
    };
    // Profili strumento (kiosk/monitor): sessione portale senza scadenza
    if (isStrumento) {
        return jwt.sign(payload, JWT_SECRET);
    }
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
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
    const lockedUser = expireLoginLockIfNeeded(user);
    if (isLoginLocked(lockedUser)) {
        return res.status(423).json(loginLockedPayload(lockedUser));
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
    if (isLoginLocked(user)) {
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
        avatarVersion: user.avatarVersion || 0,
    });
});

// ── Immagine di profilo ───────────────────────────────────────────────────────
const AVATAR_MAX_BYTES = 400 * 1024;
const AVATAR_MIMES = {
    'image/jpeg': (b) => b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
    'image/png':  (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47,
    'image/webp': (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
};

function parseAvatarDataUrl(raw) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(raw || ''));
    if (!m) return { error: 'Formato immagine non supportato. Usa JPG, PNG o WebP.' };
    const mime = m[1];
    const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
    if (!buf.length) return { error: 'Immagine vuota.' };
    if (buf.length > AVATAR_MAX_BYTES) return { error: 'Immagine troppo grande (massimo 400 KB).' };
    if (!AVATAR_MIMES[mime](buf)) return { error: 'Il file non è un\'immagine valida.' };
    return { mime, buf };
}

function sendAvatar(res, av) {
    if (!av) return res.status(204).end();
    res.set('Content-Type', av.mime);
    res.set('Cache-Control', 'private, no-cache');
    res.set('X-Avatar-Version', String(av.version));
    res.send(av.data);
}

app.get('/api/auth/avatar/me', authenticate, (req, res) => {
    sendAvatar(res, Users.getAvatar(req.user.id));
});

app.get('/api/auth/avatar/:userId', authenticate, (req, res) => {
    const target = Users.findById(String(req.params.userId || ''));
    if (!target) return res.status(404).end();
    sendAvatar(res, Users.getAvatar(target.id));
});

app.put('/api/auth/avatar', authenticate, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
    if (isStrumentoAccount(user)) return res.status(403).json({ error: 'Non disponibile per i profili strumento.' });
    const parsed = parseAvatarDataUrl((req.body || {}).image);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    Users.setAvatar(user.id, parsed.buf, parsed.mime);
    const updated = Users.findById(user.id);
    res.json({ ok: true, avatarVersion: updated.avatarVersion || 0 });
});

app.delete('/api/auth/avatar', authenticate, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
    Users.setAvatar(user.id, null, '');
    const updated = Users.findById(user.id);
    res.json({ ok: true, avatarVersion: updated.avatarVersion || 0 });
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
        const generic = {
            success: true,
            message: 'Se l\'email è registrata, riceverai un link per reimpostare la password. Controlla anche spam/promozioni.',
        };
        const user = Users.findByEmail(email);
        if (!isAccountUsable(user) || isStrumentoAccount(user)) {
            console.log(`[AUTH] forgot-password: nessun invio per ${email} (non trovato / non idoneo)`);
            return res.json(generic);
        }

        // Rate limit solo se l'account esiste (evita lockout su typo email)
        if (forgotPasswordRateLimited('ip:' + ip) || forgotPasswordRateLimited('email:' + email)) {
            console.warn(`[AUTH] forgot-password rate-limited ip=${ip} email=${email}`);
            return res.status(429).json({
                error: 'Troppe richieste. Riprova tra qualche ora.',
            });
        }

        PasswordResets.invalidateForUser(user.id);
        const token = uuidv4();
        PasswordResets.create({
            token,
            userId: user.id,
            email: user.email,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        });
        let emailSent = false;
        try {
            emailSent = !!(await sendForgotPasswordEmail(user.email, token));
        } catch (e) {
            console.error('[AUTH] forgot-password email:', e.message);
        }
        if (!emailSent) {
            console.error(`[AUTH] forgot-password: token creato ma email NON inviata a ${user.email}`);
        }
        res.json({ ...generic, emailSent });
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

function resolveRegisterUsername(raw, selfId) {
    const value = String(raw || '').trim();
    if (!value) return { username: null };
    const username = normalizeUsername(value);
    if (!username) {
        return {
            status: 400,
            error: 'Nome utente non valido. Usa 3–32 caratteri: lettere, numeri, punto, _ o -, senza spazi.',
        };
    }
    const takenByName = Users.findByUsername(username);
    if (takenByName && takenByName.id !== selfId) {
        return { status: 409, error: 'Questo nome utente è già in uso.' };
    }
    const takenByEmail = Users.findByEmail(strumentoSyntheticEmail(username));
    if (takenByEmail && takenByEmail.id !== selfId) {
        return { status: 409, error: 'Questo nome utente è già in uso.' };
    }
    return { username };
}

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
        const chosen = resolveRegisterUsername(req.body.username, ex && ex.id);
        if (chosen.error) return res.status(chosen.status).json({ error: chosen.error });
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
            username: chosen.username,
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
                otpFailCount, otpSendCount, avatar, avatarMime,
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

/** Super Admin: blocca l'accesso di un utente per 2 ore. */
app.post('/api/auth/users/:id/lock-login', authenticate, requireSuperadmin, (req, res) => {
    let user = Users.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utente non trovato.' });
    if (user.revokedAt) return res.status(403).json({ error: 'Utente revocato.' });
    if (req.user.id === user.id) return res.status(403).json({ error: 'Non puoi bloccare il tuo account da qui.' });
    if (user.role === 'superadmin') {
        return res.status(403).json({ error: 'Il Super Admin non può essere bloccato.' });
    }
    const myLevel = ROLE_LEVEL[req.user.role] ?? 0;
    const targetLevel = ROLE_LEVEL[user.role] ?? 0;
    if (targetLevel >= myLevel) return res.status(403).json({ error: 'Permessi insufficienti.' });
    user = expireLoginLockIfNeeded(user);
    if (isLoginLocked(user)) {
        return res.json({
            success: true,
            alreadyLocked: true,
            loginLockedUntil: user.loginLockedUntil || null,
        });
    }
    const updated = applyLoginLock(user, 'admin');
    notifyUser(
        user.id,
        'login_locked',
        'Accesso bloccato',
        'Un Super Admin ha bloccato il tuo account per 2 ore.',
        '/login.html'
    );
    res.json({
        success: true,
        loginLockedUntil: updated && updated.loginLockedUntil ? updated.loginLockedUntil : null,
    });
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

// ── POST /api/auth/username  (alias di login, immediato, opzionale) ──────────
app.post('/api/auth/username', authenticate, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
    if (isLockedProfile(user.email)) {
        return res.status(403).json({ error: 'Il nome utente del Super Admin non è modificabile.' });
    }
    if (isStrumentoAccount(user)) {
        return res.status(403).json({ error: 'Il nome utente di un profilo strumento è assegnato dal Super Admin.' });
    }
    const raw = String((req.body || {}).username || '').trim();
    if (!raw) {
        Users.setUsername(user.id, null);
        return res.json({ success: true, username: '' });
    }
    const username = normalizeUsername(raw);
    if (!username) {
        return res.status(400).json({
            error: 'Nome utente non valido. Usa 3–32 caratteri: lettere, numeri, punto, _ o -, senza spazi.',
        });
    }
    const takenByName = Users.findByUsername(username);
    if (takenByName && takenByName.id !== user.id) {
        return res.status(409).json({ error: 'Questo nome utente è già in uso.' });
    }
    const takenByEmail = Users.findByEmail(strumentoSyntheticEmail(username));
    if (takenByEmail && takenByEmail.id !== user.id) {
        return res.status(409).json({ error: 'Questo nome utente è già in uso.' });
    }
    try {
        Users.setUsername(user.id, username);
    } catch (e) {
        if (/UNIQUE/i.test(String(e && e.message))) {
            return res.status(409).json({ error: 'Questo nome utente è già in uso.' });
        }
        throw e;
    }
    res.json({ success: true, username });
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
    res.json({
        ...publicProfile(user, isLockedProfile(user.email)),
        avatarVersion: user.avatarVersion || 0,
        canSetAvatar: !isStrumentoAccount(user),
    });
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
        req.user.id,
        { actor: subjectLabel(whoUser), detail: `${subjectLabel(whoUser)} ha inviato una richiesta di modifica. ${changeSummary}` }
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

// ── POST /api/auth/notifications/:id/unread ───────────────────────────────────
app.post('/api/auth/notifications/:id/unread', authenticate,(req,res)=>{
    Notifications.markUnread(req.params.id, req.user.id);
    res.json({ success: true, unread: Notifications.countUnread(req.user.id) });
});

// ── DELETE /api/auth/notifications/:id ────────────────────────────────────────
app.delete('/api/auth/notifications/:id', authenticate,(req,res)=>{
    Notifications.remove(req.params.id, req.user.id);
    res.json({ success: true, unread: Notifications.countUnread(req.user.id) });
});

// ── POST /api/auth/notifications/read-all ─────────────────────────────────────
app.post('/api/auth/notifications/read-all', authenticate,(req,res)=>{
    Notifications.markAllRead(req.user.id);
    res.json({ success: true, unread: 0 });
});

function messagePeerLabel(user) {
    if (user && isLockedProfile(user.email)) return SUPERADMIN_USERNAME;
    const username = String(user.username || '').trim();
    const name = personName(user);
    if (username && name) return `${username} · ${name}`;
    return username || name || (user && user.email) || 'utente';
}

function messageableUsers(selfId) {
    return Users.findActive().filter((u) =>
        u.id !== selfId && isAccountUsable(u) && !isStrumentoAccount(u)
    );
}

const CHAT_STICKERS = ['😀','😂','😍','🤩','😎','😭','😡','🤯','🤔','😴','🤝','👍','👎','🙏','🔥','💯','🎉','❤️','💙','💚','🧡','💜','🖤','✨','⭐','🚀','⚡','💎','🛡️','🕵️','🐺','🐱','🐶','🦄','🍕','☕','🏆','🎯','💪','🫡','😇','🥳'];
const CHAT_STICKER_SET = new Set(CHAT_STICKERS);
const EMOJI_DIR = process.env.EMOJI_DIR
    ? path.resolve(process.env.EMOJI_DIR)
    : path.resolve(__dirname, '..', 'emoji');
const PACK_STICKER_RE = /^[A-Za-z0-9_\-]+\.png$/i;
let _emojiPackCache = { at: 0, files: [], categories: [] };

function listEmojiPack() {
    const now = Date.now();
    if (_emojiPackCache.files.length && (now - _emojiPackCache.at) < 60000) {
        return _emojiPackCache;
    }
    try {
        const onDisk = new Set(
            fs.readdirSync(EMOJI_DIR).filter((name) => PACK_STICKER_RE.test(name))
        );
        let categories = [];
        const orderPath = path.join(EMOJI_DIR, 'order.json');
        if (fs.existsSync(orderPath)) {
            try {
                const raw = JSON.parse(fs.readFileSync(orderPath, 'utf8'));
                const cats = Array.isArray(raw && raw.categories) ? raw.categories : [];
                const seen = new Set();
                categories = cats
                    .map((c) => ({
                        id: String((c && c.id) || '').trim() || 'altro',
                        label: String((c && c.label) || '').trim() || 'Altro',
                        files: (Array.isArray(c && c.files) ? c.files : [])
                            .map((f) => String(f || '').trim())
                            .filter((f) => onDisk.has(f) && !seen.has(f) && (seen.add(f) || true)),
                    }))
                    .filter((c) => c.files.length);
                const missing = [...onDisk].filter((f) => !seen.has(f)).sort((a, b) => a.localeCompare(b));
                if (missing.length) {
                    const altri = categories.find((c) => c.id === 'altro');
                    if (altri) altri.files.push(...missing);
                    else categories.push({ id: 'altro', label: 'Altro', files: missing });
                }
            } catch (err) {
                console.warn('[emoji order]', err.message || err);
            }
        }
        if (!categories.length) {
            categories = [{
                id: 'tutti',
                label: 'Emoji',
                files: [...onDisk].sort((a, b) => a.localeCompare(b)),
            }];
        }
        // Faccine sempre per prime
        const EMOJI_CAT_ORDER = ['facce', 'persone', 'gesti', 'cuori', 'animali', 'cibo', 'oggetti', 'simboli', 'altro', 'tutti'];
        categories.forEach((c) => {
            if (c.id === 'facce') c.label = 'Faccine';
        });
        categories.sort((a, b) => {
            const ia = EMOJI_CAT_ORDER.indexOf(a.id);
            const ib = EMOJI_CAT_ORDER.indexOf(b.id);
            const pa = ia < 0 ? 999 : ia;
            const pb = ib < 0 ? 999 : ib;
            if (pa !== pb) return pa - pb;
            return String(a.label || '').localeCompare(String(b.label || ''), 'it');
        });
        const files = categories.flatMap((c) => c.files);
        _emojiPackCache = { at: now, files, categories };
        return _emojiPackCache;
    } catch (err) {
        console.warn('[emoji pack]', err.message || err);
        return _emojiPackCache.files.length
            ? _emojiPackCache
            : { at: 0, files: [], categories: [] };
    }
}

function listEmojiPackFiles() {
    return listEmojiPack().files;
}

function isPackSticker(name) {
    const s = String(name || '').trim();
    if (!PACK_STICKER_RE.test(s) || s.length > 180) return false;
    try {
        const full = path.join(EMOJI_DIR, s);
        if (!full.startsWith(EMOJI_DIR + path.sep) && full !== EMOJI_DIR) return false;
        return fs.existsSync(full);
    } catch {
        return false;
    }
}

function isAllowedSticker(sticker) {
    const s = String(sticker || '').trim();
    return CHAT_STICKER_SET.has(s) || isPackSticker(s);
}

function stickerPreview(body) {
    const s = String(body || '').trim();
    if (PACK_STICKER_RE.test(s)) return 'Sticker';
    return s || 'Sticker';
}
const CHAT_PRESETS = {
    cyan:   { mine: '#00C8FF', mine2: '#00E676', theirs: '#123A4A' },
    green:  { mine: '#00E676', mine2: '#00C853', theirs: '#123A28' },
    purple: { mine: '#B388FF', mine2: '#7C4DFF', theirs: '#2A1848' },
    orange: { mine: '#FF7A00', mine2: '#FFCC00', theirs: '#4A2808' },
    red:    { mine: '#FF5252', mine2: '#FF1744', theirs: '#4A1218' },
    gold:   { mine: '#FFD54F', mine2: '#FFA000', theirs: '#3A2A08' },
    pink:   { mine: '#FF80AB', mine2: '#F50057', theirs: '#4A1230' },
    blue:   { mine: '#448AFF', mine2: '#2962FF', theirs: '#102848' },
};
const HEX6 = /^#([0-9A-Fa-f]{6})$/;

function isHexColor(s) { return HEX6.test(String(s || '')); }

function normalizeChatTheme(raw) {
    let obj = raw;
    if (typeof raw === 'string') {
        try { obj = raw ? JSON.parse(raw) : {}; } catch { obj = {}; }
    }
    obj = obj && typeof obj === 'object' ? obj : {};
    const presetName = CHAT_PRESETS[obj.preset] ? obj.preset : (isHexColor(obj.mine) ? 'custom' : 'cyan');
    if (presetName !== 'custom') return { preset: presetName, ...CHAT_PRESETS[presetName] };
    return {
        preset: 'custom',
        mine: isHexColor(obj.mine) ? String(obj.mine).toUpperCase() : '#00C8FF',
        mine2: isHexColor(obj.mine2) ? String(obj.mine2).toUpperCase() : (isHexColor(obj.mine) ? String(obj.mine).toUpperCase() : '#00E676'),
        theirs: isHexColor(obj.theirs) ? String(obj.theirs).toUpperCase() : '#123A4A',
    };
}

function lastMessagePreview(last) {
    if (!last) return '';
    const kind = last.kind || 'text';
    const cap = String(last.body || '').trim()
        .replace(/(?:\u27E6e:[A-Za-z0-9_\-]+\.png\u27E7|\[\[e:[A-Za-z0-9_\-]+\.png\]\])/gi, '🙂');
    if (kind === 'image') return cap ? `📷 ${cap}` : '📷 Foto';
    if (kind === 'video') return cap ? `🎬 ${cap}` : '🎬 Video';
    if (kind === 'file') return cap ? `📎 ${cap}` : '📎 Documento';
    if (kind === 'sticker') return stickerPreview(String(last.body || '').trim());
    return cap;
}

function resolveSenderLabel(m) {
    const stored = String((m && m.senderLabel) || '').trim();
    const sender = m && m.senderId ? Users.findById(m.senderId) : null;
    if (sender) return messagePeerLabel(sender);
    return stored || 'Utente';
}

function mapMessageItem(m, userId) {
    const kind = ['image', 'video', 'sticker', 'file'].includes(m.kind) ? m.kind : 'text';
    const deletedForAll = !!Number(m.deletedForAll);
    const hiddenBySender = !!Number(m.deletedForSender);
    const hiddenByRecipient = !!Number(m.deletedForRecipient);
    return {
        id: m.id,
        mine: m.senderId === userId,
        senderId: m.senderId,
        senderLabel: resolveSenderLabel(m),
        kind,
        body: m.body || '',
        createdAt: m.createdAt,
        read: !!m.readAt,
        deletedForAll,
        deletedForAllAt: m.deletedForAllAt || '',
        hiddenBySender,
        hiddenByRecipient,
        attachment: m.attachmentId ? {
            id: m.attachmentId,
            kind: m.attKind || kind,
            mime: m.attMime || '',
            name: m.attName || '',
            size: Number(m.attSize) || 0,
            width: Number(m.attWidth) || 0,
            height: Number(m.attHeight) || 0,
        } : null,
    };
}

function mapGroupPublic(g, userId) {
    const last = Messages.lastInGroup(userId, g.id);
    return {
        type: 'group',
        groupId: g.id,
        peerId: g.id,
        peerLabel: g.name,
        peerActive: true,
        peerAvatarVersion: g.avatarVersion || 0,
        isGroup: true,
        isAdmin: Groups.isAdmin(g.id, userId),
        lastBody: lastMessagePreview(last),
        lastKind: last ? (last.kind || 'text') : 'text',
        lastAt: last ? last.createdAt : g.lastAt,
        lastMine: !!(last && last.senderId === userId),
        unread: Messages.countUnreadGroup(userId, g.id),
    };
}

const MEDIA_MAX = { image: 1.5 * 1024 * 1024, video: 8 * 1024 * 1024, gif: 2 * 1024 * 1024 };
const MEDIA_SIG = {
    'image/jpeg': (b) => b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
    'image/png':  (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47,
    'image/webp': (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
    'image/gif':  (b) => { const s = b.toString('ascii', 0, 6); return s === 'GIF87a' || s === 'GIF89a'; },
    'video/mp4':  (b) => b.length > 12 && b.toString('ascii', 4, 8) === 'ftyp',
    'video/webm': (b) => b.length > 4 && b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3,
    'video/quicktime': (b) => b.length > 12 && b.toString('ascii', 4, 8) === 'ftyp',
};

function parseMediaAttachment(att, kind) {
    if (!att || typeof att !== 'object') return { error: 'Allegato mancante.' };
    const raw = String(att.data || '');
    const m = /^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(raw);
    if (!m) return { error: 'Formato file non valido.' };
    const mime = m[1].toLowerCase();
    const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
    if (!buf.length) return { error: 'File vuoto.' };
    const check = MEDIA_SIG[mime];
    if (!check) return { error: 'Formato non supportato. Immagini: JPG, PNG, WebP, GIF. Video: MP4 o WebM.' };
    if (!check(buf)) return { error: 'Il file non corrisponde al formato dichiarato.' };
    if (kind === 'image' && !mime.startsWith('image/')) return { error: 'Il file non è un\'immagine.' };
    if (kind === 'video' && !mime.startsWith('video/')) return { error: 'Il file non è un video.' };
    const max = mime === 'image/gif' ? MEDIA_MAX.gif : (kind === 'video' ? MEDIA_MAX.video : MEDIA_MAX.image);
    if (buf.length > max) {
        return { error: kind === 'video' ? 'Video troppo grande (massimo 8 MB).' : 'Immagine troppo grande (massimo 1,5 MB).' };
    }
    return {
        mime,
        buf,
        name: String(att.name || '').slice(0, 80),
        width: Math.max(0, Math.min(8000, Number(att.width) || 0)),
        height: Math.max(0, Math.min(8000, Number(att.height) || 0)),
    };
}

function requireMessaging(req, res) {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) { res.status(401).json({ error: 'Sessione non valida.' }); return null; }
    if (isStrumentoAccount(user)) { res.status(403).json({ error: 'Non disponibile per i profili strumento.' }); return null; }
    return user;
}

// ── Telegram · avvisi Criptogram (notifica cieca) ────────────────────────────
function telegramAccountLabel(user) {
    if (!user) return '';
    if (isLockedProfile(user.email)) return SUPERADMIN_USERNAME;
    const u = String(user.username || '').trim();
    if (u) return u;
    const person = personName(user);
    if (person) return person;
    return String(user.email || '').trim() || user.id || '';
}

/** Etichetta mittente per avviso Telegram: nomeutente (nome cognome). Super Admin: solo nome utente. */
function telegramFromLabel(user) {
    if (!user) return 'un utente';
    if (isLockedProfile(user.email)) return SUPERADMIN_USERNAME;
    const username = String(user.username || '').trim() || String(user.email || '').trim() || 'utente';
    const nome = String(user.nome || '').trim();
    const cognome = String(user.cognome || '').trim();
    const full = [nome, cognome].filter(Boolean).join(' ');
    return full ? (username + ' (' + full + ')') : username;
}

app.get('/api/auth/telegram/status', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    res.json(telegramCriptogram.statusForUser(user.id, telegramAccountLabel(user)));
});

app.post('/api/auth/telegram/link', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const out = telegramCriptogram.createLinkForUser(user.id);
    if (out.error) return res.status(503).json({ error: out.error });
    res.json({ ...out, portalAccount: telegramAccountLabel(user) });
});

app.delete('/api/auth/telegram/link', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    telegramCriptogram.unlink(user.id);
    res.json({ ok: true, ...telegramCriptogram.statusForUser(user.id, telegramAccountLabel(user)) });
});

app.get('/api/auth/messages/directory', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    res.json({
        users: messageableUsers(user.id)
            .map((u) => ({ id: u.id, label: messagePeerLabel(u), avatarVersion: u.avatarVersion || 0 }))
            .sort((a, b) => a.label.localeCompare(b.label, 'it')),
        stickers: CHAT_STICKERS,
        favoriteStickers: StickerFavorites.list(user.id),
        theme: normalizeChatTheme(user.chatTheme),
        isSuperadmin: user.role === 'superadmin',
    });
});

app.get('/api/auth/messages', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const directs = Messages.peersFor(user.id).map((row) => {
        const peer = Users.findById(row.peerId);
        const last = Messages.lastBetween(user.id, row.peerId);
        return {
            type: 'direct',
            peerId: row.peerId,
            peerLabel: peer ? messagePeerLabel(peer) : 'Utente non più disponibile',
            peerActive: !!(peer && isAccountUsable(peer) && !isStrumentoAccount(peer)),
            peerAvatarVersion: peer ? (peer.avatarVersion || 0) : 0,
            isGroup: false,
            lastBody: lastMessagePreview(last),
            lastKind: last ? (last.kind || 'text') : 'text',
            lastAt: last ? last.createdAt : row.lastAt,
            lastMine: !!(last && last.senderId === user.id),
            unread: Messages.countUnreadFrom(user.id, row.peerId),
        };
    });
    const groups = Groups.forUser(user.id).map((g) => mapGroupPublic(g, user.id));
    const conversations = directs.concat(groups).sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
    res.json({
        unread: Messages.countUnreadAll(user.id),
        conversations,
        theme: normalizeChatTheme(user.chatTheme),
        stickers: CHAT_STICKERS,
        favoriteStickers: StickerFavorites.list(user.id),
        isSuperadmin: user.role === 'superadmin',
    });
});

app.get('/api/auth/messages/emojis', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const pack = listEmojiPack();
    res.json({
        files: pack.files,
        categories: pack.categories,
        baseUrl: '/emoji/',
        count: pack.files.length,
    });
});

app.get('/api/auth/messages/favorites', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    res.json({ stickers: StickerFavorites.list(user.id) });
});

app.post('/api/auth/messages/favorites', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const sticker = String((req.body || {}).sticker || '').trim();
    if (!sticker || sticker.length > 180 || !isAllowedSticker(sticker)) {
        return res.status(400).json({ error: 'Sticker non valido.' });
    }
    StickerFavorites.add(user.id, sticker);
    res.json({ ok: true, stickers: StickerFavorites.list(user.id) });
});

app.delete('/api/auth/messages/favorites', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const sticker = String((req.body || {}).sticker || (req.query || {}).sticker || '').trim();
    if (!sticker) return res.status(400).json({ error: 'Sticker mancante.' });
    StickerFavorites.remove(user.id, sticker);
    res.json({ ok: true, stickers: StickerFavorites.list(user.id) });
});

app.put('/api/auth/messages/theme', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const theme = normalizeChatTheme((req.body || {}).theme || req.body || {});
    Users.setChatTheme(user.id, JSON.stringify(theme));
    res.json({ ok: true, theme });
});

/** Ticket monouso per download documenti grandi via <a href> (senza Authorization header). */
const attachmentDownloadTickets = new Map();
function purgeAttachmentTickets() {
    const now = Date.now();
    for (const [k, row] of attachmentDownloadTickets) {
        if (!row || row.exp <= now) attachmentDownloadTickets.delete(k);
    }
}
setInterval(purgeAttachmentTickets, 60 * 1000).unref?.();

function authenticateAttachment(req, res, next) {
    const ticket = String((req.query || {}).ticket || '').trim();
    if (ticket) {
        purgeAttachmentTickets();
        const row = attachmentDownloadTickets.get(ticket);
        const id = String(req.params.id || '').trim();
        // Ticket riusabile fino a scadenza (anteprima + download nella stessa sessione)
        if (!row || row.exp <= Date.now() || row.attId !== id) {
            return res.status(401).json({ error: 'Link di download non valido o scaduto.' });
        }
        req.user = { id: row.userId, role: row.role || 'user' };
        return next();
    }
    return authenticate(req, res, next);
}

app.post('/api/auth/messages/attachment/:id/download-ticket', authenticate, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
    const id = String(req.params.id || '').trim();
    const asAdmin = user.role === 'superadmin';
    if (!asAdmin && !Attachments.canAccess(id, user.id)) {
        return res.status(404).json({ error: 'Allegato non trovato.' });
    }
    const att = Attachments.meta(id);
    if (!att) return res.status(404).json({ error: 'Allegato non trovato.' });
    const ticket = crypto.randomBytes(24).toString('hex');
    attachmentDownloadTickets.set(ticket, {
        userId: user.id,
        role: user.role,
        attId: id,
        exp: Date.now() + 5 * 60 * 1000,
    });
    const base = '/api/auth/messages/attachment/' + encodeURIComponent(id) + '?ticket=' + encodeURIComponent(ticket);
    res.json({
        ok: true,
        ticket,
        url: base + '&download=1',
        viewUrl: base,
        name: att.name || 'documento',
        mime: att.mime || 'application/octet-stream',
        size: Number(att.size) || 0,
    });
});

app.get('/api/auth/messages/attachment/:id', authenticateAttachment, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).end();
    const id = String(req.params.id || '').trim();
    const asAdmin = user.role === 'superadmin';
    if (!asAdmin && !Attachments.canAccess(id, user.id)) return res.status(404).end();
    const att = Attachments.get(id);
    if (!att) return res.status(404).end();
    // download=1 → forzato download; altrimenti inline (anteprima PDF/immagini/video)
    const download = String((req.query || {}).download || '') === '1';
    const base = String(att.name || (att.kind === 'video' ? 'video' : (att.kind === 'file' ? 'documento' : 'foto')))
        .replace(/[^\w.\-àèéìòùÀÈÉÌÒÙ]+/gi, '_').slice(0, 120) || 'file';
    const extFromMime = (att.mime || '').includes('png') ? '.png'
        : (att.mime || '').includes('webp') ? '.webp'
        : (att.mime || '').includes('gif') ? '.gif'
        : (att.mime || '').includes('pdf') ? '.pdf'
        : (att.mime || '').includes('webm') ? '.webm'
        : (att.mime || '').includes('mp4') || (att.mime || '').includes('quicktime') ? '.mp4'
        : (att.mime || '').includes('jpeg') || (att.mime || '').includes('jpg') ? '.jpg'
        : '';
    const filename = base.includes('.') ? base : (base + extFromMime);
    const mime = att.mime || 'application/octet-stream';
    res.set('Content-Type', mime);
    res.set('Cache-Control', 'private, max-age=3600');
    res.set('Content-Disposition', (download ? 'attachment' : 'inline') + '; filename="' + filename.replace(/"/g, '') + '"');
    if (att.storagePath) {
        const full = path.join(ATTACHMENTS_DIR, path.basename(String(att.storagePath)));
        if (!fs.existsSync(full)) return res.status(404).end();
        if (att.size) res.set('Content-Length', String(att.size));
        res.set('Accept-Ranges', 'bytes');
        return fs.createReadStream(full).pipe(res);
    }
    if (!att.data || !att.data.length) return res.status(404).end();
    res.send(att.data);
});

/** Upload documento/file (streaming su disco, senza limite di dimensione lato app). */
app.post('/api/auth/messages/upload', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const rawName = decodeURIComponent(String(req.headers['x-file-name'] || 'documento').slice(0, 400));
    const name = path.basename(rawName).replace(/[\\/]/g, '').slice(0, 180) || 'documento';
    const mime = String(req.headers['x-file-mime'] || req.headers['content-type'] || 'application/octet-stream')
        .split(';')[0].trim().slice(0, 120) || 'application/octet-stream';
    if (!mime || mime === 'application/json') {
        return res.status(400).json({ error: 'Content-Type file non valido. Usa application/octet-stream.' });
    }
    const id = uuidv4();
    const dest = path.join(ATTACHMENTS_DIR, id);
    const ws = fs.createWriteStream(dest);
    let size = 0;
    let failed = false;

    const fail = (status, error) => {
        if (failed) return;
        failed = true;
        try { req.unpipe(ws); } catch { /* ignore */ }
        try { ws.destroy(); } catch { /* ignore */ }
        try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch { /* ignore */ }
        if (!res.headersSent) res.status(status).json({ error });
    };

    ws.on('error', () => fail(500, 'Scrittura file non riuscita.'));
    req.on('aborted', () => fail(499, 'Upload interrotto.'));
    req.on('error', () => fail(500, 'Upload non riuscito.'));
    req.on('data', (chunk) => { size += chunk.length; });
    req.pipe(ws);
    ws.on('finish', () => {
        if (failed) return;
        if (!size) {
            try { fs.unlinkSync(dest); } catch { /* ignore */ }
            return res.status(400).json({ error: 'File vuoto.' });
        }
        try {
            Attachments.insert({
                id,
                kind: 'file',
                mime,
                name,
                size,
                width: 0,
                height: 0,
                data: Buffer.alloc(0),
                storagePath: id,
                ownerId: user.id,
                createdAt: new Date().toISOString(),
            });
        } catch (err) {
            try { fs.unlinkSync(dest); } catch { /* ignore */ }
            return res.status(500).json({ error: 'Salvataggio allegato non riuscito.' });
        }
        setImmediate(() => { try { checkCriptogramStorage(false); } catch { /* ignore */ } });
        res.json({
            ok: true,
            attachmentId: id,
            kind: 'file',
            name,
            mime,
            size,
        });
    });
});

const CRIPTOGRAM_STORAGE_LIMIT = 10 * 1024 * 1024 * 1024; // 10 GB
let _storageCheckBusy = false;

function criptogramStorageBytes() {
    return Attachments.totalBytes();
}

function formatBytesIT(n) {
    const b = Number(n) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1).replace('.', ',') + ' KB';
    if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
    return (b / (1024 * 1024 * 1024)).toFixed(2).replace('.', ',') + ' GB';
}

/** Se gli allegati superano 10 GB, notifica i Super Admin (al massimo una volta finché non scende sotto soglia). */
function checkCriptogramStorage(forceNotify) {
    if (_storageCheckBusy) return;
    _storageCheckBusy = true;
    try {
        const bytes = criptogramStorageBytes();
        const over = bytes >= CRIPTOGRAM_STORAGE_LIMIT;
        const flagged = AppMeta.get('criptogram_storage_alert') === '1';
        if (over && (!flagged || forceNotify)) {
            AppMeta.set('criptogram_storage_alert', '1');
            AppMeta.set('criptogram_storage_alert_at', new Date().toISOString());
            AppMeta.set('criptogram_storage_alert_bytes', String(bytes));
            notifySuperadmins(
                'criptogram_storage',
                'Criptogram: spazio in esaurimento',
                `Gli allegati di Criptogram occupano ${formatBytesIT(bytes)} (limite 10 GB). Apri Criptogram → Archivio per eliminare foto, video o documenti non necessari.`,
                '/portal#criptogram-archivio'
            );
            console.warn(`[CRIPTOGRAM] Spazio allegati ${formatBytesIT(bytes)} ≥ 10 GB — notifica Super Admin inviata.`);
        } else if (!over && flagged) {
            AppMeta.set('criptogram_storage_alert', '0');
        }
        return { bytes, limit: CRIPTOGRAM_STORAGE_LIMIT, over, alerted: AppMeta.get('criptogram_storage_alert') === '1' };
    } finally {
        _storageCheckBusy = false;
    }
}

app.post('/api/auth/messages/groups', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Il nome del gruppo deve avere da 2 a 60 caratteri.' });
    const memberIds = [...new Set((Array.isArray(body.memberIds) ? body.memberIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!memberIds.length) return res.status(400).json({ error: 'Aggiungi almeno un altro partecipante.' });
    if (memberIds.length > 49) return res.status(400).json({ error: 'Il gruppo può avere al massimo 50 persone.' });
    const allowed = new Map(messageableUsers(user.id).map((u) => [u.id, u]));
    if (memberIds.some((id) => !allowed.has(id))) return res.status(400).json({ error: 'Uno o più partecipanti non sono validi.' });
    const id = uuidv4();
    Groups.create({ id, name, createdBy: user.id, createdAt: new Date().toISOString(), memberIds });
    if (body.image) {
        const parsed = parseAvatarDataUrl(body.image);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        Groups.setAvatar(id, parsed.buf, parsed.mime);
    }
    const g = Groups.findById(id);
    telegramCriptogram.notifyBlind(memberIds, {
        excludeUserIds: [user.id],
        fromLabel: telegramFromLabel(user),
        groupName: name,
        event: 'added-to-group',
    });
    res.json({ ok: true, group: mapGroupPublic(g, user.id) });
});

app.get('/api/auth/messages/groups/:id', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const id = String(req.params.id || '').trim();
    const g = Groups.findById(id);
    if (!g || !Groups.isMember(id, user.id)) return res.status(404).json({ error: 'Gruppo non trovato.' });
    res.json({
        id: g.id,
        name: g.name,
        createdBy: g.createdBy,
        createdAt: g.createdAt,
        avatarVersion: g.avatarVersion || 0,
        isAdmin: Groups.isAdmin(id, user.id),
        members: Groups.members(id).map((m) => {
            const u = Users.findById(m.userId);
            return {
                id: m.userId,
                me: m.userId === user.id,
                label: u ? messagePeerLabel(u) : 'Utente non più disponibile',
                role: m.role,
                avatarVersion: u ? (u.avatarVersion || 0) : 0,
                active: !!(u && isAccountUsable(u)),
            };
        }),
    });
});

app.patch('/api/auth/messages/groups/:id', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const id = String(req.params.id || '').trim();
    if (!Groups.isAdmin(id, user.id)) return res.status(403).json({ error: 'Solo gli amministratori possono modificare il gruppo.' });
    const name = String((req.body || {}).name || '').trim();
    if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Il nome del gruppo deve avere da 2 a 60 caratteri.' });
    Groups.setName(id, name);
    res.json({ ok: true, name });
});

app.put('/api/auth/messages/groups/:id/avatar', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const id = String(req.params.id || '').trim();
    if (!Groups.isAdmin(id, user.id)) return res.status(403).json({ error: 'Solo gli amministratori possono cambiare l\'immagine del gruppo.' });
    const parsed = parseAvatarDataUrl((req.body || {}).image);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    Groups.setAvatar(id, parsed.buf, parsed.mime);
    const g = Groups.findById(id);
    res.json({ ok: true, avatarVersion: g.avatarVersion || 0 });
});

app.get('/api/auth/messages/groups/:id/avatar', authenticate, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).end();
    const id = String(req.params.id || '').trim();
    if (!Groups.isMember(id, user.id)) return res.status(404).end();
    sendAvatar(res, Groups.getAvatar(id));
});

app.post('/api/auth/messages/groups/:id/admins', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const id = String(req.params.id || '').trim();
    if (!Groups.isAdmin(id, user.id)) return res.status(403).json({ error: 'Solo gli amministratori possono cambiare i ruoli.' });
    const targetId = String((req.body || {}).userId || '').trim();
    const makeAdmin = !!(req.body || {}).admin;
    if (!Groups.isMember(id, targetId)) return res.status(404).json({ error: 'Partecipante non trovato.' });
    if (!makeAdmin && Groups.isAdmin(id, targetId) && Groups.adminCount(id) <= 1) {
        return res.status(400).json({ error: 'Deve restare almeno un amministratore nel gruppo.' });
    }
    Groups.setRole(id, targetId, makeAdmin ? 'admin' : 'member');
    res.json({ ok: true, userId: targetId, role: makeAdmin ? 'admin' : 'member' });
});

app.post('/api/auth/messages/groups/:id/members', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const id = String(req.params.id || '').trim();
    if (!Groups.isAdmin(id, user.id)) return res.status(403).json({ error: 'Solo gli amministratori possono aggiungere partecipanti.' });
    const g = Groups.findById(id);
    if (!g) return res.status(404).json({ error: 'Gruppo non trovato.' });
    const memberIds = [...new Set((Array.isArray((req.body || {}).memberIds) ? req.body.memberIds : []).map((x) => String(x || '').trim()).filter(Boolean))];
    if (!memberIds.length) return res.status(400).json({ error: 'Nessun partecipante da aggiungere.' });
    if (Groups.memberCount(id) + memberIds.length > 50) {
        return res.status(400).json({ error: 'Il gruppo può avere al massimo 50 persone.' });
    }
    const allowed = new Map(messageableUsers(user.id).map((u) => [u.id, u]));
    const added = [];
    memberIds.forEach((uid) => {
        if (!allowed.has(uid) || Groups.isMember(id, uid)) return;
        if (Groups.addMember(id, uid, 'member')) added.push(uid);
    });
    if (!added.length) return res.status(400).json({ error: 'Nessun nuovo partecipante valido.' });
    telegramCriptogram.notifyBlind(added, {
        excludeUserIds: [user.id],
        fromLabel: telegramFromLabel(user),
        groupName: String(g.name || '').replace(/\s+/g, ' ').trim() || 'gruppo',
        event: 'added-to-group',
    });
    res.json({ ok: true, added });
});

app.delete('/api/auth/messages/groups/:id/members/:userId', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const id = String(req.params.id || '').trim();
    const targetId = String(req.params.userId || '').trim();
    const g = Groups.findById(id);
    if (!g || !Groups.isMember(id, user.id)) return res.status(404).json({ error: 'Gruppo non trovato.' });
    const removingSelf = targetId === user.id;
    if (removingSelf) {
        const left = Groups.leave(id, user.id);
        if (!left.ok) return res.status(400).json({ error: left.error || 'Uscita non riuscita.' });
        return res.json({ ok: true, userId: targetId, left: true, dissolved: !!left.dissolved });
    }
    if (!Groups.isAdmin(id, user.id)) {
        return res.status(403).json({ error: 'Solo gli amministratori possono rimuovere partecipanti.' });
    }
    if (!Groups.isMember(id, targetId)) return res.status(404).json({ error: 'Partecipante non trovato.' });
    if (Groups.isAdmin(id, targetId) && Groups.adminCount(id) <= 1) {
        return res.status(400).json({ error: 'Deve restare almeno un amministratore nel gruppo.' });
    }
    if (!Groups.removeMember(id, targetId)) {
        return res.status(400).json({ error: 'Rimozione non riuscita.' });
    }
    res.json({ ok: true, userId: targetId, left: false });
});

app.post('/api/auth/messages/groups/:id/leave', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const id = String(req.params.id || '').trim();
    const g = Groups.findById(id);
    if (!g || !Groups.isMember(id, user.id)) return res.status(404).json({ error: 'Gruppo non trovato.' });
    const left = Groups.leave(id, user.id);
    if (!left.ok) return res.status(400).json({ error: left.error || 'Uscita non riuscita.' });
    res.json({ ok: true, left: true, dissolved: !!left.dissolved });
});

app.get('/api/auth/messages/group/:groupId', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const groupId = String(req.params.groupId || '').trim();
    const g = Groups.findById(groupId);
    if (!g || !Groups.isMember(groupId, user.id)) return res.status(404).json({ error: 'Gruppo non trovato.' });
    const firstUnreadId = Messages.firstUnreadGroup(user.id, groupId);
    Messages.markReadGroup(user.id, groupId);
    res.json({
        peer: {
            id: groupId,
            label: g.name,
            active: true,
            isGroup: true,
            isAdmin: Groups.isAdmin(groupId, user.id),
            avatarVersion: g.avatarVersion || 0,
        },
        unread: Messages.countUnreadAll(user.id),
        firstUnreadId: firstUnreadId || null,
        theme: normalizeChatTheme(user.chatTheme),
        items: Messages.conversationGroup(user.id, groupId).map((m) => mapMessageItem(m, user.id)),
    });
});

app.post('/api/auth/messages/bulk-delete', authenticate, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
    const ids = [...new Set((Array.isArray((req.body || {}).ids) ? req.body.ids : []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!ids.length) return res.status(400).json({ error: 'Nessun messaggio selezionato.' });
    if (ids.length > 100) return res.status(400).json({ error: 'Puoi eliminare al massimo 100 messaggi per volta.' });
    const scopeAll = String((req.body || {}).scope || 'me') === 'all';
    ids.forEach((id) => {
        const msg = Messages.findById(id);
        if (!msg || !Messages.isParty(msg, user.id)) return;
        if (scopeAll && msg.senderId === user.id) Messages.deleteForAll(id, user.id);
        else Messages.deleteForUser(id, user.id);
    });
    res.json({ ok: true, unread: Messages.countUnreadAll(user.id) });
});

app.get('/api/auth/messages/with/:peerId', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const peerId = String(req.params.peerId || '').trim();
    const peer = Users.findById(peerId);
    if (!peer || peerId === user.id) return res.status(404).json({ error: 'Utente non trovato.' });
    const firstUnreadId = Messages.firstUnreadFrom(user.id, peerId);
    Messages.markReadFrom(user.id, peerId);
    res.json({
        peer: {
            id: peerId,
            label: messagePeerLabel(peer),
            active: isAccountUsable(peer) && !isStrumentoAccount(peer),
            avatarVersion: peer.avatarVersion || 0,
        },
        unread: Messages.countUnreadAll(user.id),
        firstUnreadId: firstUnreadId || null,
        theme: normalizeChatTheme(user.chatTheme),
        items: Messages.conversation(user.id, peerId).map((m) => mapMessageItem(m, user.id)),
    });
});

/** Cancella la chat 1:1 solo per chi chiede (non per l'altro utente). */
app.delete('/api/auth/messages/with/:peerId', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const peerId = String(req.params.peerId || '').trim();
    if (!peerId || peerId === user.id) return res.status(400).json({ error: 'Chat non valida.' });
    Messages.clearDirect(user.id, peerId);
    res.json({ ok: true, unread: Messages.countUnreadAll(user.id) });
});

app.post('/api/auth/messages/read-all', authenticate, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
    Messages.markAllRead(user.id);
    res.json({ ok: true, unread: 0 });
});

/** Elimina un messaggio: scope=me (solo per chi chiede) oppure scope=all (solo il mittente). */
app.delete('/api/auth/messages/:id', authenticate, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
    const id = String(req.params.id || '').trim();
    const msg = Messages.findById(id);
    if (!msg || !Messages.isParty(msg, user.id)) {
        return res.status(404).json({ error: 'Messaggio non trovato.' });
    }
    const scope = String((req.query || {}).scope || 'me') === 'all' ? 'all' : 'me';
    if (scope === 'all') {
        if (msg.senderId !== user.id) return res.status(403).json({ error: 'Puoi eliminare per tutti solo i messaggi che hai inviato.' });
        Messages.deleteForAll(id, user.id);
    } else {
        Messages.deleteForUser(id, user.id);
    }
    res.json({ ok: true, scope, unread: Messages.countUnreadAll(user.id) });
});

app.post('/api/auth/messages', authenticate, (req, res) => {
    const user = requireMessaging(req, res);
    if (!user) return;
    const body = req.body || {};
    const kindRaw = String(body.kind || 'text');
    const kind = ['text', 'image', 'video', 'sticker', 'file'].includes(kindRaw) ? kindRaw : 'text';
    const text = String(body.text || '').trim();
    const sticker = String(body.sticker || body.text || '').trim();
    if (text.length > 2000) return res.status(400).json({ error: 'Il messaggio può avere al massimo 2000 caratteri.' });
    const groupId = String(body.groupId || '').trim();
    let ids = [];
    if (groupId) {
        if (!Groups.isMember(groupId, user.id)) return res.status(404).json({ error: 'Gruppo non trovato.' });
    } else {
        ids = [...new Set((Array.isArray(body.recipientIds) ? body.recipientIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
        if (!ids.length) return res.status(400).json({ error: 'Scegli almeno un destinatario.' });
        if (ids.length > 30) return res.status(400).json({ error: 'Puoi scrivere al massimo a 30 persone per volta.' });
        const allowed = new Map(messageableUsers(user.id).map((u) => [u.id, u]));
        if (ids.some((id) => !allowed.has(id))) return res.status(400).json({ error: 'Uno o più destinatari non sono validi.' });
    }

    let msgBody = text;
    let attachmentId = null;
    if (kind === 'sticker') {
        if (!isAllowedSticker(sticker)) return res.status(400).json({ error: 'Sticker non valido.' });
        msgBody = sticker;
    } else if (kind === 'file') {
        const aid = String(body.attachmentId || '').trim();
        const att = aid ? Attachments.meta(aid) : null;
        if (!att || att.kind !== 'file') return res.status(400).json({ error: 'Documento non trovato. Caricalo di nuovo.' });
        if (att.ownerId && att.ownerId !== user.id) {
            return res.status(403).json({ error: 'Non puoi usare questo allegato.' });
        }
        // Se già collegato a un altro messaggio, lascia comunque (stesso file multi-destinatario)
        attachmentId = att.id;
        if (!msgBody) msgBody = att.name || 'Documento';
    } else if (kind === 'image' || kind === 'video') {
        const parsed = parseMediaAttachment(body.attachment, kind);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        attachmentId = uuidv4();
        Attachments.insert({
            id: attachmentId,
            kind,
            mime: parsed.mime,
            name: parsed.name,
            size: parsed.buf.length,
            width: parsed.width,
            height: parsed.height,
            data: parsed.buf,
            createdAt: new Date().toISOString(),
        });
        setImmediate(() => { try { checkCriptogramStorage(false); } catch { /* ignore */ } });
    } else if (!msgBody) {
        return res.status(400).json({ error: 'Scrivi un messaggio.' });
    }

    const now = new Date().toISOString();
    const senderLabel = messagePeerLabel(user);
    if (groupId) {
        Messages.insertMany([{
            id: uuidv4(),
            senderId: user.id,
            senderLabel,
            recipientId: '',
            body: msgBody,
            createdAt: now,
            kind,
            attachmentId,
            groupId,
        }]);
        const memberIds = Groups.members(groupId)
            .map((m) => m.userId)
            .filter((id) => id && id !== user.id && Groups.isMember(groupId, id));
        const group = Groups.findById(groupId);
        const groupName = String((group && group.name) || '').replace(/\s+/g, ' ').trim() || 'gruppo';
        telegramCriptogram.notifyBlind(memberIds, {
            excludeUserIds: [user.id],
            fromLabel: telegramFromLabel(user),
            groupName,
        });
        return res.json({ ok: true, sent: 1 });
    }
    Messages.insertMany(ids.map((recipientId) => ({
        id: uuidv4(),
        senderId: user.id,
        senderLabel,
        recipientId,
        body: msgBody,
        createdAt: now,
        kind,
        attachmentId,
    })));
    // Strict 1:1 — avvisa SOLO ciascun recipientId della richiesta, nessuno altro
    const dmRecipients = ids.filter((id) => id && id !== user.id);
    telegramCriptogram.notifyBlind(dmRecipients, {
        excludeUserIds: [user.id],
        fromLabel: telegramFromLabel(user),
    });
    res.json({ ok: true, sent: ids.length });
});

// ── Super Admin: archivio completo Criptogram + spazio ───────────────────────
app.get('/api/auth/messages/admin/storage', authenticate, requireSuperadmin, (req, res) => {
    const stats = checkCriptogramStorage(false) || {
        bytes: criptogramStorageBytes(),
        limit: CRIPTOGRAM_STORAGE_LIMIT,
        over: false,
        alerted: false,
    };
    res.json({
        bytes: stats.bytes,
        limit: stats.limit,
        over: !!stats.over,
        alerted: !!stats.alerted,
        label: formatBytesIT(stats.bytes),
        limitLabel: '10 GB',
        percent: Math.min(100, Math.round((stats.bytes / CRIPTOGRAM_STORAGE_LIMIT) * 1000) / 10),
        messages: Messages.countAll(),
        attachments: Attachments.count(),
        files: Attachments.listMeta(300),
    });
});

/** File manager Super Admin: spazio per chat, ordinabile lato client. */
app.get('/api/auth/messages/admin/storage/chats', authenticate, requireSuperadmin, (req, res) => {
    const stats = checkCriptogramStorage(false) || {
        bytes: criptogramStorageBytes(),
        limit: CRIPTOGRAM_STORAGE_LIMIT,
        over: false,
        alerted: false,
    };
    const chats = Messages.adminStorageByChat().map((c) => {
        let peerLabel = '';
        if (c.type === 'group') {
            const g = Groups.findById(c.groupId);
            peerLabel = g ? (g.name + ' (gruppo)') : 'Gruppo';
        } else {
            const a = Users.findById(c.peerA);
            const b = Users.findById(c.peerB);
            peerLabel = (a ? messagePeerLabel(a) : 'Utente') + ' ↔ ' + (b ? messagePeerLabel(b) : 'Utente');
        }
        return {
            ...c,
            peerLabel,
            label: formatBytesIT(c.bytes),
        };
    });
    res.json({
        storage: {
            bytes: stats.bytes,
            limit: stats.limit,
            over: !!stats.over,
            alerted: !!stats.alerted,
            label: formatBytesIT(stats.bytes),
            limitLabel: '10 GB',
            percent: Math.min(100, Math.round((stats.bytes / CRIPTOGRAM_STORAGE_LIMIT) * 1000) / 10),
            messages: Messages.countAll(),
            attachments: Attachments.count(),
        },
        chats,
    });
});

app.get('/api/auth/messages/admin/overview', authenticate, requireSuperadmin, (req, res) => {
    const directs = Messages.adminPeers().map((row) => {
        const a = Users.findById(row.peerA);
        const b = Users.findById(row.peerB);
        const last = Messages.adminLastBetween(row.peerA, row.peerB);
        return {
            type: 'direct',
            peerA: row.peerA,
            peerB: row.peerB,
            peerId: row.peerA + ':' + row.peerB,
            peerLabel: (a ? messagePeerLabel(a) : 'Utente') + ' ↔ ' + (b ? messagePeerLabel(b) : 'Utente'),
            labels: {
                a: a ? messagePeerLabel(a) : 'Utente',
                b: b ? messagePeerLabel(b) : 'Utente',
            },
            isGroup: false,
            lastBody: lastMessagePreview(last),
            lastAt: last ? last.createdAt : row.lastAt,
        };
    });
    const groups = Groups.listAll().map((g) => {
        const last = Messages.adminLastInGroup(g.id);
        return {
            type: 'group',
            groupId: g.id,
            peerId: g.id,
            peerLabel: g.name + ' (' + g.memberCount + ')',
            isGroup: true,
            memberCount: g.memberCount,
            lastBody: lastMessagePreview(last),
            lastAt: last ? last.createdAt : g.lastAt,
        };
    });
    const conversations = directs.concat(groups).sort((x, y) => String(y.lastAt || '').localeCompare(String(x.lastAt || '')));
    const storage = checkCriptogramStorage(false) || {
        bytes: criptogramStorageBytes(),
        limit: CRIPTOGRAM_STORAGE_LIMIT,
        over: false,
        alerted: false,
    };
    res.json({
        conversations,
        storage: {
            bytes: storage.bytes,
            limit: storage.limit,
            over: !!storage.over,
            alerted: !!storage.alerted,
            label: formatBytesIT(storage.bytes),
            percent: Math.min(100, Math.round((storage.bytes / CRIPTOGRAM_STORAGE_LIMIT) * 1000) / 10),
            messages: Messages.countAll(),
            attachments: Attachments.count(),
        },
    });
});

app.get('/api/auth/messages/admin/with/:peerA/:peerB', authenticate, requireSuperadmin, (req, res) => {
    const a = String(req.params.peerA || '').trim();
    const b = String(req.params.peerB || '').trim();
    if (!a || !b || a === b) return res.status(400).json({ error: 'Conversazione non valida.' });
    const ua = Users.findById(a);
    const ub = Users.findById(b);
    res.json({
        peer: {
            peerA: a,
            peerB: b,
            label: (ua ? messagePeerLabel(ua) : 'Utente') + ' ↔ ' + (ub ? messagePeerLabel(ub) : 'Utente'),
            isGroup: false,
        },
        items: Messages.adminConversation(a, b).map((m) => mapMessageItem(m, req.user.id)),
    });
});

app.get('/api/auth/messages/admin/group/:groupId', authenticate, requireSuperadmin, (req, res) => {
    const groupId = String(req.params.groupId || '').trim();
    const g = Groups.findById(groupId);
    if (!g) return res.status(404).json({ error: 'Gruppo non trovato.' });
    res.json({
        peer: { id: groupId, label: g.name, isGroup: true },
        items: Messages.adminConversationGroup(groupId).map((m) => mapMessageItem(m, req.user.id)),
    });
});

app.delete('/api/auth/messages/admin/direct/:peerA/:peerB', authenticate, requireSuperadmin, (req, res) => {
    const a = String(req.params.peerA || '').trim();
    const b = String(req.params.peerB || '').trim();
    if (!a || !b || a === b) return res.status(400).json({ error: 'Conversazione non valida.' });
    const deleted = Messages.adminDeleteDirect(a, b);
    const storage = checkCriptogramStorage(false);
    res.json({
        ok: true,
        deleted,
        storage: {
            bytes: storage.bytes,
            label: formatBytesIT(storage.bytes),
            percent: Math.min(100, Math.round((storage.bytes / CRIPTOGRAM_STORAGE_LIMIT) * 1000) / 10),
            over: !!storage.over,
            messages: Messages.countAll(),
            attachments: Attachments.count(),
        },
    });
});

app.delete('/api/auth/messages/admin/group/:groupId', authenticate, requireSuperadmin, (req, res) => {
    const groupId = String(req.params.groupId || '').trim();
    if (!groupId) return res.status(400).json({ error: 'Gruppo non valido.' });
    const g = Groups.findById(groupId);
    if (!g) return res.status(404).json({ error: 'Gruppo non trovato.' });
    const out = Groups.deleteHard(groupId);
    const storage = checkCriptogramStorage(false);
    res.json({
        ok: true,
        deleted: out.messages || 0,
        storage: {
            bytes: storage.bytes,
            label: formatBytesIT(storage.bytes),
            percent: Math.min(100, Math.round((storage.bytes / CRIPTOGRAM_STORAGE_LIMIT) * 1000) / 10),
            over: !!storage.over,
            messages: Messages.countAll(),
            attachments: Attachments.count(),
        },
    });
});

app.delete('/api/auth/messages/admin/message/:id', authenticate, requireSuperadmin, (req, res) => {
    const id = String(req.params.id || '').trim();
    const msg = Messages.findById(id);
    if (!msg) return res.status(404).json({ error: 'Messaggio non trovato.' });
    Messages.deleteHard(id);
    const storage = checkCriptogramStorage(false);
    res.json({
        ok: true,
        storage: {
            bytes: storage.bytes,
            label: formatBytesIT(storage.bytes),
            percent: Math.min(100, Math.round((storage.bytes / CRIPTOGRAM_STORAGE_LIMIT) * 1000) / 10),
            over: !!storage.over,
        },
    });
});

app.delete('/api/auth/messages/admin/attachment/:id', authenticate, requireSuperadmin, (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!Attachments.meta(id)) return res.status(404).json({ error: 'Allegato non trovato.' });
    Attachments.deleteHard(id);
    const storage = checkCriptogramStorage(false);
    res.json({
        ok: true,
        storage: {
            bytes: storage.bytes,
            label: formatBytesIT(storage.bytes),
            percent: Math.min(100, Math.round((storage.bytes / CRIPTOGRAM_STORAGE_LIMIT) * 1000) / 10),
            over: !!storage.over,
            files: Attachments.listMeta(300),
            attachments: Attachments.count(),
        },
    });
});

function ideaAuthorLabel(user) {
    if (user && isLockedProfile(user.email)) return SUPERADMIN_USERNAME;
    const username = String(user.username || '').trim();
    if (username) return username;
    return subjectLabel(user);
}

function resolveIdeaTopic(raw) {
    const mode = raw && raw.topicMode === 'free' ? 'free' : 'tool';
    if (mode === 'free') {
        const label = String((raw && raw.topicText) || '').trim();
        if (label.length < 2) return { error: 'Scrivi l\'argomento (almeno 2 caratteri).' };
        if (label.length > 120) return { error: 'L\'argomento può avere al massimo 120 caratteri.' };
        return { topicKind: 'free', topicKey: '', topicLabel: label };
    }
    const key = String((raw && raw.topicKey) || '').trim();
    const found = IDEA_TOPICS.find((t) => t.key === key);
    if (!found) return { error: 'Scegli uno strumento oppure scrivi un argomento libero.' };
    return { topicKind: 'tool', topicKey: found.key, topicLabel: found.label };
}

function mapIdeaRow(r, viewer, opts) {
    const isAdmin = viewer.role === 'admin' || viewer.role === 'superadmin';
    const readIds = opts && opts.readIds;
    const deleted = !!(r.deletedAt && String(r.deletedAt).trim());
    const out = {
        id: r.id,
        authorLabel: r.authorLabel,
        authorEmail: isAdmin ? r.authorEmail : '',
        body: r.body,
        topicKind: r.topicKind || '',
        topicLabel: r.topicLabel || '',
        createdAt: r.createdAt,
        mine: r.userId === viewer.id,
        read: readIds ? readIds.has(r.id) : true,
        deleted,
    };
    if (deleted && viewer.role === 'superadmin') {
        out.deletedAt = r.deletedAt || '';
        out.deletedByLabel = r.deletedByLabel || '';
    }
    return out;
}

function requireIdeeAdmin(req, res) {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) {
        res.status(401).json({ error: 'Sessione non valida.' });
        return null;
    }
    if (user.role !== 'admin' && user.role !== 'superadmin') {
        res.status(403).json({ error: 'Solo admin e super admin possono gestire le proposte ricevute.' });
        return null;
    }
    return user;
}

app.get('/api/auth/idee', authenticate, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
    if (isStrumentoAccount(user)) return res.status(403).json({ error: 'Non disponibile per i profili strumento.' });
    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
    const isSuperadmin = user.role === 'superadmin';
    res.json({
        isAdmin,
        isSuperadmin,
        topics: IDEA_TOPICS,
        unread: isAdmin ? Idee.countUnreadForAdmin(user.id) : 0,
        items: Idee.findByUser(user.id).map((r) => mapIdeaRow(r, user)),
    });
});

/** Proposte ricevute (attive): lette/non lette per admin. */
app.get('/api/auth/idee/archivio', authenticate, (req, res) => {
    const user = requireIdeeAdmin(req, res);
    if (!user) return;
    const readIds = Idee.readIdsForUser(user.id);
    res.json({
        unread: Idee.countUnreadForAdmin(user.id),
        items: Idee.findActive().map((r) => mapIdeaRow(r, user, { readIds })),
    });
});

/** Archivio Super Admin: proposte eliminate (soft-delete). */
app.get('/api/auth/idee/cestino', authenticate, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
    if (user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Solo i Super Admin possono consultare l\'archivio delle proposte eliminate.' });
    }
    res.json({
        items: Idee.findDeleted().map((r) => mapIdeaRow(r, user)),
    });
});

app.post('/api/auth/idee/:id/read', authenticate, (req, res) => {
    const user = requireIdeeAdmin(req, res);
    if (!user) return;
    const id = String(req.params.id || '').trim();
    const row = Idee.get(id);
    if (!row || (row.deletedAt && String(row.deletedAt).trim())) {
        return res.status(404).json({ error: 'Proposta non trovata.' });
    }
    Idee.markRead(id, user.id);
    res.json({ success: true, unread: Idee.countUnreadForAdmin(user.id) });
});

app.post('/api/auth/idee/:id/unread', authenticate, (req, res) => {
    const user = requireIdeeAdmin(req, res);
    if (!user) return;
    const id = String(req.params.id || '').trim();
    const row = Idee.get(id);
    if (!row || (row.deletedAt && String(row.deletedAt).trim())) {
        return res.status(404).json({ error: 'Proposta non trovata.' });
    }
    Idee.markUnread(id, user.id);
    res.json({ success: true, unread: Idee.countUnreadForAdmin(user.id) });
});

app.delete('/api/auth/idee/:id', authenticate, (req, res) => {
    const user = requireIdeeAdmin(req, res);
    if (!user) return;
    const id = String(req.params.id || '').trim();
    const row = Idee.get(id);
    if (!row) return res.status(404).json({ error: 'Proposta non trovata.' });
    if (row.deletedAt && String(row.deletedAt).trim()) {
        return res.status(400).json({ error: 'La proposta è già nell\'archivio.' });
    }
    Idee.softDelete(id, { id: user.id, label: ideaAuthorLabel(user) });
    res.json({
        success: true,
        unread: Idee.countUnreadForAdmin(user.id),
    });
});

app.delete('/api/auth/idee/:id/forever', authenticate, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
    if (user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Solo i Super Admin possono eliminare definitivamente le proposte.' });
    }
    const id = String(req.params.id || '').trim();
    const row = Idee.get(id);
    if (!row) return res.status(404).json({ error: 'Proposta non trovata.' });
    if (!(row.deletedAt && String(row.deletedAt).trim())) {
        return res.status(400).json({ error: 'Sposta prima la proposta nell\'archivio (Elimina dalle proposte ricevute).' });
    }
    Idee.hardDelete(id);
    res.json({ success: true });
});

app.post('/api/auth/idee', authenticate, (req, res) => {
    const user = Users.findById(req.user.id);
    if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
    if (isStrumentoAccount(user)) return res.status(403).json({ error: 'Non disponibile per i profili strumento.' });
    const body = String((req.body || {}).text || '').trim();
    if (body.length < 10) return res.status(400).json({ error: 'Scrivi almeno 10 caratteri.' });
    if (body.length > 4000) return res.status(400).json({ error: 'Il testo può avere al massimo 4000 caratteri.' });
    const topic = resolveIdeaTopic(req.body || {});
    if (topic.error) return res.status(400).json({ error: topic.error });
    const authorLabel = ideaAuthorLabel(user);
    Idee.insert({
        id: uuidv4(),
        userId: user.id,
        authorLabel,
        authorEmail: user.email || '',
        body,
        topicKind: topic.topicKind,
        topicKey: topic.topicKey,
        topicLabel: topic.topicLabel,
        createdAt: new Date().toISOString(),
    });
    notifyAdmins(
        'idea',
        'Nuova idea o proposta',
        body,
        '/idee#archivio',
        user.id,
        { actor: authorLabel, topic: topic.topicLabel, detail: body }
    );
    res.json({ ok: true });
});

// ── Corsi CMS (admin/superadmin = docenti) ────────────────────────────────────
mountCorsiRoutes(app, { authenticate, requireDocente, requireCorsiAccess, notifyCorsiEditors, actorLabel });

mountBibbiaRoutes(app, {
    authenticate,
    requireAdmin,
    userCanAccessCard,
    isAccountUsable,
    notifyAdmins,
    notifyUser,
    actorLabel,
});

mountSeedPhraseRoutes(app, {
    authenticate,
    userCanAccessCard,
    isAccountUsable,
    Users,
});

app.listen(PORT,'0.0.0.0',()=>{
    console.log(`Auth service in ascolto su http://0.0.0.0:${PORT}`);
    try { pruneStaleAuthData(); } catch { /* ignore */ }
    startBackupScheduler();
    try { telegramCriptogram.startPolling(); } catch (err) {
        console.warn('[Telegram Criptogram] avvio poll fallito:', err.message || err);
    }
    setTimeout(() => { try { checkCriptogramStorage(false); } catch { /* ignore */ } }, 20 * 1000);
    const storageTimer = setInterval(() => {
        try { checkCriptogramStorage(false); } catch { /* ignore */ }
    }, 60 * 60 * 1000);
    if (typeof storageTimer.unref === 'function') storageTimer.unref();
});
