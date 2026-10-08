'use strict';
const { v4: uuidv4 } = require('uuid');
const {
    Users,
    BibbiaExchanges,
    BibbiaContacts,
    BibbiaChangeRequests,
} = require('./db');
const { importBibbiaFromXlsxNode, tryAutoImportSeed } = require('./bibbia-import');

const BIBBIA_CARD = 'la-bibbia';

function mountBibbiaRoutes(app, deps) {
    const {
        authenticate,
        requireAdmin,
        userCanAccessCard,
        isAccountUsable,
        notifyAdmins,
        notifyUser,
        actorLabel,
    } = deps;

    tryAutoImportSeed();

    function requireBibbiaAccess(req, res, next) {
        const user = Users.findById(req.user.id);
        if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
        if (user.role === 'superadmin' || userCanAccessCard(user, BIBBIA_CARD)) return next();
        return res.status(403).json({ error: 'Non hai accesso a LA BIBBIA 3.1.' });
    }

    function canWriteBibbia(user) {
        return user && (user.role === 'user' || user.role === 'admin' || user.role === 'superadmin');
    }

    function canAdminBibbia(user) {
        return user && (user.role === 'admin' || user.role === 'superadmin');
    }

    function exchangeDto(ex) {
        if (!ex) return null;
        const logo = ex.logoKey
            ? (ex.logoKey.startsWith('/') ? ex.logoKey : `/immagini/${ex.logoKey}`)
            : '';
        return {
            id: ex.id,
            name: ex.name,
            website: ex.website || '',
            requestInfo: ex.requestInfo || '',
            notes: ex.notes || '',
            logoUrl: logo,
            sortOrder: ex.sortOrder || 0,
            createdAt: ex.createdAt,
            updatedAt: ex.updatedAt,
        };
    }

    function contactDto(c) {
        if (!c) return null;
        return {
            id: c.id,
            exchangeId: c.exchangeId,
            roleLabel: c.roleLabel || '',
            name: c.name || '',
            email: c.email || '',
            pec: c.pec || '',
            phone: c.phone || '',
            notes: c.notes || '',
            sortOrder: c.sortOrder || 0,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
        };
    }

    function sanitizeExchangeBody(body) {
        return {
            name: String(body.name || '').trim(),
            website: String(body.website || '').trim(),
            requestInfo: String(body.requestInfo || '').trim(),
            notes: String(body.notes || '').trim(),
            logoKey: String(body.logoKey || '').trim(),
            sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
        };
    }

    function sanitizeContactBody(body) {
        return {
            roleLabel: String(body.roleLabel || '').trim(),
            name: String(body.name || '').trim(),
            email: String(body.email || '').trim(),
            pec: String(body.pec || '').trim(),
            phone: String(body.phone || '').trim(),
            notes: String(body.notes || '').trim(),
            sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
        };
    }

    app.get('/api/auth/bibbia/bootstrap', authenticate, requireBibbiaAccess, (req, res) => {
        const user = Users.findById(req.user.id);
        const exchanges = BibbiaExchanges.all().map((ex) => ({
            ...exchangeDto(ex),
            contacts: BibbiaContacts.byExchange(ex.id).map(contactDto),
        }));
        res.json({
            exchanges,
            permissions: {
                canWrite: canWriteBibbia(user),
                canAdmin: canAdminBibbia(user),
                role: user.role,
            },
            pendingRequests: canAdminBibbia(user)
                ? BibbiaChangeRequests.findPending().map(formatRequest)
                : [],
        });
    });

    function formatRequest(r) {
        let payload = {};
        try { payload = JSON.parse(r.payload || '{}'); } catch { /* ignore */ }
        const ex = r.entityType === 'exchange' ? BibbiaExchanges.findById(r.entityId) : null;
        const contact = r.entityType === 'contact' ? BibbiaContacts.findById(r.entityId) : null;
        let exchange = ex;
        if (contact) exchange = BibbiaExchanges.findById(contact.exchangeId);
        return {
            id: r.id,
            entityType: r.entityType,
            entityId: r.entityId,
            action: r.action,
            payload,
            reason: r.reason || '',
            requestedByEmail: r.requestedByEmail,
            requestedAt: r.requestedAt,
            exchangeName: exchange ? exchange.name : '',
            entityLabel: r.entityType === 'exchange'
                ? (ex && ex.name) || r.entityId
                : [contact && contact.name, contact && contact.email].filter(Boolean).join(' · ') || r.entityId,
        };
    }

    app.post('/api/auth/bibbia/exchanges', authenticate, requireBibbiaAccess, (req, res) => {
        const user = Users.findById(req.user.id);
        if (!canWriteBibbia(user)) return res.status(403).json({ error: 'Permesso negato.' });
        const data = sanitizeExchangeBody(req.body || {});
        if (!data.name) return res.status(400).json({ error: 'Nome exchange obbligatorio.' });
        if (BibbiaExchanges.findByName(data.name)) {
            return res.status(409).json({ error: 'Exchange già presente.' });
        }
        const now = new Date().toISOString();
        const id = uuidv4();
        BibbiaExchanges.insert({
            id,
            ...data,
            createdAt: now,
            updatedAt: now,
            createdById: user.id,
            updatedById: user.id,
        });
        res.status(201).json({ exchange: { ...exchangeDto(BibbiaExchanges.findById(id)), contacts: [] } });
    });

    app.put('/api/auth/bibbia/exchanges/:id', authenticate, requireBibbiaAccess, (req, res) => {
        const user = Users.findById(req.user.id);
        if (!canAdminBibbia(user)) return res.status(403).json({ error: 'Solo gli admin possono modificare direttamente.' });
        const ex = BibbiaExchanges.findById(req.params.id);
        if (!ex) return res.status(404).json({ error: 'Exchange non trovato.' });
        const data = sanitizeExchangeBody(req.body || {});
        if (!data.name) return res.status(400).json({ error: 'Nome exchange obbligatorio.' });
        const other = BibbiaExchanges.findByName(data.name);
        if (other && other.id !== ex.id) return res.status(409).json({ error: 'Nome già usato da un altro exchange.' });
        const now = new Date().toISOString();
        BibbiaExchanges.update(ex.id, { ...data, updatedAt: now, updatedById: user.id });
        res.json({ exchange: exchangeDto(BibbiaExchanges.findById(ex.id)) });
    });

    app.delete('/api/auth/bibbia/exchanges/:id', authenticate, requireBibbiaAccess, (req, res) => {
        const user = Users.findById(req.user.id);
        if (!canAdminBibbia(user)) return res.status(403).json({ error: 'Solo gli admin possono eliminare.' });
        const ex = BibbiaExchanges.findById(req.params.id);
        if (!ex) return res.status(404).json({ error: 'Exchange non trovato.' });
        BibbiaExchanges.remove(ex.id);
        res.json({ success: true });
    });

    app.post('/api/auth/bibbia/exchanges/:id/contacts', authenticate, requireBibbiaAccess, (req, res) => {
        const user = Users.findById(req.user.id);
        if (!canWriteBibbia(user)) return res.status(403).json({ error: 'Permesso negato.' });
        const ex = BibbiaExchanges.findById(req.params.id);
        if (!ex) return res.status(404).json({ error: 'Exchange non trovato.' });
        const data = sanitizeContactBody(req.body || {});
        if (!data.name && !data.email && !data.phone) {
            return res.status(400).json({ error: 'Indica almeno nome, email o telefono.' });
        }
        const now = new Date().toISOString();
        const id = uuidv4();
        BibbiaContacts.insert({
            id,
            exchangeId: ex.id,
            ...data,
            sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
            createdAt: now,
            updatedAt: now,
            createdById: user.id,
            updatedById: user.id,
        });
        res.status(201).json({ contact: contactDto(BibbiaContacts.findById(id)) });
    });

    app.put('/api/auth/bibbia/contacts/:id', authenticate, requireBibbiaAccess, (req, res) => {
        const user = Users.findById(req.user.id);
        if (!canAdminBibbia(user)) return res.status(403).json({ error: 'Solo gli admin possono modificare direttamente.' });
        const contact = BibbiaContacts.findById(req.params.id);
        if (!contact) return res.status(404).json({ error: 'Contatto non trovato.' });
        const data = sanitizeContactBody(req.body || {});
        const now = new Date().toISOString();
        BibbiaContacts.update(contact.id, { ...data, updatedAt: now, updatedById: user.id });
        res.json({ contact: contactDto(BibbiaContacts.findById(contact.id)) });
    });

    app.delete('/api/auth/bibbia/contacts/:id', authenticate, requireBibbiaAccess, (req, res) => {
        const user = Users.findById(req.user.id);
        if (!canAdminBibbia(user)) return res.status(403).json({ error: 'Solo gli admin possono eliminare.' });
        const contact = BibbiaContacts.findById(req.params.id);
        if (!contact) return res.status(404).json({ error: 'Contatto non trovato.' });
        BibbiaContacts.remove(contact.id);
        res.json({ success: true });
    });

    app.post('/api/auth/bibbia/change-requests', authenticate, requireBibbiaAccess, (req, res) => {
        const user = Users.findById(req.user.id);
        if (!canWriteBibbia(user)) return res.status(403).json({ error: 'Permesso negato.' });
        if (canAdminBibbia(user)) {
            return res.status(400).json({ error: 'Gli admin applicano le modifiche direttamente.' });
        }
        const body = req.body || {};
        const entityType = body.entityType === 'contact' ? 'contact' : 'exchange';
        const action = body.action === 'delete' ? 'delete' : 'update';
        const entityId = String(body.entityId || '').trim();
        const reason = String(body.reason || '').trim();
        if (!entityId) return res.status(400).json({ error: 'Entità non valida.' });
        if (action === 'delete' && !reason) {
            return res.status(400).json({ error: 'Motivo obbligatorio per richiedere eliminazione.' });
        }
        if (entityType === 'exchange' && !BibbiaExchanges.findById(entityId)) {
            return res.status(404).json({ error: 'Exchange non trovato.' });
        }
        if (entityType === 'contact' && !BibbiaContacts.findById(entityId)) {
            return res.status(404).json({ error: 'Contatto non trovato.' });
        }
        if (BibbiaChangeRequests.findPendingForEntity(entityType, entityId, action)) {
            return res.status(409).json({ error: 'Esiste già una richiesta pendente per questa voce.' });
        }
        const payload = action === 'update' ? (body.payload || {}) : {};
        const id = uuidv4();
        BibbiaChangeRequests.insert({
            id,
            entityType,
            entityId,
            action,
            payload: JSON.stringify(payload),
            reason,
            requestedById: user.id,
            requestedByEmail: user.email || displayLogin(user),
            requestedAt: new Date().toISOString(),
        });
        const label = entityType === 'exchange' ? 'exchange' : 'contatto';
        notifyAdmins(
            'bibbia_change_request',
            'LA BIBBIA 3.1 — richiesta modifica',
            `${actorLabel(user)} ha richiesto ${action === 'delete' ? 'eliminazione' : 'modifica'} di un ${label}. Motivo: ${reason || '—'}`,
            '/la-bibbia#richieste',
            user.id
        );
        notifyUser(
            user.id,
            'bibbia_change_request_sent',
            'Richiesta inviata',
            `La tua richiesta su LA BIBBIA 3.1 è in attesa di approvazione admin.`,
            '/la-bibbia'
        );
        res.status(201).json({ success: true, id });
    });

    function displayLogin(user) {
        return user.username || user.email || 'utente';
    }

    app.get('/api/auth/bibbia/change-requests', authenticate, requireBibbiaAccess, requireAdmin, (req, res) => {
        res.json(BibbiaChangeRequests.findPending().map(formatRequest));
    });

    app.post('/api/auth/bibbia/change-requests/:id/approve', authenticate, requireBibbiaAccess, requireAdmin, (req, res) => {
        const r = BibbiaChangeRequests.findById(req.params.id);
        if (!r || r.status !== 'pending') return res.status(404).json({ error: 'Richiesta non trovata.' });
        const admin = Users.findById(req.user.id) || req.user;
        let payload = {};
        try { payload = JSON.parse(r.payload || '{}'); } catch { /* ignore */ }

        if (r.entityType === 'exchange') {
            const ex = BibbiaExchanges.findById(r.entityId);
            if (!ex) return res.status(409).json({ error: 'Exchange non più presente.' });
            if (r.action === 'delete') {
                BibbiaExchanges.remove(ex.id);
            } else {
                const data = sanitizeExchangeBody({ ...ex, ...payload });
                if (!data.name) return res.status(400).json({ error: 'Payload non valido.' });
                BibbiaExchanges.update(ex.id, {
                    ...data,
                    updatedAt: new Date().toISOString(),
                    updatedById: admin.id,
                });
            }
        } else {
            const contact = BibbiaContacts.findById(r.entityId);
            if (!contact) return res.status(409).json({ error: 'Contatto non più presente.' });
            if (r.action === 'delete') {
                BibbiaContacts.remove(contact.id);
            } else {
                const data = sanitizeContactBody({ ...contact, ...payload });
                BibbiaContacts.update(contact.id, {
                    ...data,
                    updatedAt: new Date().toISOString(),
                    updatedById: admin.id,
                });
            }
        }

        BibbiaChangeRequests.approve(r.id, admin.email || admin.username || 'admin');
        notifyUser(
            r.requestedById,
            'bibbia_change_approved',
            'Richiesta LA BIBBIA approvata',
            `Un admin ha approvato la tua richiesta (${r.action}) su ${formatRequest(r).entityLabel}.`,
            '/la-bibbia'
        );
        res.json({ success: true });
    });

    app.delete('/api/auth/bibbia/change-requests/:id', authenticate, requireBibbiaAccess, requireAdmin, (req, res) => {
        const r = BibbiaChangeRequests.findById(req.params.id);
        if (!r || r.status !== 'pending') return res.status(404).json({ error: 'Richiesta non trovata.' });
        const admin = Users.findById(req.user.id) || req.user;
        BibbiaChangeRequests.reject(r.id, admin.email || 'admin');
        notifyUser(
            r.requestedById,
            'bibbia_change_rejected',
            'Richiesta LA BIBBIA rifiutata',
            `${actorLabel(admin)} ha rifiutato la tua richiesta su ${formatRequest(r).entityLabel}.`,
            '/la-bibbia'
        );
        res.json({ success: true });
    });

    app.post('/api/auth/bibbia/import', authenticate, requireBibbiaAccess, requireAdmin, (req, res) => {
        const filePath = String((req.body || {}).path || '').trim();
        if (!filePath) return res.status(400).json({ error: 'Percorso file mancante.' });
        try {
            const result = importBibbiaFromXlsxNode(filePath, {
                replace: !!(req.body || {}).replace,
                actorId: req.user.id,
            });
            res.json({ success: true, ...result });
        } catch (err) {
            res.status(400).json({ error: err.message || 'Import fallito.' });
        }
    });
}

module.exports = { mountBibbiaRoutes, BIBBIA_CARD };
