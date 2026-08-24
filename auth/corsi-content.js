'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { CorsiVersions, CorsiItems, Users } = require('./db');

// I contenuti vivono nella tabella corsi_items. Il filesystem serve ancora solo
// per le immagini caricate (corsi/uploads) e per la migrazione una tantum del
// vecchio manifest.json.
const CORSI_DIR = process.env.CORSI_DIR
    || (fs.existsSync(path.join(__dirname, '..', 'corsi'))
        ? path.join(__dirname, '..', 'corsi')
        : path.join(__dirname, 'corsi'));
const MANIFEST_FILE = path.join(CORSI_DIR, 'manifest.json');
const RESERVED_IDS = new Set(['home', 'manage', 'new', 'edit', 'view', 'storico']);
/* Accetta underscore (nuovi) e trattini (contenuti legacy). */
const ID_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const MAX_CONTENT = 500_000;
const MAX_DEPTH = 20;
const NODE_TYPES = new Set(['course', 'section', 'page']);
/** Presenza in Gestione contenuti (heartbeat in memoria; scade se il client smette di pingare). */
const PRESENCE_TTL_MS = 45_000;
const managePresence = new Map();

/** Branding fisso della sezione (non modificabile dai docenti). */
const SITE_TITLE = 'Corsi';
const SITE_DESCRIPTION = 'Area formazione e materiali didattici per i Reparti.';

function safeId(id) {
    const s = String(id || '').trim().toLowerCase();
    if (!ID_RE.test(s) || s.length > 64 || RESERVED_IDS.has(s)) return null;
    return s;
}

function isIsoDate(iso) {
    if (!iso) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function stripFrontMatter(raw) {
    if (!String(raw).startsWith('---')) return { meta: {}, body: String(raw || '') };
    const end = raw.indexOf('\n---', 3);
    if (end === -1) return { meta: {}, body: raw };
    const fm = raw.slice(3, end).trim();
    const body = raw.slice(end + 4).replace(/^\s*\n/, '');
    const meta = {};
    fm.split('\n').forEach((line) => {
        const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
    return { meta, body };
}

/** Un nodo con padre è sempre una sottosezione; le pagine stanno solo in radice. */
function normalizeType(rawType, parentId) {
    let type = String(rawType || 'course');
    if (type === 'post') type = 'course';
    if (!NODE_TYPES.has(type)) type = 'course';
    if (parentId) return 'section';
    if (type === 'section') return 'course';
    return type;
}

// ── Albero ───────────────────────────────────────────────────────────────────

function buildNav() {
    const byParent = new Map();
    for (const row of CorsiItems.all()) {
        const key = row.parentId || '';
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(row);
    }
    for (const list of byParent.values()) {
        list.sort((a, b) => (a.position - b.position)
            || String(a.createdAt).localeCompare(String(b.createdAt)));
    }
    const build = (key, depth) => {
        if (depth > MAX_DEPTH) return [];
        return (byParent.get(key) || []).map((row) => {
            const node = {
                id: row.id,
                title: row.title,
                type: row.type,
                children: build(row.id, depth + 1),
            };
            if (row.courseDate) node.date = row.courseDate;
            return node;
        });
    };
    return build('', 0);
}

function publicManifest() {
    return {
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        nav: buildNav(),
        // compat lettori vecchi
        pages: [],
        posts: [],
    };
}

/** Il nodo e tutti i suoi discendenti, in pre-ordine. */
function subtreeRows(id, acc = [], depth = 0) {
    if (depth > MAX_DEPTH) return acc;
    const row = CorsiItems.findById(id);
    if (!row) return acc;
    acc.push(row);
    for (const child of CorsiItems.childrenOf(id)) subtreeRows(child.id, acc, depth + 1);
    return acc;
}

function snapshotRow(row, action, user) {
    CorsiVersions.insert({
        id: crypto.randomUUID(),
        itemId: row.id,
        title: row.title || row.id,
        kind: row.type || 'course',
        content: row.content || '',
        action,
        editedById: user?.id || '',
        editedByEmail: user?.email || '',
        createdAt: new Date().toISOString(),
        parentId: row.parentId || null,
        position: row.position != null ? Number(row.position) : 0,
    });
}

// ── Migrazione una tantum dal filesystem ─────────────────────────────────────

function legacyNav(data) {
    if (Array.isArray(data.nav)) return data.nav;
    const nav = [];
    (data.pages || []).forEach((p) => nav.push({ ...p, type: 'page', children: [] }));
    (data.posts || []).forEach((p) => nav.push({ ...p, type: 'course', children: [] }));
    return nav;
}

/**
 * Importa manifest.json e i file .md nella tabella corsi_items.
 * Gira una sola volta: se la tabella contiene già righe, esce subito.
 * I file restano sul disco come copia di sicurezza, non vengono più letti.
 */
function migrateFromFilesystem() {
    if (CorsiItems.count() > 0) return;
    if (!fs.existsSync(MANIFEST_FILE)) return;

    let data;
    try {
        data = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    } catch (e) {
        console.error('[CORSI] manifest.json illeggibile, migrazione saltata:', e.message);
        return;
    }

    const now = new Date().toISOString();
    const rows = [];
    let skippedDividers = 0;

    const walk = (nodes, parentId, depth) => {
        if (depth > MAX_DEPTH) return;
        let position = 0;
        for (const node of Array.isArray(nodes) ? nodes : []) {
            if (!node || typeof node !== 'object') continue;
            if (node.type === 'divider') { skippedDividers += 1; continue; }
            const id = safeId(node.id);
            if (!id) continue;

            let title = String(node.title || id);
            let content = '';
            const file = path.basename(String(node.file || `${id}.md`));
            const filePath = path.join(CORSI_DIR, file);
            if (fs.existsSync(filePath)) {
                const parsed = stripFrontMatter(fs.readFileSync(filePath, 'utf8'));
                content = parsed.body;
                if (parsed.meta.title) title = parsed.meta.title;
            }

            rows.push({
                id,
                parentId,
                position: position++,
                type: normalizeType(node.type, parentId),
                title,
                content,
                courseDate: String(node.date || ''),
                createdAt: now,
                updatedAt: now,
            });
            walk(node.children, id, depth + 1);
        }
    };
    walk(legacyNav(data), null, 0);

    if (!rows.length) return;
    // Pre-ordine: il padre viene sempre inserito prima dei figli, come richiede la FK.
    CorsiItems.tx(() => { rows.forEach((r) => CorsiItems.insert(r)); })();
    console.log(`[CORSI] Migrate ${rows.length} sezioni dal filesystem al database`
        + (skippedDividers ? ` (${skippedDividers} separatori obsoleti scartati)` : ''));
}

function profileName(user) {
    if (!user) return 'Un collega';
    const cognome = String(user.cognome || '').trim();
    const nome = String(user.nome || '').trim();
    if (cognome && nome) return `${cognome.toUpperCase()} ${nome}`;
    if (nome) return nome;
    if (cognome) return cognome.toUpperCase();
    return String(user.email || 'Un collega');
}

function touchManagePresence(userId, name) {
    const now = Date.now();
    const row = managePresence.get(userId);
    if (!row) {
        managePresence.set(userId, { userId, profileName: name, since: now, lastSeen: now });
    } else {
        row.lastSeen = now;
        row.profileName = name;
    }
}

function pruneManagePresence() {
    const now = Date.now();
    for (const [id, row] of managePresence) {
        if (now - row.lastSeen > PRESENCE_TTL_MS) managePresence.delete(id);
    }
}

function listManagePresence(exceptUserId) {
    pruneManagePresence();
    return [...managePresence.values()]
        .filter((row) => row.userId !== exceptUserId)
        .map((row) => ({
            userId: row.userId,
            profileName: row.profileName,
            since: new Date(row.since).toISOString(),
        }));
}

// ── Routes ───────────────────────────────────────────────────────────────────

function mountCorsiRoutes(app, {
    authenticate,
    requireDocente,
    requireCorsiAccess,
    notifyCorsiEditors,
    actorLabel,
}) {
    try {
        migrateFromFilesystem();
    } catch (e) {
        console.error('[CORSI] migrazione fallita:', e.message);
    }

    const canRead = typeof requireCorsiAccess === 'function'
        ? requireCorsiAccess
        : (req, res, next) => next();

    function notifyEditors(req, type, title, body) {
        if (typeof notifyCorsiEditors !== 'function') return;
        const full = Users.findById(req.user.id) || req.user;
        const actor = typeof actorLabel === 'function' ? actorLabel(full) : (full.email || 'un utente');
        notifyCorsiEditors(req.user.id, type, title, `${actor} ${body}`, '/corsi-storico');
    }

    function authorLabel(userId) {
        if (!userId) return '';
        const u = Users.findById(userId);
        if (!u) return '';
        return typeof actorLabel === 'function' ? actorLabel(u) : (u.email || '');
    }

    // ── Lettura (qualsiasi utente con la scheda Corsi) ────────────────────────

    app.get('/api/auth/corsi/manifest', authenticate, canRead, (req, res) => {
        try {
            res.json(publicManifest());
        } catch (e) {
            console.error('[CORSI] manifest:', e.message);
            res.status(500).json({ error: 'Impossibile leggere l\'indice dei corsi.' });
        }
    });

    app.post('/api/auth/corsi/presence', authenticate, requireDocente, (req, res) => {
        try {
            const full = Users.findById(req.user.id) || req.user;
            touchManagePresence(req.user.id, profileName(full));
            res.json({ success: true });
        } catch (e) {
            console.error('[CORSI] presence:', e.message);
            res.status(500).json({ error: 'Impossibile registrare la presenza.' });
        }
    });

    app.get('/api/auth/corsi/live', authenticate, requireDocente, (req, res) => {
        try {
            const since = String(req.query.since || '').trim();
            const saves = since
                ? CorsiItems.changesSince(since, req.user.id).map((row) => ({
                    at: row.updatedAt,
                    userId: row.updatedById,
                    profileName: profileName(Users.findById(row.updatedById)),
                    itemId: row.id,
                    title: row.title || row.id,
                }))
                : [];
            res.json({
                serverTime: new Date().toISOString(),
                saves,
                editorsOnline: listManagePresence(req.user.id),
            });
        } catch (e) {
            console.error('[CORSI] live:', e.message);
            res.status(500).json({ error: 'Impossibile leggere l\'attività live.' });
        }
    });

    app.get('/api/auth/corsi/content/:id', authenticate, canRead, (req, res) => {
        const id = safeId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Identificativo non valido.' });
        try {
            const row = CorsiItems.findById(id);
            if (!row) return res.status(404).json({ error: 'Contenuto non trovato.' });
            res.json({
                id: row.id,
                title: row.title,
                type: row.type,
                date: row.courseDate || '',
                content: row.content || '',
                updatedAt: row.updatedAt,
                updatedBy: authorLabel(row.updatedById),
            });
        } catch (e) {
            console.error('[CORSI] content:', e.message);
            res.status(500).json({ error: 'Impossibile leggere il contenuto.' });
        }
    });

    // ── Upload immagini (restano su filesystem: i tag <img> non inviano token) ─

    const UPLOADS_DIR = path.join(CORSI_DIR, 'uploads');
    const IMG_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };
    app.post('/api/auth/corsi/upload', authenticate, requireDocente,
        express.raw({ type: 'image/*', limit: '10mb' }),
        (req, res) => {
            try {
                const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
                const ext = IMG_EXT[mime];
                if (!ext) return res.status(400).json({ error: 'Formato non supportato: usa PNG, JPG, GIF o WebP.' });
                if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'File vuoto o non valido.' });
                const base = String(req.query.name || 'immagine')
                    .replace(/\.[^.]*$/, '')
                    .toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .slice(0, 40) || 'immagine';
                const fname = `${base}-${crypto.randomBytes(4).toString('hex')}${ext}`;
                if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
                fs.writeFileSync(path.join(UPLOADS_DIR, fname), req.body);
                res.json({ url: `/corsi/uploads/${fname}` });
            } catch (e) {
                console.error('[CORSI] upload:', e.message);
                res.status(500).json({ error: 'Caricamento immagine non riuscito.' });
            }
        });

    // ── Storico versioni (solo docenti) ──────────────────────────────────────

    app.get('/api/auth/corsi/versions', authenticate, requireDocente, (req, res) => {
        try {
            const itemId = req.query.itemId ? String(req.query.itemId).trim().toLowerCase() : '';
            const rows = CorsiVersions.list({
                itemId: itemId && ID_RE.test(itemId) ? itemId : undefined,
                limit: req.query.limit,
            });
            res.json({ items: rows });
        } catch (e) {
            console.error('[CORSI] versions list:', e.message);
            res.status(500).json({ error: 'Impossibile leggere lo storico.' });
        }
    });

    app.post('/api/auth/corsi/versions/bulk-delete', authenticate, requireDocente, (req, res) => {
        try {
            const ids = Array.isArray((req.body || {}).ids)
                ? (req.body.ids).map((id) => String(id || '').trim()).filter(Boolean)
                : [];
            if (!ids.length) return res.status(400).json({ error: 'Nessuna versione selezionata.' });
            if (ids.length > 200) return res.status(400).json({ error: 'Puoi eliminare al massimo 200 versioni per volta.' });
            const deleted = CorsiVersions.removeMany(ids);
            if (deleted > 0) {
                notifyEditors(req, 'corsi_version_deleted', 'Versioni corso eliminate dallo storico',
                    `ha eliminato ${deleted} version${deleted === 1 ? 'e' : 'i'} dallo storico corsi.`);
            }
            res.json({ success: true, deleted });
        } catch (e) {
            console.error('[CORSI] versions bulk-delete:', e.message);
            res.status(500).json({ error: 'Impossibile eliminare le versioni selezionate.' });
        }
    });

    app.get('/api/auth/corsi/versions/:vid', authenticate, requireDocente, (req, res) => {
        try {
            const row = CorsiVersions.findById(String(req.params.vid || ''));
            if (!row) return res.status(404).json({ error: 'Versione non trovata.' });
            res.json(row);
        } catch (e) {
            console.error('[CORSI] version get:', e.message);
            res.status(500).json({ error: 'Impossibile leggere la versione.' });
        }
    });

    app.post('/api/auth/corsi/versions/:vid/restore', authenticate, requireDocente, (req, res) => {
        try {
            const version = CorsiVersions.findById(String(req.params.vid || ''));
            if (!version) return res.status(404).json({ error: 'Versione non trovata.' });
            const id = safeId(version.itemId);
            if (!id) return res.status(400).json({ error: 'Identificativo modulo non valido.' });

            const title = String(version.title || id).trim() || id;
            const content = String(version.content || '');
            const now = new Date().toISOString();
            const existing = CorsiItems.findById(id);
            const type = existing
                ? existing.type
                : normalizeType(NODE_TYPES.has(version.kind) ? version.kind : 'course', null);
            const restoreParentId = version.parentId ? safeId(version.parentId) : null;
            const restorePosition = version.position != null ? Number(version.position) : 0;
            if (version.parentId && !restoreParentId) {
                return res.status(400).json({ error: 'Posizione nella sidebar non valida per questa versione.' });
            }
            if (restoreParentId && !CorsiItems.exists(restoreParentId)) {
                return res.status(400).json({ error: 'La sezione padre di questa versione non esiste più.' });
            }

            CorsiItems.tx(() => {
                if (existing) {
                    snapshotRow(existing, 'update', req.user);
                    CorsiItems.update(id, {
                        type: existing.type,
                        title,
                        content,
                        courseDate: existing.courseDate,
                        updatedAt: now,
                        updatedById: req.user.id,
                    });
                    if (existing.parentId !== restoreParentId || existing.position !== restorePosition) {
                        CorsiItems.move(id, restoreParentId, restorePosition);
                    }
                } else {
                    CorsiItems.insert({
                        id,
                        parentId: restoreParentId,
                        position: restorePosition,
                        type,
                        title,
                        content,
                        courseDate: type === 'course' ? today() : '',
                        createdAt: now,
                        updatedAt: now,
                        createdById: req.user.id,
                        updatedById: req.user.id,
                    });
                }
            })();

            notifyEditors(req, 'corsi_version_restored', 'Versione corso ripristinata',
                `ha ripristinato una versione di «${title}» (${id}).`);
            res.json({ success: true, id, type, manifest: publicManifest() });
        } catch (e) {
            console.error('[CORSI] restore:', e.message);
            res.status(500).json({ error: 'Impossibile ripristinare la versione.' });
        }
    });

    app.delete('/api/auth/corsi/versions/:vid', authenticate, requireDocente, (req, res) => {
        try {
            const row = CorsiVersions.findById(String(req.params.vid || ''));
            if (!row) return res.status(404).json({ error: 'Versione non trovata.' });
            CorsiVersions.remove(row.id);
            notifyEditors(req, 'corsi_version_deleted', 'Versione corso eliminata dallo storico',
                `ha eliminato dallo storico una versione di «${row.title || row.itemId}» (${row.itemId}).`);
            res.json({ success: true });
        } catch (e) {
            console.error('[CORSI] version delete:', e.message);
            res.status(500).json({ error: 'Impossibile eliminare la versione.' });
        }
    });

    // ── Gestione contenuti (solo docenti) ────────────────────────────────────

    app.get('/api/auth/corsi/items/:id', authenticate, requireDocente, (req, res) => {
        const id = safeId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Identificativo non valido.' });
        try {
            const row = CorsiItems.findById(id);
            if (!row) return res.status(404).json({ error: 'Modulo non trovato.' });
            res.json({
                id: row.id,
                type: row.type,
                kind: row.type,
                title: row.title,
                date: row.courseDate || '',
                parentId: row.parentId || null,
                content: row.content || '',
                updatedAt: row.updatedAt,
                updatedBy: authorLabel(row.updatedById),
            });
        } catch (e) {
            console.error('[CORSI] get item:', e.message);
            res.status(500).json({ error: 'Errore lettura modulo.' });
        }
    });

    app.put('/api/auth/corsi/settings', authenticate, requireDocente, (req, res) => {
        // Titolo e descrizione della sezione sono immutabili.
        res.json({
            success: true,
            manifest: publicManifest(),
            message: 'Titolo e descrizione della sezione Corsi non sono modificabili.',
        });
    });

    app.put('/api/auth/corsi/reorder', authenticate, requireDocente, (req, res) => {
        try {
            const b = req.body || {};
            const parentId = b.parentId ? safeId(b.parentId) : null;
            if (b.parentId && !parentId) return res.status(400).json({ error: 'Parent non valido.' });
            if (parentId && !CorsiItems.exists(parentId)) {
                return res.status(404).json({ error: 'Nodo padre non trovato.' });
            }
            const order = Array.isArray(b.order)
                ? b.order.map((raw) => safeId(raw)).filter(Boolean)
                : [];
            if (!order.length) return res.status(400).json({ error: 'Ordine non valido.' });
            const siblings = CorsiItems.childrenOf(parentId);
            const siblingIds = new Set(siblings.map((r) => r.id));
            if (order.length !== siblingIds.size || !order.every((id) => siblingIds.has(id))) {
                return res.status(400).json({ error: 'L\'ordine deve includere tutte le voci dello stesso livello.' });
            }
            CorsiItems.tx(() => { CorsiItems.reorderSiblings(parentId, order); })();
            notifyEditors(req, 'corsi_reordered', 'Ordine sidebar corsi aggiornato',
                `ha modificato l\'ordine delle sezioni nella sidebar corsi.`);
            res.json({ success: true, manifest: publicManifest() });
        } catch (e) {
            console.error('[CORSI] reorder:', e.message);
            res.status(500).json({ error: 'Impossibile aggiornare l\'ordine.' });
        }
    });

    app.post('/api/auth/corsi/items', authenticate, requireDocente, (req, res) => {
        try {
            const b = req.body || {};
            const id = safeId(b.id);
            if (!id) {
                return res.status(400).json({
                    error: 'ID non valido. Usa solo lettere minuscole, numeri e trattini (es. corso_base).',
                });
            }
            const title = String(b.title || '').trim();
            if (!title) return res.status(400).json({ error: 'Il titolo è obbligatorio.' });
            const content = String(b.content ?? '');
            if (content.length > MAX_CONTENT) return res.status(400).json({ error: 'Contenuto troppo lungo.' });
            const date = String(b.date || '').trim();
            if (!isIsoDate(date)) return res.status(400).json({ error: 'Data non valida (YYYY-MM-DD).' });

            const parentId = b.parentId ? safeId(b.parentId) : null;
            if (b.parentId && !parentId) return res.status(400).json({ error: 'Parent non valido.' });
            if (parentId && !CorsiItems.exists(parentId)) {
                return res.status(404).json({ error: 'Nodo padre non trovato.' });
            }
            if (CorsiItems.exists(id)) {
                return res.status(409).json({ error: 'Esiste già un elemento con questo ID.' });
            }
            if (parentId && String(b.type || '') === 'page') {
                return res.status(400).json({ error: 'Le pagine possono stare solo alla radice della sidebar.' });
            }

            const type = normalizeType(b.type || b.kind, parentId);
            const now = new Date().toISOString();
            CorsiItems.insert({
                id,
                parentId,
                position: CorsiItems.nextPosition(parentId),
                type,
                title,
                content,
                courseDate: type === 'course' ? (date || today()) : '',
                createdAt: now,
                updatedAt: now,
                createdById: req.user.id,
                updatedById: req.user.id,
            });

            notifyEditors(req, 'corsi_item_created', 'Nuovo contenuto corsi',
                `ha aggiunto «${title}» (${id}) nella sidebar corsi.`);
            res.status(201).json({ success: true, id, type, manifest: publicManifest() });
        } catch (e) {
            console.error('[CORSI] create:', e.message);
            res.status(500).json({ error: 'Impossibile creare il modulo.' });
        }
    });

    /**
     * Valida e applica una modifica. Va chiamata dentro una transazione:
     * archivia la versione precedente e riscrive la riga corrente.
     */
    function applyItemUpdate(id, b, user, { moveParent = false } = {}) {
        const row = CorsiItems.findById(id);
        if (!row) return { error: 'Modulo non trovato.', status: 404 };

        const title = String(b.title || '').trim();
        if (!title) return { error: 'Il titolo è obbligatorio.', status: 400 };
        const content = String(b.content ?? '');
        if (content.length > MAX_CONTENT) return { error: 'Contenuto troppo lungo.', status: 400 };

        let parentId = row.parentId || null;
        if (moveParent && Object.prototype.hasOwnProperty.call(b, 'parentId')) {
            const newParentId = b.parentId ? safeId(b.parentId) : null;
            if (b.parentId && !newParentId) return { error: 'Parent non valido.', status: 400 };
            if (newParentId === id) return { error: 'Un elemento non può essere padre di se stesso.', status: 400 };
            if (newParentId !== parentId) {
                if (newParentId) {
                    if (!CorsiItems.exists(newParentId)) return { error: 'Nodo padre non trovato.', status: 404 };
                    const descendants = subtreeRows(id).map((r) => r.id);
                    if (descendants.includes(newParentId)) {
                        return { error: 'Non puoi spostare un elemento sotto una sua sottosezione.', status: 400 };
                    }
                }
                CorsiItems.move(id, newParentId, CorsiItems.nextPosition(newParentId));
                parentId = newParentId;
            }
        }

        if (parentId && String(b.type || '') === 'page') {
            return { error: 'Le pagine possono stare solo alla radice della sidebar.', status: 400 };
        }

        const type = normalizeType(b.type || b.kind || row.type, parentId);
        let date = String(b.date || '').trim();
        if (!isIsoDate(date) || !date) date = row.courseDate || today();

        if (Object.prototype.hasOwnProperty.call(b, 'expectedUpdatedAt')) {
            const expected = String(b.expectedUpdatedAt || '').trim();
            if (expected && String(row.updatedAt || '') !== expected) {
                const by = authorLabel(row.updatedById);
                const who = by ? ` (${by})` : '';
                return {
                    error: `«${row.title || id}» è stato modificato da un altro docente${who}. Ricarica prima di salvare.`,
                    status: 409,
                    conflict: {
                        id,
                        title: row.title || id,
                        updatedAt: row.updatedAt,
                        updatedBy: by,
                    },
                };
            }
        }

        snapshotRow(row, 'update', user);
        CorsiItems.update(id, {
            type,
            title,
            content,
            courseDate: type === 'course' ? date : '',
            updatedAt: new Date().toISOString(),
            updatedById: user?.id || null,
        });
        return { ok: true, id, type, title };
    }

    app.put('/api/auth/corsi/items/:id', authenticate, requireDocente, (req, res) => {
        try {
            const id = safeId(req.params.id);
            if (!id) return res.status(400).json({ error: 'Identificativo non valido.' });
            let result;
            CorsiItems.tx(() => {
                result = applyItemUpdate(id, req.body || {}, req.user, { moveParent: true });
                if (result.error) {
                    throw Object.assign(new Error(result.error), {
                        handled: true,
                        status: result.status,
                        conflict: result.conflict || null,
                    });
                }
            })();
            notifyEditors(req, 'corsi_version_archived', 'Nuova versione corso archiviata',
                `ha modificato «${result.title}» (${id}): la versione precedente è nello storico.`);
            res.json({ success: true, id, type: result.type, manifest: publicManifest() });
        } catch (e) {
            if (e.handled) {
                return res.status(e.status || 400).json({
                    error: e.message,
                    conflict: e.conflict || undefined,
                });
            }
            console.error('[CORSI] update:', e.message);
            res.status(500).json({ error: 'Impossibile aggiornare il modulo.' });
        }
    });

    app.put('/api/auth/corsi/bulk', authenticate, requireDocente, (req, res) => {
        try {
            const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
            if (!items.length) return res.status(400).json({ error: 'Nessuna sezione da salvare.' });
            const saved = [];
            CorsiItems.tx(() => {
                for (const b of items) {
                    const id = safeId(b && b.id);
                    if (!id) throw Object.assign(new Error('Identificativo non valido.'), { handled: true });
                    const result = applyItemUpdate(id, b, req.user, { moveParent: false });
                    if (result.error) {
                        throw Object.assign(new Error(result.error), {
                            handled: true,
                            status: result.status || 400,
                            conflict: result.conflict || null,
                        });
                    }
                    saved.push(id);
                }
            })();
            notifyEditors(req, 'corsi_version_archived', 'Nuova versione corso archiviata',
                `ha salvato ${saved.length} sezioni corsi (versioni precedenti nello storico).`);
            res.json({ success: true, saved, count: saved.length, manifest: publicManifest() });
        } catch (e) {
            if (e.handled) {
                return res.status(e.status || 400).json({
                    error: e.message,
                    conflict: e.conflict || undefined,
                });
            }
            console.error('[CORSI] bulk:', e.message);
            res.status(500).json({ error: 'Impossibile salvare i contenuti.' });
        }
    });

    app.get('/api/auth/corsi/export-bundle', authenticate, requireDocente, (req, res) => {
        try {
            const items = CorsiItems.all().map((row) => ({
                id: row.id,
                title: row.title || row.id,
                type: row.type,
                courseDate: row.courseDate || '',
                content: row.content || '',
                parentId: row.parentId || null,
                position: row.position,
            }));
            res.json({
                exportedAt: new Date().toISOString(),
                manifest: publicManifest(),
                items,
            });
        } catch (e) {
            console.error('[CORSI] export-bundle:', e.message);
            res.status(500).json({ error: 'Impossibile esportare i contenuti.' });
        }
    });

    app.delete('/api/auth/corsi/items/:id', authenticate, requireDocente, (req, res) => {
        try {
            const id = safeId(req.params.id);
            if (!id) return res.status(400).json({ error: 'Identificativo non valido.' });
            const row = CorsiItems.findById(id);
            if (!row) return res.status(404).json({ error: 'Elemento non trovato.' });

            const removed = subtreeRows(id);
            CorsiItems.tx(() => {
                removed.forEach((node) => snapshotRow(node, 'delete', req.user));
                // I discendenti spariscono da soli: ON DELETE CASCADE su parentId.
                CorsiItems.remove(id);
            })();

            notifyEditors(req, 'corsi_module_deleted', 'Modulo corso eliminato',
                `ha eliminato «${row.title || id}» (${id}) e le relative sottosezioni dalla sidebar.`);
            res.json({ success: true, manifest: publicManifest() });
        } catch (e) {
            console.error('[CORSI] delete:', e.message);
            res.status(500).json({ error: 'Impossibile eliminare il modulo.' });
        }
    });
}

module.exports = { mountCorsiRoutes, CORSI_DIR };
