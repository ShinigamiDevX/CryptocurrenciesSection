(function () {
    const MAX_TOTAL = 80 * 1024 * 1024;
    let files = [];
    let lastCsv = null;

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

    function renderList() {
        const ul = document.getElementById('fileList');
        ul.innerHTML = files.map((f, i) =>
            '<li><span>' + escapeHtml(f.name) + ' · ' + fmtSize(f.size) + '</span>' +
            '<button type="button" data-i="' + i + '">Rimuovi</button></li>'
        ).join('');
        ul.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                files.splice(Number(btn.getAttribute('data-i')), 1);
                renderList();
                syncBtns();
            });
        });
        syncBtns();
    }

    function syncBtns() {
        const empty = !files.length;
        document.getElementById('btnClear').disabled = empty;
        document.getElementById('btnScan').disabled = empty;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function addFiles(list) {
        const incoming = Array.from(list || []);
        let total = files.reduce((n, f) => n + f.size, 0);
        incoming.forEach((f) => {
            if (files.some((x) => x.name === f.name && x.size === f.size)) return;
            if (total + f.size > MAX_TOTAL) {
                setStatus('Superato il limite di 80 MB per caricamento.', 'error');
                return;
            }
            files.push(f);
            total += f.size;
        });
        renderList();
    }

    function downloadCsv(kind, text) {
        const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'CryptoScanner-' + kind + '.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function tableHtml(title, rows) {
        if (!rows.length) return '<h3 class="ar-section-title">' + title + '</h3><p class="page-sub" style="margin:0 0 1rem;">Nessun risultato.</p>';
        const body = rows.map((r) =>
            '<tr><td>' + escapeHtml(r.file) + '</td><td>' + r.offset + '</td><td>' +
            escapeHtml(r.type) + '</td><td class="cs-mono">' + escapeHtml(r.value) + '</td></tr>'
        ).join('');
        return '<h3 class="ar-section-title">' + title + ' (' + rows.length + ')</h3>' +
            '<div class="ar-table-wrap"><table class="ar-table"><thead><tr>' +
            '<th>File</th><th>Offset</th><th>Tipo</th><th>Valore</th></tr></thead><tbody>' +
            body + '</tbody></table></div>';
    }

    function renderResults(data) {
        const wrap = document.getElementById('resultsWrap');
        wrap.style.display = '';
        const st = data.stats || {};
        const skipped = (data.skipped || []).map((s) =>
            '<li>' + escapeHtml(s.file) + ' — ' + escapeHtml(s.reason) + '</li>'
        ).join('');
        wrap.innerHTML =
            '<div class="ar-card">' +
            '<div class="ar-kpis">' +
            '<div class="ar-kpi"><span class="label">File</span><span class="value">' + (st.files_examined || 0) + '</span></div>' +
            '<div class="ar-kpi"><span class="label">Indirizzi</span><span class="value">' + (st.matches || 0) + '</span></div>' +
            '<div class="ar-kpi"><span class="label">Seed</span><span class="value">' + (st.seeds || 0) + '</span></div>' +
            '<div class="ar-kpi"><span class="label">TX</span><span class="value">' + (st.transactions || 0) + '</span></div>' +
            '<div class="ar-kpi"><span class="label">Tempo</span><span class="value">' + (st.seconds || 0) + 's</span></div>' +
            '</div>' +
            '<div class="cs-dl">' +
            '<a href="#" id="dlAddr">CSV indirizzi</a>' +
            '<a href="#" id="dlSeeds">CSV seed</a>' +
            '<a href="#" id="dlTx">CSV transazioni</a>' +
            '</div>' +
            (skipped ? '<p class="cs-warn">File saltati</p><ul class="ar-bullets">' + skipped + '</ul>' : '') +
            tableHtml('Indirizzi e chiavi', data.addresses || []) +
            tableHtml('Seed phrase', data.seeds || []) +
            tableHtml('Hash di transazione', data.transactions || []) +
            '</div>';
        lastCsv = data.csv || {};
        document.getElementById('dlAddr').addEventListener('click', (e) => { e.preventDefault(); downloadCsv('addresses', lastCsv.addresses || ''); });
        document.getElementById('dlSeeds').addEventListener('click', (e) => { e.preventDefault(); downloadCsv('seeds', lastCsv.seeds || ''); });
        document.getElementById('dlTx').addEventListener('click', (e) => { e.preventDefault(); downloadCsv('tx', lastCsv.transactions || ''); });
    }

    async function runScan() {
        if (!files.length) return;
        const btn = document.getElementById('btnScan');
        btn.disabled = true;
        btn.textContent = 'Scansione…';
        setStatus('Scansione in corso sul server. I file restano isolati per questa sessione e vengono cancellati al termine.', 'info');
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f, f.name));
        fd.append('find_seeds', document.getElementById('optSeeds').checked ? '1' : '0');
        fd.append('find_tx', document.getElementById('optTx').checked ? '1' : '0');
        try {
            const res = await fetch('/api/cryptoscanner/scan', {
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
            renderResults(data);
            const n = (data.stats && (data.stats.matches + data.stats.seeds + data.stats.transactions)) || 0;
            setStatus(n ? 'Scansione completata.' : 'Scansione completata: nessun match.', n ? 'success' : 'info');
        } catch (_) {
            setStatus('Errore di rete durante la scansione.', 'error');
        } finally {
            btn.textContent = 'Avvia scansione';
            syncBtns();
        }
    }

    function wireDrop() {
        const zone = document.getElementById('dropZone');
        const input = document.getElementById('fileInput');
        input.addEventListener('change', () => addFiles(input.files));
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            addFiles(e.dataTransfer.files);
        });
        document.getElementById('btnClear').addEventListener('click', () => {
            files = [];
            input.value = '';
            renderList();
            document.getElementById('resultsWrap').style.display = 'none';
            setStatus('');
        });
        document.getElementById('btnScan').addEventListener('click', runScan);
    }

    async function initAuth() {
        const token = tokenOrEmpty();
        if (!token) { window.location.replace('/login'); return; }
        try {
            const res = await fetch('/api/auth/verify', { headers: { Authorization: 'Bearer ' + token } });
            if (!res.ok) throw new Error();
            const user = await res.json();
            const cards = Array.isArray(user.cards) ? user.cards : [];
            if (user.role !== 'superadmin' && !cards.includes('cryptoscanner') && !cards.includes('tools-europol')) {
                window.location.replace('/portal');
                return;
            }
            document.getElementById('navUserEmail').textContent = user.displayName || user.email || '';
            document.getElementById('authOverlay').style.display = 'none';
            if (typeof initNavBell === 'function') initNavBell();
            wireDrop();
        } catch (_) {
            if (typeof clearAuth === 'function') clearAuth();
            window.location.replace('/login');
        }
    }

    initAuth();
})();
