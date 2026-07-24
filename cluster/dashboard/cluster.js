const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurazione Multer per upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'uploads'));
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Servi i file statici
app.use(express.static(path.join(__dirname, 'public')));
// Servi anche la cartella immagini dalla root del progetto
app.use('/immagini', express.static(path.join(__dirname, '../immagini')));

// Endpoint upload
const { exec } = require('child_process');

// ─── Reactor API – helper per il check "cluster too big" ───────────────────────
const REACTOR_TOKEN = '123e45ef8f45fdb6f83a25af557a753d151b7093bca86d9e197c92c33a2e6897';
const REACTOR_HOST  = 'reactor.chainalysis.com';
const REACTOR_ASSETS = ['BTC','ETH','BNB','TRX','MATIC','SOL','XRP','LTC','DOGE','TON','SUI','XLM','USDT','USDC'];

function reactorRequest(method, apiPath, body) {
    return new Promise((resolve) => {
        const bodyStr = body ? JSON.stringify(body) : null;
        const options = {
            hostname: REACTOR_HOST,
            path: apiPath,
            method,
            headers: { 'token': REACTOR_TOKEN, 'Content-Type': 'application/json' },
        };
        if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: null }); }
            });
        });
        req.on('error', () => resolve({ status: 0, body: null }));
        req.setTimeout(10000, () => { req.destroy(); resolve({ status: 0, body: null }); });
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function isClusterTooBig(address) {
    if (!address) return false;
    // Salta hash a 64 hex (tx hash, non wallet) e indirizzi EVM 0x...
    if (address.length === 64 && /^[0-9a-fA-F]{64}$/.test(address)) return false;
    if (/^0x[0-9a-fA-F]{40}$/i.test(address)) return false;
    try {
        const searchResp = await reactorRequest('POST', '/api/v2/search', {
            query: address, resultTypes: ['ADDRESS'], assets: REACTOR_ASSETS,
        });
        if (!searchResp.body || !Array.isArray(searchResp.body) || searchResp.body.length === 0) return false;
        const info = searchResp.body[0].info || {};
        // Indicatori diretti di dimensione cluster
        const directSize = info.clusterSize || info.addressCount || info.clusterAddressCount || 0;
        if (directSize > 100000) return true;
        // Prova a recuperare i dettagli dell'entità tramite ID
        const entityId = info.entityId || info.clusterId || (info.cluster && info.cluster.id);
        if (!entityId) return false;
        const entityResp = await reactorRequest('GET', `/api/v2/entities/${encodeURIComponent(entityId)}`);
        if (!entityResp.body) return false;
        const entitySize = entityResp.body.addressCount || entityResp.body.clusterSize || entityResp.body.clusterAddressCount || 0;
        return entitySize > 100000;
    } catch { return false; }
}
// ────────────────────────────────────────────────────────────────────────────────

// ─── Job Store per SSE progress ───────────────────────────────────────────────
const jobStore = new Map();

function emitJobProgress(jobId, data) {
    const job = jobStore.get(jobId);
    if (!job) return;
    job.lastEvent = data;
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of job.clients) {
        try { res.write(payload); } catch {}
    }
}

function finalizeJob(jobId) {
    const job = jobStore.get(jobId);
    if (!job) return;
    job.done = true;
    for (const res of job.clients) { try { res.end(); } catch {} }
    setTimeout(() => jobStore.delete(jobId), 5 * 60 * 1000);
}

// SSE: stream progresso elaborazione
app.get('/progress/:jobId', (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) return res.status(404).send('Job non trovato.');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    if (job.lastEvent) res.write(`data: ${JSON.stringify(job.lastEvent)}\n\n`);
    if (job.done) { res.end(); return; }
    job.clients.push(res);
    req.on('close', () => { job.clients = job.clients.filter(c => c !== res); });
});
// ──────────────────────────────────────────────────────────────────────────────

app.post('/upload', upload.single('xlsxfile'), (req, res) => {
    console.log('UPLOAD RICEVUTO');
    if (!req.file) return res.status(400).send('Nessun file caricato.');

    const exchange = req.body.exchange;
    const service = req.body.service || 'reactor';
    const password = req.body.password || '';
    const uploadedFile = path.join(__dirname, 'uploads', req.file.filename);
    const originalFilename = req.file.filename;

    let scriptName, downloadName;
    switch (exchange) {
        case 'Binance': scriptName = '../cluster_binance.py'; downloadName = 'cluster_binance.csv'; break;
        case 'Kucoin':  scriptName = '../cluster_kucoin.py';  downloadName = 'cluster_kucoin.csv';  break;
        case 'OKX':     scriptName = '../cluster_okx.py';     downloadName = 'cluster_okx.csv';     break;
        case 'Bitget':  scriptName = '../cluster_bitget.py';  downloadName = 'cluster_bitget.csv';  break;
        case 'Bybit':   scriptName = '../cluster_bybit.py';   downloadName = 'cluster_bybit.csv';   break;
        case 'Coinbase':
        default:        scriptName = '../cluster_coinbase.py'; downloadName = 'cluster_coinbase.csv'; break;
    }

    const outputCsv = path.join(__dirname, 'uploads', `${downloadName.split('.')[0]}_${Date.now()}.csv`);
    const clusterScript = path.resolve(__dirname, scriptName);
    const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    jobStore.set(jobId, { clients: [], lastEvent: null, done: false });

    res.status(200).json({ jobId });

    processUploadJob(jobId, { uploadedFile, originalFilename, exchange, service, password, outputCsv, clusterScript, downloadName })
        .catch(e => {
            console.error('[cluster.js] Errore processUploadJob:', e);
            emitJobProgress(jobId, { done: true, error: 'Errore interno: ' + e.message });
            finalizeJob(jobId);
        });
});

// Filtra righe di warning Python (openpyxl, pandas, ecc.) dallo stderr prima di mostrarle
function filterStderr(raw) {
    if (!raw) return '';
    return raw.split('\n')
        .filter(l => !/^\s*$/.test(l))
        .filter(l => !/UserWarning|FutureWarning|DeprecationWarning|RuntimeWarning/.test(l))
        .filter(l => !/^\s+warn\(/.test(l))
        .join('\n').trim();
}

async function processUploadJob(jobId, { uploadedFile, originalFilename, exchange, service, password, outputCsv, clusterScript, downloadName }) {
    const pythonPath = path.join(process.env.HOME, 'venv/bin/python');
    const command = `"${pythonPath}" "${clusterScript}" "${uploadedFile}" "${outputCsv}"`;
    const execEnv = { ...process.env };
    if (password) execEnv.EXCEL_PASSWORD = password;
    if (service === 'trm') execEnv.OUTPUT_SERVICE = 'trm';
    console.log('DEBUG: comando python =', command);

    emitJobProgress(jobId, { progress: 0, message: 'Avvio script Python...', phase: 'python' });

    const { error, stdout, stderr } = await new Promise(resolve => {
        exec(command, { cwd: path.dirname(clusterScript), env: execEnv, timeout: 300000 }, (err, out, serr) => {
            resolve({ error: err, stdout: out, stderr: serr });
        });
    });

    console.log('DEBUG: exec callback, error =', error);
    console.log('DEBUG: stdout =', stdout);
    console.log('DEBUG: stderr =', stderr);

    if (error) {
        if (stderr && stderr.includes('[PASSWORD_REQUIRED]')) {
            emitJobProgress(jobId, { done: true, requiresPassword: true, uploadedFile: originalFilename, exchange });
        } else if (stderr && stderr.includes('[PASSWORD_ERRATA]')) {
            emitJobProgress(jobId, { done: true, passwordError: true, uploadedFile: originalFilename, exchange });
        } else {
            const errMsg = filterStderr(stderr) || filterStderr(stdout) || 'Errore sconosciuto durante l\'elaborazione.';
            emitJobProgress(jobId, { done: true, error: 'Errore durante l\'elaborazione: ' + errMsg });
        }
        finalizeJob(jobId);
        return;
    }

    if (!fs.existsSync(outputCsv)) {
        const detail = filterStderr(stdout) || filterStderr(stderr) || 'Nessun dato trovato nel file caricato.';
        emitJobProgress(jobId, { done: true, error: detail });
        finalizeJob(jobId);
        return;
    }

    emitJobProgress(jobId, { progress: 40, message: 'Analisi CSV in corso...' });

    const assetsFile = outputCsv + '.assets.txt';
    let supportedAssets = [];
    if (fs.existsSync(assetsFile)) {
        supportedAssets = fs.readFileSync(assetsFile, 'utf-8').split(/\r?\n/).filter(x => x.trim());
    }
    const assetsDisplayFile = outputCsv + '.assets_display.txt';
    let supportedAssetsDisplay = supportedAssets;
    if (fs.existsSync(assetsDisplayFile)) {
        supportedAssetsDisplay = fs.readFileSync(assetsDisplayFile, 'utf-8').split(/\r?\n/).filter(x => x.trim());
    }
    const supportedAssetsList = supportedAssetsDisplay.join('\n');
    const csv = fs.readFileSync(outputCsv, 'utf-8');
    const lines = csv.split(/\r?\n/);
    const header = lines[0];
    const totalRows = lines.filter((l, i) => i > 0 && l.trim()).length;
    emitJobProgress(jobId, { progress: 40, message: 'Analisi CSV in corso...', phase: 'csv', totalRows });

    let warningRows = [];
    if (service !== 'trm') {
        const assetIdx = header.split(',').indexOf('Asset');
        for (let i = 1; i < lines.length; i++) {
            const row = lines[i];
            if (!row.trim()) continue;
            const cols = row.split(',');
            const asset = assetIdx >= 0 ? cols[assetIdx] : '';
            if (asset && !supportedAssets.includes(asset)) warningRows.push(row);
        }
    }

    // ── Check cluster troppo grandi (deposit address → Reactor search) ──────
    const typeIdx_  = header.split(',').indexOf('Type');
    const addrIdx_  = header.split(',').indexOf('Deposit Address or Hash');
    const clusterTooBigRows = [];
    const clusterTooBigSet  = new Set();
    {
        const candidates = [];
        for (let i = 1; i < lines.length; i++) {
            const row = lines[i];
            if (!row.trim()) continue;
            const cols = row.split(',');
            const type_ = typeIdx_ >= 0 ? cols[typeIdx_] : '';
            const addr_ = addrIdx_ >= 0 ? cols[addrIdx_] : '';
            if (type_ === 'deposit' && addr_ &&
                !(addr_.length === 64 && /^[0-9a-fA-F]{64}$/.test(addr_)) &&
                !(/^0x[0-9a-fA-F]{40}$/i.test(addr_)) &&
                !clusterTooBigSet.has(addr_)) {
                candidates.push({ addr: addr_, row });
                clusterTooBigSet.add(addr_); // dedup preventivo
            }
        }
        clusterTooBigSet.clear(); // reset: verrà riempito solo con i positivi
        if (candidates.length > 0) {
            emitJobProgress(jobId, { progress: 42, message: `Verifica ${candidates.length} indirizzi deposit...`, phase: 'cluster', clusterProcessed: 0, clusterTotal: candidates.length });
            const BATCH = 10;
            let processed = 0;
            for (let ci = 0; ci < candidates.length; ci += BATCH) {
                const batch = candidates.slice(ci, ci + BATCH);
                const results = await Promise.all(batch.map(c => isClusterTooBig(c.addr)));
                processed += batch.length;
                results.forEach((tooBig, j) => {
                    if (tooBig) {
                        clusterTooBigSet.add(batch[j].addr);
                        clusterTooBigRows.push(batch[j].row);
                    }
                });
                const batchPct = Math.round(42 + (Math.min(processed, candidates.length) / candidates.length) * 48);
                emitJobProgress(jobId, {
                    progress: batchPct,
                    message: `Verifica cluster: ${Math.min(processed, candidates.length)}/${candidates.length} indirizzi...`,
                    phase: 'cluster',
                    clusterProcessed: Math.min(processed, candidates.length),
                    clusterTotal: candidates.length
                });
            }
        } else {
            emitJobProgress(jobId, { progress: 90, message: 'Nessun indirizzo deposit da verificare.', phase: 'cluster', clusterProcessed: 0, clusterTotal: 0 });
        }
    }
    // CSV filtrato (senza le righe cluster-too-big) da inviare al client
    const filteredCsvLines = lines.filter((line, i) => {
        if (i === 0) return true;
        if (!line.trim()) return false;
        const cols = line.split(',');
        const addr_ = addrIdx_ >= 0 ? cols[addrIdx_] : '';
        return !clusterTooBigSet.has(addr_);
    });
    const filteredCsv = filteredCsvLines.join('\n');
    // ─────────────────────────────────────────────────────────────────────────

    emitJobProgress(jobId, { progress: 95, message: 'Preparazione risposta...', phase: 'response' });

    // Leggi eventuale file di warning prodotto dallo script Python
    const warningsFile = outputCsv.replace(/\.csv$/, '.warnings.txt');
    let pythonWarnings = '';
    if (fs.existsSync(warningsFile)) {
        pythonWarnings = fs.readFileSync(warningsFile, 'utf-8');
    }

    let warningMsg = '';
    let warningSections = [];
    // Asset non supportati
    if (warningRows.length > 0) {
        let html = '<section class="warning-section warning-section-unsupported">';
        html += '<div class="warning-section-title warning-section-title-unsupported">Asset non supportati da Reactor.Chainalysis</div>';
        html += '<ul class="warning-list-alt">';
        let alt = false;
        warningRows.forEach(r => {
            const cols = r.split(',');
            html += `<li class="warning-alt warning-entry-unsupported${alt ? ' alt' : ''}">${cols[0]}, ${cols[1]}, ${cols[2]}, ${cols[3]}</li>`;
            alt = !alt;
        });
        html += '</ul></section>';
        warningSections.push(html);
    }
    // Avvisi Python: raggruppa per motivazione
    if (pythonWarnings.trim().length > 0) {
        let wLines = pythonWarnings.split(/\r?\n/).filter(l => l.trim());
        let grouped = {};
        let currentTitle = null;
        const unsupportedMainnetTitle = 'Asset non supportati da Reactor.Chainalysis:';
        const tonMainnetTitle = 'TON Mainnet, ricerca manualmente inserendo il Tag/Memo';
        const internalExchangeTitle = "Counterparty ID valorizzato, probabile scambio interno all'exchange";
        const fiatTitle = 'Prelievo in fiat';
        const internalMovTitle = 'Probabile movimentazione interna';
        const counterpartyIdPattern = /^CounterParty ID valorizzato: '([^']+)'$/;
        wLines.forEach(line => {
            let htmlLine = line.replace(/asset/g, 'sent');
            let parsed = null;
            let motivo = null;
            try { parsed = JSON.parse(line); } catch (e) {}
            if (parsed && typeof parsed === 'object') {
                motivo = parsed['Motivo esclusione'] || 'Righe escluse dal file di output';
                const counterpartyIdMatch = motivo.match(counterpartyIdPattern);
                if (motivo === 'Mainnet non supportata da reactor.chainalysis') {
                    motivo = unsupportedMainnetTitle;
                } else if (motivo === tonMainnetTitle) {
                    // mantieni il titolo TON invariato
                } else if (counterpartyIdMatch) {
                    motivo = internalExchangeTitle;
                }
                const visibleFields = Object.entries(parsed).filter(([k]) => k !== 'Motivo esclusione');
                if (counterpartyIdMatch) {
                    visibleFields.unshift(['Counterparty ID', counterpartyIdMatch[1]]);
                }
                let fields = visibleFields
                    .map(([k, v], index) => {
                        const suffix = index === visibleFields.length - 1 ? '' : ';';
                        return `<div class="warning-field-row"><span class="warning-field-label">${k}:</span> <span class="warning-field-value">${v}</span>${suffix}</div>`;
                    })
                    .join('');
                if (!grouped[motivo]) grouped[motivo] = [];
                grouped[motivo].push(fields);
            } else if (/^Sono state escluse/.test(htmlLine) || /^Riga esclusa/.test(htmlLine) || /^! Attenzione/.test(htmlLine)) {
                currentTitle = htmlLine;
                if (!grouped[currentTitle]) grouped[currentTitle] = [];
            } else if (currentTitle) {
                grouped[currentTitle].push(htmlLine);
            }
        });
        Object.entries(grouped).forEach(([title, items]) => {
            if (items.length > 0) {
                const isUnsupportedMainnet = title === unsupportedMainnetTitle;
                const isTonMainnet = title === tonMainnetTitle;
                const isFiat = title === fiatTitle;
                const isInternalMov = title === internalMovTitle;
                const sectionClass = isUnsupportedMainnet ? 'warning-section warning-section-unsupported' : isTonMainnet ? 'warning-section warning-section-ton' : isFiat ? 'warning-section warning-section-fiat' : isInternalMov ? 'warning-section warning-section-internal' : 'warning-section warning-section-generic';
                const titleClass = isUnsupportedMainnet ? 'warning-section-title warning-section-title-unsupported' : isTonMainnet ? 'warning-section-title warning-section-title-ton' : isFiat ? 'warning-section-title warning-section-title-fiat' : isInternalMov ? 'warning-section-title warning-section-title-internal' : 'warning-section-title warning-section-title-generic';
                const entryClass = isUnsupportedMainnet ? 'warning-alt warning-entry-unsupported' : isTonMainnet ? 'warning-alt warning-entry-ton' : isFiat ? 'warning-alt warning-entry-fiat' : isInternalMov ? 'warning-alt warning-entry-internal' : 'warning-alt warning-entry-generic';
                let html = `<section class="${sectionClass}"><div class="${titleClass}">${title}</div><ul class="warning-list-alt">`;
                let localAlt = false;
                items.forEach(w => {
                    html += `<li class="${entryClass}${localAlt ? ' alt' : ''}">${w}</li>`;
                    localAlt = !localAlt;
                });
                html += '</ul></section>';
                warningSections.push(html);
            }
        });
    }
    // Sezione cluster troppo grandi
    if (clusterTooBigRows.length > 0) {
        let html = '<section class="warning-section warning-section-cluster">';
        html += '<div class="warning-section-title warning-section-title-cluster">Cluster Chainalysis troppo grande — verificare manualmente in Reactor</div>';
        html += '<ul class="warning-list-alt">';
        let alt = false;
        clusterTooBigRows.forEach(r => {
            const cols = r.split(',');
            html += `<li class="warning-alt warning-entry-cluster${alt ? ' alt' : ''}">${cols[0]}, ${cols[1]}, ${cols[2]}, ${cols[3]}</li>`;
            alt = !alt;
        });
        html += '</ul></section>';
        warningSections.push(html);
    }
    if (warningSections.length > 0) warningMsg += warningSections.join('');
    if (warningMsg.length > 0) {
        warningMsg += '<section class="warning-section warning-section-supported">';
        warningMsg += '<div class="warning-section-title warning-section-title-supported">Mainnet supportati da reactor.chainalysis</div>';
        warningMsg += `<pre class="warning-supported-list">${supportedAssetsList}</pre>`;
        warningMsg += '</section>';
    }

    if (warningMsg.length > 0) {
        emitJobProgress(jobId, { done: true, progress: 100, warning: warningMsg, csv: clusterTooBigRows.length > 0 ? filteredCsv : csv, filename: downloadName });
    } else {
        emitJobProgress(jobId, { done: true, progress: 100, csv, filename: downloadName });
    }
    finalizeJob(jobId);
}

// Endpoint per rielaborare un file già caricato con password
app.post('/reprocess-with-password', express.json(), (req, res) => {
    const { uploadedFile, exchange, password, service } = req.body;
    if (!uploadedFile || !exchange || !password) {
        return res.status(400).send('Parametri mancanti.');
    }
    const uploadedFilePath = path.join(__dirname, 'uploads', uploadedFile);
    if (!fs.existsSync(uploadedFilePath)) {
        return res.status(404).send('File non trovato. Ricaricare il file.');
    }
    let scriptName = '', downloadName = '';
    switch (exchange) {
        case 'Binance': scriptName = '../cluster_binance.py'; downloadName = 'cluster_binance.csv'; break;
        case 'Kucoin':  scriptName = '../cluster_kucoin.py';  downloadName = 'cluster_kucoin.csv';  break;
        case 'OKX':     scriptName = '../cluster_okx.py';     downloadName = 'cluster_okx.csv';     break;
        case 'Bitget':  scriptName = '../cluster_bitget.py';  downloadName = 'cluster_bitget.csv';  break;
        case 'Bybit':   scriptName = '../cluster_bybit.py';   downloadName = 'cluster_bybit.csv';   break;
        default:        scriptName = '../cluster_coinbase.py'; downloadName = 'cluster_coinbase.csv'; break;
    }
    const outputCsv = path.join(__dirname, 'uploads', `${downloadName.split('.')[0]}_${Date.now()}.csv`);
    const clusterScript = path.resolve(__dirname, scriptName);
    const pythonPath = path.join(process.env.HOME, 'venv/bin/python');
    const command = `"${pythonPath}" "${clusterScript}" "${uploadedFilePath}" "${outputCsv}"`;
    const execEnv = { ...process.env, EXCEL_PASSWORD: password };
    if (service === 'trm') execEnv.OUTPUT_SERVICE = 'trm';
    exec(command, { cwd: path.dirname(clusterScript), env: execEnv, timeout: 300000 }, (error, stdout, stderr) => {
        if (error) {
            if (stderr && stderr.includes('[PASSWORD_ERRATA]')) {
                return res.status(200).json({ passwordError: true, uploadedFile, exchange });
            }
            return res.status(500).send('Errore durante l\'elaborazione: ' + stderr);
        }
        if (fs.existsSync(outputCsv)) {
            res.download(outputCsv, downloadName, (err) => {
                if (err) res.status(500).send('Errore durante il download.');
            });
        } else {
            res.status(500).send((stdout || '').trim() || 'Nessun dato trovato nel file caricato.');
        }
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server HTTP in ascolto su http://0.0.0.0:${PORT}`);
});
