'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { BibbiaExchanges, BibbiaContacts } = require('./db');

function normHeader(h) {
    return String(h || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function cellStr(v) {
    if (v == null) return '';
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return String(v).trim();
}

function pickColumn(headers, aliases) {
    const map = new Map(headers.map((h, i) => [normHeader(h), i]));
    // Match esatto (preferenza massima)
    for (const a of aliases) {
        const i = map.get(normHeader(a));
        if (i != null) return i;
    }
    // Match per parola intera (evita "name" dentro "company name")
    for (const a of aliases) {
        const needle = normHeader(a);
        if (!needle) continue;
        for (const [key, i] of map) {
            const parts = key.split(/[^a-z0-9]+/).filter(Boolean);
            if (parts.includes(needle) || key === needle) return i;
        }
    }
    return -1;
}

const COL_EXCHANGE = [
    'company name', 'company', 'titolo',
    'exchange', 'nome exchange', 'piattaforma', 'nome piattaforma', 'exchange name', 'borsa', 'servizio',
];
const COL_NAME = [
    'contact name', 'nome contatto', 'contatto', 'referente', 'persona', 'nome', 'name',
];
const COL_ROLE = ['ruolo', 'role', 'ufficio', 'dipartimento', 'qualifica', 'area', 'tipo'];
const COL_EMAIL = ['contact email', 'email', 'e-mail', 'mail', 'indirizzo email'];
const COL_PEC = ['pec'];
const COL_PHONE = ['contact phone number', 'phone number', 'telefono', 'phone', 'tel', 'cellulare'];
const COL_WEB = ['sito', 'website', 'url', 'link'];
const COL_REQ = [
    "modalita'", 'modalita', 'modalita richiesta', 'richiesta', 'come richiedere',
    'procedure', 'note richiesta', 'freeze',
];
const COL_NOTES = ['note', 'notes', 'osservazioni', 'altro'];

function looksLikeHeaderRow(headers) {
    const joined = headers.map(normHeader).join(' | ');
    return /company|exchange|piattaforma|titolo|email|contatto|contact|modalita/.test(joined);
}

function isMetaSheetName(name) {
    const n = normHeader(name);
    return /^(indirizzi|modalita|modalita operative|sheet\d+)$/.test(n);
}

function normalizeExchangeKey(name) {
    return String(name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function findExchangeInCache(cache, exName) {
    const key = exName.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const norm = normalizeExchangeKey(exName);
    if (!norm) return null;
    for (const [k, ex] of cache) {
        const kn = normalizeExchangeKey(ex.name || k);
        if (!kn) continue;
        if (kn === norm || kn.includes(norm) || norm.includes(kn)) return ex;
    }
    return null;
}

function guessLogoKey(name) {
    const n = String(name || '').toLowerCase();
    const pairs = [
        ['binance', 'binance.jpg'], ['bitget', 'bitget.jpg'], ['bybit', 'bybit.png'],
        ['coinbase', 'coinbase.png'], ['kucoin', 'kucoin.png'], ['okx', 'OKX.png'],
        ['kraken', 'kraken.png'], ['gate', 'gate.io'], ['huobi', 'huobi'],
    ];
    for (const [k, v] of pairs) if (n.includes(k)) return v;
    return '';
}

function parseSheetRows(rows, defaultExchangeName) {
    if (!rows.length) return [];
    let start = 0;
    let headers = rows[0].map(cellStr);
    if (looksLikeHeaderRow(headers)) {
        start = 1;
    } else {
        headers = ['Exchange', 'Nome', 'Email', 'Telefono', 'Note'];
    }
    const idxEx = pickColumn(headers, COL_EXCHANGE);
    const idxName = pickColumn(headers, COL_NAME);
    const idxRole = pickColumn(headers, COL_ROLE);
    const idxEmail = pickColumn(headers, COL_EMAIL);
    const idxPec = pickColumn(headers, COL_PEC);
    const idxPhone = pickColumn(headers, COL_PHONE);
    const idxWeb = pickColumn(headers, COL_WEB);
    const idxReq = pickColumn(headers, COL_REQ);
    const idxNotes = pickColumn(headers, COL_NOTES);

    const out = [];
    let lastExchange = defaultExchangeName || '';
    for (let r = start; r < rows.length; r++) {
        const row = rows[r] || [];
        if (!row.some((c) => cellStr(c))) continue;
        let exchangeName = idxEx >= 0 ? cellStr(row[idxEx]) : '';
        if (exchangeName) lastExchange = exchangeName;
        else exchangeName = lastExchange;
        const contactName = idxName >= 0 ? cellStr(row[idxName]) : '';
        let email = idxEmail >= 0 ? cellStr(row[idxEmail]) : '';
        let pec = idxPec >= 0 ? cellStr(row[idxPec]) : '';
        // PEC spesso nella colonna email
        if (!pec && /@pec\./i.test(email)) {
            pec = email;
            email = '';
        }
        const phone = idxPhone >= 0 ? cellStr(row[idxPhone]) : '';
        const requestInfo = idxReq >= 0 ? cellStr(row[idxReq]) : '';
        const roleLabel = idxRole >= 0 ? cellStr(row[idxRole]) : '';
        if (!exchangeName && !contactName && !email && !pec && !phone && !requestInfo) continue;
        out.push({
            exchangeName: exchangeName || defaultExchangeName || 'Senza nome',
            website: idxWeb >= 0 ? cellStr(row[idxWeb]) : '',
            requestInfo,
            exchangeNotes: idxNotes >= 0 ? cellStr(row[idxNotes]) : '',
            roleLabel,
            name: contactName,
            email,
            pec,
            phone,
            notes: '',
        });
    }
    return out;
}

function importBibbiaFromXlsxNode(filePath, { replace = false, actorId = null } = {}) {
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) throw new Error(`File non trovato: ${abs}`);

    let XLSX;
    try {
        XLSX = require('xlsx');
    } catch {
        throw new Error('Installa la dipendenza xlsx nel servizio auth: npm install xlsx');
    }

    const wb = XLSX.readFile(abs, { cellDates: true });
    const parsed = [];
    for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const defaultEx = (sheetName && !isMetaSheetName(sheetName)) ? sheetName.trim() : '';
        parsed.push(...parseSheetRows(rows, defaultEx));
    }
    return applyBibbiaImport(parsed, { replace, actorId });
}

function applyBibbiaImport(entries, { replace = false, actorId = null } = {}) {
    const now = new Date().toISOString();
    let exchangesCreated = 0;
    let contactsCreated = 0;

    BibbiaExchanges.tx(() => {
        if (replace) {
            const all = BibbiaExchanges.all();
            all.forEach((ex) => BibbiaExchanges.remove(ex.id));
        }
        const cache = new Map();
        for (const row of entries) {
            const exName = String(row.exchangeName || '').trim();
            if (!exName) continue;
            let ex = findExchangeInCache(cache, exName) || BibbiaExchanges.findByName(exName);
            if (!ex) {
                // match fuzzy anche sul DB già presente
                const all = BibbiaExchanges.all();
                const norm = normalizeExchangeKey(exName);
                ex = all.find((e) => {
                    const kn = normalizeExchangeKey(e.name);
                    return kn === norm || kn.includes(norm) || norm.includes(kn);
                }) || null;
                if (ex) cache.set(exName.toLowerCase(), ex);
            }
            if (!ex) {
                const id = crypto.randomUUID();
                ex = {
                    id,
                    name: exName,
                    website: row.website || '',
                    requestInfo: row.requestInfo || '',
                    notes: row.exchangeNotes || '',
                    logoKey: guessLogoKey(exName),
                    sortOrder: cache.size,
                    createdAt: now,
                    updatedAt: now,
                    createdById: actorId,
                    updatedById: actorId,
                };
                BibbiaExchanges.insert(ex);
                cache.set(exName.toLowerCase(), ex);
                exchangesCreated += 1;
            } else {
                const website = ex.website || row.website || '';
                const requestInfo = row.requestInfo || ex.requestInfo || '';
                const notes = ex.notes || row.exchangeNotes || '';
                const logoKey = ex.logoKey || guessLogoKey(exName);
                if (website !== (ex.website || '')
                    || requestInfo !== (ex.requestInfo || '')
                    || notes !== (ex.notes || '')
                    || logoKey !== (ex.logoKey || '')) {
                    BibbiaExchanges.update(ex.id, {
                        name: ex.name,
                        website,
                        requestInfo,
                        notes,
                        logoKey,
                        sortOrder: ex.sortOrder,
                        updatedAt: now,
                        updatedById: actorId,
                    });
                    ex = { ...ex, website, requestInfo, notes, logoKey };
                    cache.set(exName.toLowerCase(), ex);
                }
            }
            const hasContact = !!(row.name || row.email || row.phone || row.pec);
            if (!hasContact) continue;
            BibbiaContacts.insert({
                id: crypto.randomUUID(),
                exchangeId: ex.id,
                roleLabel: row.roleLabel || '',
                name: row.name || '',
                email: row.email || '',
                pec: row.pec || '',
                phone: row.phone || '',
                notes: row.notes || '',
                sortOrder: BibbiaContacts.byExchange(ex.id).length,
                createdAt: now,
                updatedAt: now,
                createdById: actorId,
                updatedById: actorId,
            });
            contactsCreated += 1;
        }
    })();

    return { exchangesCreated, contactsCreated, totalRows: entries.length };
}

function tryAutoImportSeed() {
    const candidates = [
        path.join(__dirname, 'data', 'la-bibbia-seed.xlsx'),
        path.join(__dirname, 'data', 'LA BIBBIA 3.0 Richieste Exchange.xlsx'),
    ];
    if (BibbiaExchanges.count() > 0) return null;
    for (const p of candidates) {
        if (!fs.existsSync(p)) continue;
        try {
            const result = importBibbiaFromXlsxNode(p, { replace: true, actorId: null });
            console.log('[BIBBIA] Import seed da', p, result);
            return result;
        } catch (err) {
            console.warn('[BIBBIA] Import seed fallito:', err.message);
        }
    }
    return null;
}

module.exports = {
    importBibbiaFromXlsxNode,
    applyBibbiaImport,
    tryAutoImportSeed,
};
