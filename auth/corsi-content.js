'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { CorsiVersions, Users } = require('./db');

// Default: cartella corsi/ nella root del progetto (sviluppo locale senza Docker);
// in Docker la variabile CORSI_DIR è sempre impostata dal compose.
const CORSI_DIR = process.env.CORSI_DIR
    || (fs.existsSync(path.join(__dirname, '..', 'corsi'))
        ? path.join(__dirname, '..', 'corsi')
        : path.join(__dirname, 'corsi'));
const MANIFEST_FILE = path.join(CORSI_DIR, 'manifest.json');
const RESERVED_IDS = new Set(['home', 'manage', 'new', 'edit', 'view', 'storico']);
/* Accetta underscore (nuovi) e trattini (contenuti legacy). */
const ID_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const MAX_CONTENT = 500_000;
const NODE_TYPES = new Set(['course', 'section', 'page']);
/** Branding fisso della sezione (non modificabile dai docenti). */
const SITE_TITLE = 'Corsi';
const SITE_DESCRIPTION = 'Area formazione e materiali didattici per i Reparti.';

function ensureDir() {
    if (!fs.existsSync(CORSI_DIR)) fs.mkdirSync(CORSI_DIR, { recursive: true });
}

function safeId(id) {
    const s = String(id || '').trim().toLowerCase();
    if (!ID_RE.test(s) || s.length > 64 || RESERVED_IDS.has(s)) return null;
    return s;
}

function mdPath(id) {
    return path.join(CORSI_DIR, `${id}.md`);
}

function isIsoDate(iso) {
    if (!iso) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function buildFrontMatter({ title, date, layout }) {
    const lines = ['---'];
    if (title) lines.push(`title: ${title}`);
    if (date) lines.push(`date: ${date}`);
    if (layout) lines.push(`layout: ${layout}`);
    lines.push('---', '');
    return lines.join('\n');
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

function migrateLegacyNav(data) {
    if (Array.isArray(data.nav)) return data.nav;
    const nav = [];
    (data.pages || []).forEach((p) => {
        nav.push({
            id: p.id,
            title: p.title,
            type: 'page',
            file: p.file || `${p.id}.md`,
            children: [],
        });
    });
    if ((data.pages || []).length && (data.posts || []).length) {
        nav.push({ id: `divider-${crypto.randomUUID().slice(0, 8)}`, type: 'divider' });
    }
    (data.posts || []).forEach((p) => {
        nav.push({
            id: p.id,
            title: p.title,
            type: 'course',
            file: p.file || `${p.id}.md`,
            date: p.date || '',
            children: [],
        });
    });
    return nav;
}

function normalizeNode(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'divider') {
        return { id: node.id || `divider-${crypto.randomUUID().slice(0, 8)}`, type: 'divider' };
    }
    const type = NODE_TYPES.has(node.type)
        ? node.type
        : (node.layout === 'page' || node.type === 'page' ? 'page' : 'course');
    const id = safeId(node.id);
    if (!id) return null;
    const children = Array.isArray(node.children)
        ? node.children.map(normalizeNode).filter(Boolean)
        : [];
    const out = {
        id,
        title: String(node.title || id),
        type,
        file: node.file || `${id}.md`,
        children,
    };
    if (node.date) out.date = String(node.date);
    return out;
}

function readManifest() {
    ensureDir();
    let data;
    if (!fs.existsSync(MANIFEST_FILE)) {
        data = {
            title: 'Corsi',
            description: 'Area formazione e materiali didattici per i Reparti.',
            nav: [],
        };
    } else {
        data = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    }
    const nav = migrateLegacyNav(data).map(normalizeNode).filter(Boolean);
    const manifest = {
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        nav,
    };
    // Persist migration / branding fisso
    if (!Array.isArray(data.nav) || data.title !== SITE_TITLE || data.description !== SITE_DESCRIPTION) {
        writeManifest(manifest);
    }
    return manifest;
}

function writeManifest(data) {
    ensureDir();
    const out = {
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        nav: Array.isArray(data.nav) ? data.nav : [],
    };
    const tmp = MANIFEST_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, MANIFEST_FILE);
}

function walkNav(nodes, fn, parent = null) {
    if (!Array.isArray(nodes)) return null;
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const hit = fn(node, parent, i, nodes);
        if (hit) return hit;
        if (node.type !== 'divider' && node.children?.length) {
            const nested = walkNav(node.children, fn, node);
            if (nested) return nested;
        }
    }
    return null;
}

function findNode(manifest, id) {
    return walkNav(manifest.nav, (node, parent, index, siblings) => {
        if (node.id === id) return { node, parent, index, siblings };
        return null;
    });
}

function collectContentNodes(node, acc = []) {
    if (!node || node.type === 'divider') return acc;
    acc.push(node);
    (node.children || []).forEach((c) => collectContentNodes(c, acc));
    return acc;
}

function allIds(manifest) {
    const ids = new Set();
    walkNav(manifest.nav, (node) => {
        if (node.type !== 'divider') ids.add(node.id);
        return null;
    });
    return ids;
}

function parentContainer(manifest, parentId) {
    if (!parentId) return { siblings: manifest.nav, parent: null };
    const found = findNode(manifest, parentId);
    if (!found || found.node.type === 'divider') return null;
    if (!Array.isArray(found.node.children)) found.node.children = [];
    return { siblings: found.node.children, parent: found.node };
}

function snapshotVersion({ itemId, title, kind, content, action, user }) {
    CorsiVersions.insert({
        id: crypto.randomUUID(),
        itemId,
        title: title || itemId,
        kind: kind || 'course',
        content: content || '',
        action: action || 'update',
        editedById: user?.id || '',
        editedByEmail: user?.email || '',
        createdAt: new Date().toISOString(),
    });
}

function readExistingSnapshot(id, node) {
    const filePath = mdPath(id);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const { meta, body } = stripFrontMatter(raw);
    return {
        itemId: id,
        title: meta.title || node?.title || id,
        kind: node?.type || 'course',
        content: body,
    };
}

function publicNav(manifest) {
    return {
        title: manifest.title,
        description: manifest.description,
        nav: manifest.nav,
        // compat lettori vecchi
        pages: [],
        posts: [],
    };
}

function mountCorsiRoutes(app, { authenticate, requireDocente, notifyCorsiEditors, actorLabel }) {
    function notifyEditors(req, type, title, body) {
        if (typeof notifyCorsiEditors !== 'function') return;
        const full = Users.findById(req.user.id) || req.user;
        const actor = typeof actorLabel === 'function' ? actorLabel(full) : (full.email || 'un utente');
        notifyCorsiEditors(req.user.id, type, title, `${actor} ${body}`, '/corsi-storico');
    }

    app.get('/api/auth/corsi/manifest', authenticate, (req, res) => {
        try {
            res.json(publicNav(readManifest()));
        } catch (e) {
            console.error('[CORSI] read manifest:', e.message);
            res.status(500).json({ error: 'Impossibile leggere il manifesto corsi.' });
        }
    });

    // Upload immagini per i contenuti (solo docenti). Body binario, nome nel query param.
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
            const row = CorsiVersions.findById(String(req.params.vid || ''));
            if (!row) return res.status(404).json({ error: 'Versione non trovata.' });
            const id = safeId(row.itemId);
            if (!id) return res.status(400).json({ error: 'Identificativo modulo non valido.' });

            const manifest = readManifest();
            let found = findNode(manifest, id);
            const type = NODE_TYPES.has(row.kind) ? row.kind : 'course';
            const title = String(row.title || id).trim() || id;
            const content = String(row.content || '');

            if (found) {
                const current = readExistingSnapshot(id, found.node);
                if (current) snapshotVersion({ ...current, action: 'update', user: req.user });
            }

            const raw = buildFrontMatter({
                title,
                date: type === 'course' ? new Date().toISOString().slice(0, 10) : undefined,
                layout: type === 'page' ? 'page' : undefined,
            }) + content.replace(/^\uFEFF/, '');
            fs.writeFileSync(mdPath(id), raw, 'utf8');

            if (!found) {
                const entry = {
                    id, title, type, file: `${id}.md`, children: [],
                    date: type === 'course' ? new Date().toISOString().slice(0, 10) : undefined,
                };
                if (!entry.date) delete entry.date;
                manifest.nav.push(entry);
            } else {
                found.node.title = title;
                found.node.type = type;
                found.node.file = `${id}.md`;
            }
            writeManifest(manifest);
            notifyEditors(req, 'corsi_version_restored', 'Versione corso ripristinata',
                `ha ripristinato una versione di «${title}» (${id}).`);
            res.json({ success: true, id, type, manifest: publicNav(manifest) });
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

    app.get('/api/auth/corsi/items/:id', authenticate, requireDocente, (req, res) => {
        const id = safeId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Identificativo non valido.' });
        try {
            const manifest = readManifest();
            const found = findNode(manifest, id);
            if (!found || found.node.type === 'divider') {
                return res.status(404).json({ error: 'Modulo non trovato.' });
            }
            const filePath = mdPath(id);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File Markdown mancante.' });
            }
            const raw = fs.readFileSync(filePath, 'utf8');
            const { meta, body } = stripFrontMatter(raw);
            res.json({
                id,
                type: found.node.type,
                kind: found.node.type,
                title: meta.title || found.node.title || id,
                date: meta.date || found.node.date || '',
                file: found.node.file,
                parentId: found.parent ? found.parent.id : null,
                content: body,
            });
        } catch (e) {
            console.error('[CORSI] get item:', e.message);
            res.status(500).json({ error: 'Errore lettura modulo.' });
        }
    });

    app.put('/api/auth/corsi/settings', authenticate, requireDocente, (req, res) => {
        // Titolo e descrizione della sezione sono immutabili.
        try {
            const manifest = readManifest();
            writeManifest(manifest);
            res.json({
                success: true,
                manifest: publicNav(manifest),
                message: 'Titolo e descrizione della sezione Corsi non sono modificabili.',
            });
        } catch (e) {
            console.error('[CORSI] settings:', e.message);
            res.status(500).json({ error: 'Impossibile salvare le impostazioni.' });
        }
    });

    app.post('/api/auth/corsi/nav/divider', authenticate, requireDocente, (req, res) => {
        try {
            const parentId = (req.body || {}).parentId ? safeId(req.body.parentId) : null;
            if ((req.body || {}).parentId && !parentId) {
                return res.status(400).json({ error: 'Parent non valido.' });
            }
            const manifest = readManifest();
            const container = parentContainer(manifest, parentId);
            if (!container) return res.status(404).json({ error: 'Nodo padre non trovato.' });
            container.siblings.push({
                id: `divider-${crypto.randomUUID().slice(0, 8)}`,
                type: 'divider',
            });
            writeManifest(manifest);
            res.status(201).json({ success: true, manifest: publicNav(manifest) });
        } catch (e) {
            console.error('[CORSI] divider:', e.message);
            res.status(500).json({ error: 'Impossibile aggiungere il separatore.' });
        }
    });

    app.post('/api/auth/corsi/items', authenticate, requireDocente, (req, res) => {
        try {
            const b = req.body || {};
            const id = safeId(b.id);
            if (!id) {
                return res.status(400).json({
                    error: 'ID non valido. Usa solo lettere minuscole, numeri e trattini (es. corso-base).',
                });
            }
            const title = String(b.title || '').trim();
            if (!title) return res.status(400).json({ error: 'Il titolo è obbligatorio.' });
            let type = String(b.type || b.kind || 'course');
            if (type === 'post') type = 'course';
            if (!NODE_TYPES.has(type)) type = 'course';
            const date = String(b.date || '').trim();
            if (!isIsoDate(date)) return res.status(400).json({ error: 'Data non valida (YYYY-MM-DD).' });
            const content = String(b.content ?? '');
            if (content.length > MAX_CONTENT) return res.status(400).json({ error: 'Contenuto troppo lungo.' });
            const parentId = b.parentId ? safeId(b.parentId) : null;
            if (b.parentId && !parentId) return res.status(400).json({ error: 'Parent non valido.' });
            if (parentId && type === 'course') type = 'section';

            const manifest = readManifest();
            if (allIds(manifest).has(id)) {
                return res.status(409).json({ error: 'Esiste già un elemento con questo ID.' });
            }
            if (fs.existsSync(mdPath(id))) {
                return res.status(409).json({ error: 'Il file Markdown esiste già.' });
            }
            const container = parentContainer(manifest, parentId);
            if (!container) return res.status(404).json({ error: 'Nodo padre non trovato.' });
            if (parentId && type === 'page') {
                return res.status(400).json({ error: 'Le pagine possono stare solo alla radice della sidebar.' });
            }

            const raw = buildFrontMatter({
                title,
                date: type === 'course' ? (date || new Date().toISOString().slice(0, 10)) : date || undefined,
                layout: type === 'page' ? 'page' : undefined,
            }) + content.replace(/^\uFEFF/, '');
            fs.writeFileSync(mdPath(id), raw, 'utf8');

            const entry = { id, title, type, file: `${id}.md`, children: [] };
            if (type === 'course') entry.date = date || new Date().toISOString().slice(0, 10);
            container.siblings.push(entry);
            writeManifest(manifest);
            notifyEditors(req, 'corsi_item_created', 'Nuovo contenuto corsi',
                `ha aggiunto «${title}» (${id}) nella sidebar corsi.`);
            res.status(201).json({ success: true, id, type, manifest: publicNav(manifest) });
        } catch (e) {
            console.error('[CORSI] create:', e.message);
            res.status(500).json({ error: 'Impossibile creare il modulo.' });
        }
    });

    function applyItemUpdate(manifest, id, b, user, { moveParent = false } = {}) {
        const title = String(b.title || '').trim();
        if (!title) return { error: 'Il titolo è obbligatorio.', status: 400 };
        let type = String(b.type || b.kind || 'course');
        if (type === 'post') type = 'course';
        if (!NODE_TYPES.has(type)) type = 'course';
        let date = String(b.date || '').trim();
        const content = String(b.content ?? '');
        if (content.length > MAX_CONTENT) return { error: 'Contenuto troppo lungo.', status: 400 };

        const found = findNode(manifest, id);
        if (!found || found.node.type === 'divider') {
            return { error: 'Modulo non trovato.', status: 404 };
        }

        const previous = readExistingSnapshot(id, found.node);
        if (previous) snapshotVersion({ ...previous, action: 'update', user });

        if (moveParent && Object.prototype.hasOwnProperty.call(b, 'parentId')) {
            const newParentId = b.parentId ? safeId(b.parentId) : null;
            if (b.parentId && !newParentId) return { error: 'Parent non valido.', status: 400 };
            if (newParentId === id) return { error: 'Un elemento non può essere padre di se stesso.', status: 400 };
            const currentParentId = found.parent ? found.parent.id : null;
            if (newParentId !== currentParentId) {
                if (newParentId) {
                    const descendants = collectContentNodes(found.node).map((n) => n.id);
                    if (descendants.includes(newParentId)) {
                        return { error: 'Non puoi spostare un elemento sotto una sua sottosezione.', status: 400 };
                    }
                }
                const dest = parentContainer(manifest, newParentId);
                if (!dest) return { error: 'Nodo padre non trovato.', status: 404 };
                found.siblings.splice(found.index, 1);
                dest.siblings.push(found.node);
                const again = findNode(manifest, id);
                Object.assign(found, again);
            }
        }

        if (found.parent && type === 'page') {
            return { error: 'Le pagine possono stare solo alla radice della sidebar.', status: 400 };
        }
        if (found.parent && type === 'course') type = 'section';

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isIsoDate(date)) {
            date = found.node.date || new Date().toISOString().slice(0, 10);
        }

        const raw = buildFrontMatter({
            title,
            date: type === 'course' ? date : undefined,
            layout: type === 'page' ? 'page' : undefined,
        }) + content.replace(/^\uFEFF/, '');
        fs.writeFileSync(mdPath(id), raw, 'utf8');

        found.node.title = title;
        found.node.type = type;
        found.node.file = `${id}.md`;
        if (type === 'course') found.node.date = date;
        else delete found.node.date;

        return { ok: true, id, type, title, previous };
    }

    app.put('/api/auth/corsi/bulk', authenticate, requireDocente, (req, res) => {
        try {
            const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
            if (!items.length) return res.status(400).json({ error: 'Nessuna sezione da salvare.' });
            const manifest = readManifest();
            const saved = [];
            let archived = 0;
            for (const b of items) {
                const id = safeId(b && b.id);
                if (!id) {
                    return res.status(400).json({ error: 'Identificativo non valido.', id: b && b.id });
                }
                const result = applyItemUpdate(manifest, id, b, req.user, { moveParent: false });
                if (result.error) return res.status(result.status).json({ error: result.error, id });
                saved.push(id);
                if (result.previous) archived += 1;
            }
            writeManifest(manifest);
            if (archived) {
                notifyEditors(req, 'corsi_version_archived', 'Nuova versione corso archiviata',
                    `ha salvato ${saved.length} sezioni corsi (versioni precedenti nello storico).`);
            }
            res.json({ success: true, saved, count: saved.length, manifest: publicNav(manifest) });
        } catch (e) {
            console.error('[CORSI] bulk:', e.message);
            res.status(500).json({ error: 'Impossibile salvare i contenuti.' });
        }
    });

    app.put('/api/auth/corsi/items/:id', authenticate, requireDocente, (req, res) => {
        try {
            const id = safeId(req.params.id);
            if (!id) return res.status(400).json({ error: 'Identificativo non valido.' });
            const manifest = readManifest();
            const result = applyItemUpdate(manifest, id, req.body || {}, req.user, { moveParent: true });
            if (result.error) return res.status(result.status).json({ error: result.error });
            writeManifest(manifest);
            if (result.previous) {
                notifyEditors(req, 'corsi_version_archived', 'Nuova versione corso archiviata',
                    `ha modificato «${result.title}» (${id}): la versione precedente è nello storico.`);
            }
            res.json({ success: true, id, type: result.type, manifest: publicNav(manifest) });
        } catch (e) {
            console.error('[CORSI] update:', e.message);
            res.status(500).json({ error: 'Impossibile aggiornare il modulo.' });
        }
    });

    app.delete('/api/auth/corsi/items/:id', authenticate, requireDocente, (req, res) => {
        try {
            const id = String(req.params.id || '');
            const manifest = readManifest();
            const found = findNode(manifest, id);
            if (!found) return res.status(404).json({ error: 'Elemento non trovato.' });

            if (found.node.type === 'divider') {
                found.siblings.splice(found.index, 1);
                writeManifest(manifest);
                return res.json({ success: true, manifest: publicNav(manifest) });
            }

            const nodes = collectContentNodes(found.node);
            nodes.forEach((node) => {
                const previous = readExistingSnapshot(node.id, node);
                if (previous) snapshotVersion({ ...previous, action: 'delete', user: req.user });
                const fp = mdPath(node.id);
                if (fs.existsSync(fp)) fs.unlinkSync(fp);
            });

            found.siblings.splice(found.index, 1);
            writeManifest(manifest);
            notifyEditors(req, 'corsi_module_deleted', 'Modulo corso eliminato',
                `ha eliminato «${found.node.title || id}» (${id}) e le relative sottosezioni dalla sidebar.`);
            res.json({ success: true, manifest: publicNav(manifest) });
        } catch (e) {
            console.error('[CORSI] delete:', e.message);
            res.status(500).json({ error: 'Impossibile eliminare il modulo.' });
        }
    });
}

module.exports = { mountCorsiRoutes, CORSI_DIR };
