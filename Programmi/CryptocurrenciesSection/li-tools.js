(function () {
    const MAX_TOTAL = 200 * 1024 * 1024;
    let mode = 'parser';
    let parserFiles = [];
    let pcapFile = null;

    function tokenOrEmpty() {
        return typeof getAuthToken === 'function' ? getAuthToken() : '';
    }
    function logout() {
        if (typeof clearAuth === 'function') clearAuth();
        window.location.replace('/login');
    }
    window.logout = logout;

    function setStatus(msg, kind) {
        const el = document.getElementById('statusMsg');
        el.style.display = msg ? '' : 'none';
        el.className = 'ar-status' + (kind ? ' ' + kind : '');
        el.textContent = msg || '';
    }

    function fmtSize(n) {
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function b64ToBlob(b64, mime) {
        const bin = atob(b64);
        const len = bin.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: mime || 'application/octet-stream' });
    }

    function downloadBase64(name, b64, mime) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b64ToBlob(b64, mime));
        a.download = name || 'download.bin';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function syncParserBtns() {
        const empty = !parserFiles.length;
        document.getElementById('btnClearParser').disabled = empty;
        document.getElementById('btnRunParser').disabled = empty;
    }

    function syncPcapBtns() {
        const empty = !pcapFile;
        document.getElementById('btnClearPcap').disabled = empty;
        document.getElementById('btnRunPcap').disabled = empty;
    }

    function renderParserList() {
        const ul = document.getElementById('fileListParser');
        ul.innerHTML = parserFiles.map((f, i) =>
            '<li><span>' + escapeHtml(f.name) + ' · ' + fmtSize(f.size) + '</span>' +
            '<button type="button" data-i="' + i + '">Rimuovi</button></li>'
        ).join('');
        ul.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                parserFiles.splice(Number(btn.getAttribute('data-i')), 1);
                renderParserList();
            });
        });
        syncParserBtns();
    }

    function renderPcapList() {
        const ul = document.getElementById('fileListPcap');
        if (!pcapFile) {
            ul.innerHTML = '';
        } else {
            ul.innerHTML = '<li><span>' + escapeHtml(pcapFile.name) + ' · ' + fmtSize(pcapFile.size) +
                '</span><button type="button" id="rmPcap">Rimuovi</button></li>';
            document.getElementById('rmPcap').addEventListener('click', (e) => {
                e.stopPropagation();
                pcapFile = null;
                document.getElementById('fileInputPcap').value = '';
                renderPcapList();
            });
        }
        syncPcapBtns();
    }

    function addParserFiles(list) {
        const incoming = Array.from(list || []);
        let total = parserFiles.reduce((n, f) => n + f.size, 0);
        incoming.forEach((f) => {
            if (parserFiles.some((x) => x.name === f.name && x.size === f.size)) return;
            if (total + f.size > MAX_TOTAL) {
                setStatus('Superato il limite di 200 MB per caricamento.', 'error');
                return;
            }
            parserFiles.push(f);
            total += f.size;
        });
        renderParserList();
    }

    function setPcapFile(list) {
        const f = Array.from(list || [])[0];
        if (!f) return;
        if (f.size > MAX_TOTAL) {
            setStatus('File oltre 200 MB.', 'error');
            return;
        }
        pcapFile = f;
        renderPcapList();
    }

    function setMode(next) {
        mode = next;
        document.querySelectorAll('#modeBar .xp-mode').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-mode') === next);
        });
        document.getElementById('panelParser').hidden = next !== 'parser';
        document.getElementById('panelPcap').hidden = next !== 'pcap';
        document.getElementById('resultsWrap').style.display = 'none';
        setStatus('');
    }

    function renderParserResults(data) {
        const wrap = document.getElementById('resultsWrap');
        wrap.style.display = '';
        const outs = (data.outputs || []).map((o) =>
            '<li>' + escapeHtml(o.name) + ' <span class="li-file-meta">(' + fmtSize(o.size) + ')</span></li>'
        ).join('');
        const previews = (data.previews || []).map((p) =>
            '<h3 class="ar-section-title">' + escapeHtml(p.name) + '</h3>' +
            '<pre class="li-preview">' + escapeHtml(p.content) + '</pre>'
        ).join('');
        wrap.innerHTML =
            '<div class="ar-card">' +
            '<div class="ar-kpis">' +
            '<div class="ar-kpi"><span class="label">Input</span><span class="value">' + (data.inputs || []).length + '</span></div>' +
            '<div class="ar-kpi"><span class="label">Output</span><span class="value">' + (data.outputs || []).length + '</span></div>' +
            '<div class="ar-kpi"><span class="label">Formato</span><span class="value">' + escapeHtml(data.format || '') + '</span></div>' +
            '</div>' +
            '<div class="cs-dl"><a href="#" id="dlParserZip">Scarica ZIP risultati</a></div>' +
            '<h3 class="ar-section-title">File generati</h3><ul class="ar-bullets">' + outs + '</ul>' +
            previews +
            '</div>';
        document.getElementById('dlParserZip').addEventListener('click', (e) => {
            e.preventDefault();
            downloadBase64(data.download_name || 'li-tools-parser-output.zip', data.download_base64, 'application/zip');
        });
    }

    function renderPcapResults(data) {
        const wrap = document.getElementById('resultsWrap');
        wrap.style.display = '';
        wrap.innerHTML =
            '<div class="ar-card">' +
            '<div class="ar-kpis">' +
            '<div class="ar-kpi"><span class="label">LIID</span><span class="value">' + escapeHtml(data.liid || '') + '</span></div>' +
            '<div class="ar-kpi"><span class="label">OPID</span><span class="value">' + escapeHtml(data.operator_id || '') + '</span></div>' +
            '<div class="ar-kpi"><span class="label">Size</span><span class="value">' + fmtSize(data.size || 0) + '</span></div>' +
            '</div>' +
            '<p class="page-sub" style="margin:0 0 1rem;">Output: <strong>' + escapeHtml(data.output || '') + '</strong> da ' +
            escapeHtml(data.input || '') + '</p>' +
            '<div class="cs-dl"><a href="#" id="dlHi3">Scarica file HI3</a></div>' +
            '</div>';
        document.getElementById('dlHi3').addEventListener('click', (e) => {
            e.preventDefault();
            downloadBase64(data.download_name || 'output.hi3', data.download_base64, 'application/octet-stream');
        });
    }

    async function runParser() {
        if (!parserFiles.length) return;
        const btn = document.getElementById('btnRunParser');
        btn.disabled = true;
        btn.textContent = 'Elaborazione…';
        setStatus('Parsing HI3 in corso. I file restano isolati e vengono cancellati al termine.', 'info');
        const fd = new FormData();
        parserFiles.forEach((f) => fd.append('files', f, f.name));
        fd.append('output_format', document.getElementById('parserFormat').value);
        try {
            const res = await fetch('/api/li-tools/parser', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + tokenOrEmpty() },
                body: fd
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg = Array.isArray(data.detail)
                    ? data.detail.map((d) => d.msg || d).join(' · ')
                    : (data.detail || data.error || ('Errore ' + res.status));
                setStatus(typeof msg === 'string' ? msg : 'Errore ' + res.status, 'error');
                return;
            }
            renderParserResults(data);
            setStatus('Parser completato.', 'success');
        } catch (_) {
            setStatus('Errore di rete durante il parsing.', 'error');
        } finally {
            btn.textContent = 'Esegui parser';
            syncParserBtns();
        }
    }

    async function runPcap() {
        if (!pcapFile) return;
        const btn = document.getElementById('btnRunPcap');
        btn.disabled = true;
        btn.textContent = 'Conversione…';
        setStatus('Conversione PCAP → HI3 in corso.', 'info');
        const fd = new FormData();
        fd.append('file', pcapFile, pcapFile.name);
        fd.append('liid', document.getElementById('liidInput').value.trim());
        fd.append('operator_id', document.getElementById('opidInput').value.trim());
        try {
            const res = await fetch('/api/li-tools/pcap-to-hi3', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + tokenOrEmpty() },
                body: fd
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg = Array.isArray(data.detail)
                    ? data.detail.map((d) => d.msg || d).join(' · ')
                    : (data.detail || data.error || ('Errore ' + res.status));
                setStatus(typeof msg === 'string' ? msg : 'Errore ' + res.status, 'error');
                return;
            }
            renderPcapResults(data);
            setStatus('Conversione completata.', 'success');
        } catch (_) {
            setStatus('Errore di rete durante la conversione.', 'error');
        } finally {
            btn.textContent = 'Converti in HI3';
            syncPcapBtns();
        }
    }

    function wireDrop(zoneId, inputId, onFiles) {
        const zone = document.getElementById(zoneId);
        const input = document.getElementById(inputId);
        input.addEventListener('change', () => onFiles(input.files));
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            onFiles(e.dataTransfer.files);
        });
    }

    function wireUi() {
        document.querySelectorAll('#modeBar .xp-mode').forEach((btn) => {
            btn.addEventListener('click', () => setMode(btn.getAttribute('data-mode')));
        });
        wireDrop('dropZoneParser', 'fileInputParser', addParserFiles);
        wireDrop('dropZonePcap', 'fileInputPcap', setPcapFile);
        document.getElementById('btnClearParser').addEventListener('click', () => {
            parserFiles = [];
            document.getElementById('fileInputParser').value = '';
            renderParserList();
            document.getElementById('resultsWrap').style.display = 'none';
            setStatus('');
        });
        document.getElementById('btnClearPcap').addEventListener('click', () => {
            pcapFile = null;
            document.getElementById('fileInputPcap').value = '';
            renderPcapList();
            document.getElementById('resultsWrap').style.display = 'none';
            setStatus('');
        });
        document.getElementById('btnRunParser').addEventListener('click', runParser);
        document.getElementById('btnRunPcap').addEventListener('click', runPcap);
    }

    async function initAuth() {
        const token = tokenOrEmpty();
        if (!token) { window.location.replace('/login'); return; }
        try {
            const res = await fetch('/api/auth/verify', { headers: { Authorization: 'Bearer ' + token } });
            if (!res.ok) throw new Error();
            const user = await res.json();
            const cards = Array.isArray(user.cards) ? user.cards : [];
            if (user.role !== 'superadmin' && !cards.includes('li-tools')) {
                window.location.replace('/portal');
                return;
            }
            document.getElementById('navUserEmail').textContent = user.displayName || user.email || '';
            document.getElementById('authOverlay').style.display = 'none';
            if (typeof initNavBell === 'function') initNavBell();
            wireUi();
        } catch (_) {
            if (typeof clearAuth === 'function') clearAuth();
            window.location.replace('/login');
        }
    }

    initAuth();
})();
