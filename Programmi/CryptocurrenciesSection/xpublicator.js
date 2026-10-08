(function () {
    let mode = 'derive';
    let lastCsv = '';

    function tokenOrEmpty() {
        return typeof getAuthToken === 'function' ? getAuthToken() : '';
    }
    function logout() {
        if (typeof clearAuth === 'function') clearAuth();
        window.location.replace('/login');
    }
    window.logout = logout;

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function setStatus(msg, kind) {
        const el = document.getElementById('statusMsg');
        el.style.display = msg ? '' : 'none';
        el.className = 'ar-status' + (kind ? ' ' + kind : '');
        el.textContent = msg || '';
    }

    function lines(id) {
        return document.getElementById(id).value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }

    function syncMode() {
        document.querySelectorAll('.xp-mode').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
        });
        document.getElementById('deriveOpts').style.display = (mode === 'derive' || mode === 'find') ? '' : 'none';
        document.getElementById('findWrap').style.display = mode === 'find' ? '' : 'none';
        const labels = { derive: 'Deriva', find: 'Cerca', convert: 'Converti', info: 'Leggi info' };
        document.getElementById('btnRun').textContent = labels[mode] || 'Esegui';
    }

    function downloadCsv() {
        if (!lastCsv) return;
        const blob = new Blob([lastCsv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'Xpublicator.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function renderRows(title, rows) {
        if (!rows.length) {
            return '<h3 class="ar-section-title">' + title + '</h3><p class="page-sub" style="margin:0;">Nessun risultato.</p>';
        }
        const body = rows.map((r) =>
            '<tr><td class="cs-mono">' + escapeHtml((r.xpub || '').slice(0, 18)) + '…</td><td>' +
            escapeHtml(r.path || '') + '</td><td>' + escapeHtml(r.type || '') +
            '</td><td class="cs-mono">' + escapeHtml(r.address || '') + '</td></tr>'
        ).join('');
        return '<h3 class="ar-section-title">' + title + ' (' + rows.length + ')</h3>' +
            '<div class="cs-dl"><a href="#" id="dlCsv">Scarica CSV</a></div>' +
            '<div class="ar-table-wrap"><table class="ar-table"><thead><tr>' +
            '<th>Chiave</th><th>Path</th><th>Tipo</th><th>Indirizzo</th></tr></thead><tbody>' +
            body + '</tbody></table></div>';
    }

    function renderResults(data) {
        const wrap = document.getElementById('resultsWrap');
        wrap.style.display = '';
        lastCsv = data.csv || '';
        if (data.mode === 'info') {
            wrap.innerHTML = (data.info || []).map((info) => {
                const ok = info.valid ? 'Chiave valida' : 'Checksum non valido';
                return '<div class="ar-card"><h3 class="ar-section-title">' + ok + '</h3>' +
                    '<p class="cs-mono" style="word-break:break-all;">' + escapeHtml(info.xpub) + '</p>' +
                    '<ul class="xp-info-list">' +
                    '<li><span>Profondità</span><code>' + escapeHtml(String(info.depth)) + '</code></li>' +
                    '<li><span>Fingerprint padre</span><code>' + escapeHtml(info.parent_fingerprint) + '</code></li>' +
                    '<li><span>Child number</span><code>' + escapeHtml(info.child_number) + '</code></li>' +
                    '<li><span>Chain code</span><code>' + escapeHtml(info.chain_code) + '</code></li>' +
                    '<li><span>Public key</span><code>' + escapeHtml(info.pubkey) + '</code></li>' +
                    '</ul></div>';
            }).join('');
            return;
        }
        if (data.mode === 'convert') {
            wrap.innerHTML = (data.converted || []).map((item) =>
                '<div class="ar-card"><p class="cs-mono" style="word-break:break-all;"><strong>&gt;</strong> ' +
                escapeHtml(item.xpub) + '</p><ul class="ar-bullets">' +
                (item.formats || []).map((f) => '<li class="cs-mono">' + escapeHtml(f) + '</li>').join('') +
                '</ul></div>'
            ).join('');
            return;
        }
        const title = data.mode === 'find' ? 'Path trovati' : 'Indirizzi derivati';
        wrap.innerHTML = '<div class="ar-card">' +
            '<div class="ar-kpis">' +
            '<div class="ar-kpi"><span class="label">Righe</span><span class="value">' + ((data.rows || []).length) + '</span></div>' +
            '<div class="ar-kpi"><span class="label">Nodi</span><span class="value">' + (data.nodes || 0) + '</span></div>' +
            '<div class="ar-kpi"><span class="label">Tempo</span><span class="value">' + (data.seconds || 0) + 's</span></div>' +
            '</div>' + renderRows(title, data.rows || []) + '</div>';
        const dl = document.getElementById('dlCsv');
        if (dl) dl.addEventListener('click', (e) => { e.preventDefault(); downloadCsv(); });
    }

    async function run() {
        const btn = document.getElementById('btnRun');
        btn.disabled = true;
        const prev = btn.textContent;
        btn.textContent = 'Elaborazione…';
        setStatus('Elaborazione sul server con il motore Xpublicator.', 'info');
        const addrtypes = Array.from(document.querySelectorAll('.addrType:checked')).map((el) => el.value);
        const body = {
            xpubs: lines('xpubInput'),
            path: document.getElementById('pathInput').value.trim() || 'x/0-10/0-20',
            addrtypes: addrtypes,
            alladdresses: document.getElementById('optAll').checked,
            noethchecksum: document.getElementById('optNoEth').checked,
            find: mode === 'find' ? lines('findInput') : [],
            convert: mode === 'convert',
            info: mode === 'info'
        };
        try {
            const res = await fetch('/api/xpublicator/run', {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer ' + tokenOrEmpty(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
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
            if (data.mode === 'find') {
                setStatus(data.found ? 'Path trovato.' : 'Nessun path per gli indirizzi indicati.', data.found ? 'success' : 'info');
            } else {
                setStatus('Operazione completata.', 'success');
            }
        } catch (_) {
            setStatus('Errore di rete durante l’operazione.', 'error');
        } finally {
            btn.textContent = prev;
            btn.disabled = false;
        }
    }

    async function initAuth() {
        const token = tokenOrEmpty();
        if (!token) { window.location.replace('/login'); return; }
        try {
            const res = await fetch('/api/auth/verify', { headers: { Authorization: 'Bearer ' + token } });
            if (!res.ok) throw new Error();
            const user = await res.json();
            const cards = Array.isArray(user.cards) ? user.cards : [];
            if (user.role !== 'superadmin' && !cards.includes('xpublicator') && !cards.includes('tools-europol')) {
                window.location.replace('/portal');
                return;
            }
            document.getElementById('navUserEmail').textContent = user.displayName || user.email || '';
            document.getElementById('authOverlay').style.display = 'none';
            if (typeof initNavBell === 'function') initNavBell();
            document.querySelectorAll('.xp-mode').forEach((btn) => {
                btn.addEventListener('click', () => {
                    mode = btn.getAttribute('data-mode');
                    syncMode();
                });
            });
            document.getElementById('btnRun').addEventListener('click', run);
            document.getElementById('btnClear').addEventListener('click', () => {
                document.getElementById('xpubInput').value = '';
                document.getElementById('findInput').value = '';
                document.getElementById('resultsWrap').style.display = 'none';
                setStatus('');
            });
            syncMode();
        } catch (_) {
            if (typeof clearAuth === 'function') clearAuth();
            window.location.replace('/login');
        }
    }

    initAuth();
})();
