'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const JSZip = require('jszip');

const execFileAsync = promisify(execFile);
const CARD = 'seed-phrase';
const DEFAULT_TEMPLATE = path.join(__dirname, 'templates', 'SEED PHRASE.docx');
const DEFAULT_BIP39 = path.join(__dirname, 'templates', 'bip39words.json');

function xmlEscape(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function loadBip39Set(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const words = JSON.parse(raw);
    if (!Array.isArray(words)) throw new Error('Dizionario BIP39 non valido.');
    return new Set(words.map((w) => String(w).toLowerCase()));
}

function sdtPlainText(sdtXml) {
    const parts = [];
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let m;
    while ((m = re.exec(sdtXml))) parts.push(m[1]);
    return parts.join('');
}

/**
 * Sostituisce l'intero contenuto di un content control individuato dal testo placeholder
 * (anche se spezzato su più <w:t>, es. gg/mm/ + aaaa).
 */
function replaceSdtPlaceholder(xml, placeholder, value, opts = {}) {
    const re = /<w:sdt\b[^>]*>[\s\S]*?<\/w:sdt>/g;
    let hit = 0;
    const out = xml.replace(re, (block) => {
        if (hit) return block;
        if (sdtPlainText(block) !== placeholder) return block;
        hit += 1;

        const prMatch = block.match(/<w:sdtPr\b[^>]*>[\s\S]*?<\/w:sdtPr>/);
        if (!prMatch) return block;
        let sdtPr = prMatch[0];

        // Rimuove stato placeholder Word
        sdtPr = sdtPr.replace(/<w:placeholder\b[^>]*>[\s\S]*?<\/w:placeholder>/g, '');
        sdtPr = sdtPr.replace(/<w:showingPlcHdr\b[^>]*\/>/g, '');

        const rPrMatch = sdtPr.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/);
        let rPr = rPrMatch
            ? rPrMatch[0]
            : '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/></w:rPr>';

        if (opts.underline && !/<w:u[\s/>]/.test(rPr)) {
            rPr = rPr.replace(/<\/w:rPr>/, '<w:u w:val="single"/></w:rPr>');
        }
        if (opts.bold && !/<w:b[\s/>]/.test(rPr)) {
            rPr = rPr.replace(/<\/w:rPr>/, '<w:b/><w:bCs/></w:rPr>');
        }

        const content =
            `<w:sdtContent>` +
            `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r>` +
            `</w:sdtContent>`;

        return block
            .replace(/<w:sdtPr\b[^>]*>[\s\S]*?<\/w:sdtPr>/, sdtPr)
            .replace(/<w:sdtContent\b[^>]*>[\s\S]*?<\/w:sdtContent>/, content);
    });
    if (!hit) throw new Error(`Campo modello non trovato: ${placeholder}`);
    return out;
}

function fillWordCell(xml, wordNum, word) {
    const n = Number(wordNum);
    const re = new RegExp(`(<w:t[^>]*>)${n}\\. (</w:t>)`);
    let count = 0;
    const out = xml.replace(re, (full, a, b) => {
        count += 1;
        if (count > 1) return full;
        return `${a}${n}. ${xmlEscape(word)}${b}`;
    });
    if (!count) throw new Error(`Cella parola ${n} non trovata nel modello.`);
    return out;
}

async function buildFilledDocx(templatePath, data) {
    const buf = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(buf);
    let xml = await zip.file('word/document.xml').async('string');

    const start = Number(data.wordRangeStart) || 1;
    const words = Array.isArray(data.words) ? data.words : [];
    for (let i = 0; i < words.length; i += 1) {
        xml = fillWordCell(xml, start + i, words[i]);
    }

    xml = replaceSdtPlaceholder(xml, 'PASSPHRASE', data.passphrase || '', { underline: true, bold: true });
    xml = replaceSdtPlaceholder(xml, 'PIN', data.pin, { underline: true, bold: true });
    xml = replaceSdtPlaceholder(xml, 'COGNOME Nome', data.signer);
    xml = replaceSdtPlaceholder(xml, 'gg/mm/aaaa', data.dataIt);
    xml = replaceSdtPlaceholder(xml, 'hh:mm', data.ora);
    xml = replaceSdtPlaceholder(xml, 'Testo libero', data.testoLibero || '');
    xml = replaceSdtPlaceholder(xml, 'CODICE ALFANUMERICO', data.codice);

    zip.file('word/document.xml', xml);
    return zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });
}

async function convertWithLibreOffice(docxBuf) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-phrase-'));
    const inPath = path.join(tmpDir, 'seed-phrase.docx');
    const outPath = path.join(tmpDir, 'seed-phrase.pdf');
    fs.writeFileSync(inPath, docxBuf);

    const bins = ['soffice', 'libreoffice'];
    let lastErr = null;
    for (const bin of bins) {
        try {
            await execFileAsync(bin, [
                '--headless',
                '--nologo',
                '--nolockcheck',
                '--nodefault',
                '--norestore',
                '--convert-to', 'pdf',
                '--outdir', tmpDir,
                inPath,
            ], { timeout: 120000 });
            if (fs.existsSync(outPath)) {
                const pdf = fs.readFileSync(outPath);
                fs.rmSync(tmpDir, { recursive: true, force: true });
                return pdf;
            }
        } catch (e) {
            lastErr = e;
        }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw lastErr || new Error('LibreOffice non disponibile per la conversione PDF.');
}

async function convertWithGotenberg(docxBuf, gotenbergUrl) {
    const base = String(gotenbergUrl || '').replace(/\/$/, '');
    if (!base) throw new Error('GOTENBERG_URL non configurato.');

    const form = new FormData();
    form.append(
        'files',
        new Blob([docxBuf], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
        'seed-phrase.docx'
    );

    const res = await fetch(`${base}/forms/libreoffice/convert`, {
        method: 'POST',
        body: form,
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Conversione PDF fallita (${res.status}). ${detail.slice(0, 200)}`);
    }
    return Buffer.from(await res.arrayBuffer());
}

async function convertDocxToPdf(docxBuf) {
    const mode = String(process.env.SEED_PHRASE_CONVERT || 'auto').toLowerCase();
    const gotenbergUrl = process.env.GOTENBERG_URL || '';

    if (mode === 'gotenberg') return convertWithGotenberg(docxBuf, gotenbergUrl);
    if (mode === 'libreoffice') return convertWithLibreOffice(docxBuf);

    // auto: preferisci LibreOffice locale, poi Gotenberg
    try {
        return await convertWithLibreOffice(docxBuf);
    } catch (loErr) {
        if (!gotenbergUrl) throw loErr;
        try {
            return await convertWithGotenberg(docxBuf, gotenbergUrl);
        } catch (gErr) {
            throw new Error(
                `Conversione PDF non riuscita. LibreOffice: ${loErr.message}; Gotenberg: ${gErr.message}`
            );
        }
    }
}

function splitWordRanges(participants, total = 24) {
    const n = Math.max(1, Math.min(24, Math.floor(Number(participants) || 1)));
    const base = Math.floor(total / n);
    const rem = total % n;
    const ranges = [];
    let start = 1;
    for (let i = 0; i < n; i += 1) {
        const size = base + (i < rem ? 1 : 0);
        const end = start + size - 1;
        ranges.push({ start, end, size });
        start = end + 1;
    }
    return ranges;
}

function validatePayload(body, bip39Set) {
    const participants = Math.floor(Number(body.participants));
    if (!Number.isFinite(participants) || participants < 1 || participants > 24) {
        return { error: 'Il numero di partecipanti deve essere tra 1 e 24.' };
    }
    const ranges = splitWordRanges(participants);
    const wordRangeStart = Math.floor(Number(body.wordRangeStart));
    const range = ranges.find((r) => r.start === wordRangeStart);
    if (!range) {
        return { error: 'Intervallo di parole non valido per il numero di partecipanti scelto.' };
    }
    const words = Array.isArray(body.words) ? body.words.map((w) => String(w || '').trim().toLowerCase()) : [];
    if (words.length !== range.size) {
        return { error: `Servono esattamente ${range.size} parole (intervallo ${range.start}–${range.end}).` };
    }
    for (let i = 0; i < words.length; i += 1) {
        if (!words[i]) return { error: `Inserisci la parola ${range.start + i}.` };
        if (!bip39Set.has(words[i])) return { error: `Parola non valida (BIP39): «${words[i]}».` };
    }
    const pin = String(body.pin || '').trim();
    if (!pin) return { error: 'Inserisci il PIN.' };
    if (!/^\d{8}$/.test(pin)) return { error: 'Il PIN deve essere 8 cifre (formato ddmmaaaa).' };
    const dataIt = String(body.dataIt || '').trim();
    if (!dataIt) return { error: 'Inserisci la data di compilazione.' };
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dataIt)) return { error: 'Data non valida (usa gg/mm/aaaa).' };
    const ora = String(body.ora || '').trim();
    if (!ora) return { error: 'Inserisci l\'ora di compilazione.' };
    if (!/^\d{2}:\d{2}$/.test(ora)) return { error: 'Ora non valida (usa hh:mm).' };
    const testoLibero = String(body.testoLibero || '').trim();
    if (!testoLibero) return { error: 'Inserisci il comando / luogo.' };
    const codice = String(body.codice || '').trim().toUpperCase();
    if (!codice) return { error: 'Inserisci il codice alfanumerico della busta.' };
    const signer = String(body.signer || '').trim();
    if (!signer || signer === '—') return { error: 'Firmatario mancante: aggiorna nome e cognome nel profilo.' };
    return {
        ok: {
            participants,
            wordRangeStart: range.start,
            words,
            passphrase: String(body.passphrase || '').trim(), // opzionale
            pin,
            ora,
            dataIt,
            codice,
            signer,
            testoLibero,
        },
    };
}

function mountSeedPhraseRoutes(app, deps) {
    const {
        authenticate,
        userCanAccessCard,
        isAccountUsable,
        Users,
    } = deps;

    const templatePath = process.env.SEED_PHRASE_DOCX || DEFAULT_TEMPLATE;
    const bip39Path = process.env.SEED_PHRASE_BIP39 || DEFAULT_BIP39;

    let bip39Set = null;
    function getBip39() {
        if (!bip39Set) bip39Set = loadBip39Set(bip39Path);
        return bip39Set;
    }

    function requireSeedAccess(req, res, next) {
        const user = Users.findById(req.user.id);
        if (!isAccountUsable(user)) return res.status(401).json({ error: 'Sessione non valida.' });
        if (user.role === 'superadmin' || userCanAccessCard(user, CARD)) return next();
        return res.status(403).json({ error: 'Non hai accesso a Seed Phrase.' });
    }

    app.post('/api/auth/seed-phrase/generate', authenticate, requireSeedAccess, async (req, res) => {
        try {
            if (!fs.existsSync(templatePath)) {
                return res.status(500).json({ error: 'Modello DOCX non trovato sul server.' });
            }
            const checked = validatePayload(req.body || {}, getBip39());
            if (checked.error) return res.status(400).json({ error: checked.error });

            const docxBuf = await buildFilledDocx(templatePath, checked.ok);
            const pdfBuf = await convertDocxToPdf(docxBuf);

            const filename = `seed-phrase-${checked.ok.pin}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', String(pdfBuf.length));
            return res.send(pdfBuf);
        } catch (e) {
            console.error('[seed-phrase]', e);
            return res.status(500).json({ error: e.message || 'Errore generazione PDF.' });
        }
    });
}

module.exports = { mountSeedPhraseRoutes, buildFilledDocx, replaceSdtPlaceholder };
