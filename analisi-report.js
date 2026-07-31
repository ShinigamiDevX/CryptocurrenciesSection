(function () {
    const CHART_COLORS = [
        '#00C8FF', '#00E676', '#FFB84D', '#FF6B7A', '#A78BFA',
        '#5ABBC8', '#34D399', '#F472B6', '#60A5FA', '#FBBF24',
    ];

    let _files = [];
    let _datasets = [];
    let _activeIdx = 0;
    let _charts = [];

    function authHeader() {
        return {
            Authorization: 'Bearer ' + localStorage.getItem('authToken'),
            'Content-Type': 'application/json',
        };
    }

    function showConfirm(message, onOk, onCancel) {
        const modal = document.getElementById('confirmModal');
        document.getElementById('confirmMsg').textContent = message;
        modal.style.display = 'flex';
        const ok = document.getElementById('confirmOk');
        const cancel = document.getElementById('confirmCancel');
        function close() {
            modal.style.display = 'none';
            ok.onclick = null;
            cancel.onclick = null;
        }
        ok.onclick = () => { close(); if (onOk) onOk(); };
        cancel.onclick = () => { close(); if (onCancel) onCancel(); };
    }

    window.logout = function logout() {
        showConfirm('Vuoi davvero disconnetterti dal portale?', () => {
            localStorage.removeItem('authToken');
            window.location.replace('/login');
        });
    };

    function setStatus(text, type) {
        const el = document.getElementById('statusMsg');
        if (!text) {
            el.style.display = 'none';
            return;
        }
        el.className = 'ar-status ' + (type || 'info');
        el.textContent = text;
        el.style.display = 'block';
    }

    function formatBytes(n) {
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function renderFileList() {
        const list = document.getElementById('fileList');
        const btnAnalyze = document.getElementById('btnAnalyze');
        const btnClear = document.getElementById('btnClear');
        if (!_files.length) {
            list.innerHTML = '';
            btnAnalyze.disabled = true;
            btnClear.disabled = true;
            return;
        }
        list.innerHTML = _files.map((f, i) => `
            <li>
                <span>${f.name} <span class="ar-file-meta">· ${formatBytes(f.size)}</span></span>
                <button type="button" data-remove="${i}">Rimuovi</button>
            </li>
        `).join('');
        list.querySelectorAll('[data-remove]').forEach((btn) => {
            btn.addEventListener('click', () => {
                _files.splice(Number(btn.getAttribute('data-remove')), 1);
                renderFileList();
            });
        });
        btnAnalyze.disabled = false;
        btnClear.disabled = false;
    }

    function addFiles(fileList) {
        const allowed = ['.csv', '.xlsx', '.xls', '.pdf'];
        for (const f of fileList) {
            const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
            if (!allowed.includes(ext)) {
                setStatus(`File ignorato (formato non supportato): ${f.name}`, 'error');
                continue;
            }
            if (f.size > 25 * 1024 * 1024) {
                setStatus(`File troppo grande (max 25 MB): ${f.name}`, 'error');
                continue;
            }
            if (_files.some((x) => x.name === f.name && x.size === f.size)) continue;
            _files.push(f);
        }
        renderFileList();
    }

    function destroyCharts() {
        _charts.forEach((c) => { try { c.destroy(); } catch (_) {} });
        _charts = [];
    }

    function chartColors(n) {
        const out = [];
        for (let i = 0; i < n; i++) out.push(CHART_COLORS[i % CHART_COLORS.length]);
        return out;
    }

    function renderDataset(idx) {
        _activeIdx = idx;
        const ds = _datasets[idx];
        if (!ds) return;

        document.querySelectorAll('.ar-tab').forEach((t, i) => {
            t.classList.toggle('active', i === idx);
        });

        const sheetLabel = ds.sheet ? ds.sheet : 'Dati';
        document.getElementById('datasetMeta').innerHTML = `
            <div class="ar-meta-item"><span class="label">File</span><span class="value" style="font-size:0.9rem;font-weight:600;">${escapeHtml(ds.source || '—')}</span></div>
            <div class="ar-meta-item"><span class="label">Foglio / Tabella</span><span class="value" style="font-size:0.9rem;font-weight:600;">${escapeHtml(sheetLabel)}</span></div>
            <div class="ar-meta-item"><span class="label">Righe</span><span class="value">${ds.summary?.rows ?? ds.rows ?? 0}</span></div>
            <div class="ar-meta-item"><span class="label">Colonne</span><span class="value">${ds.summary?.columns ?? (ds.columns || []).length}</span></div>
            <div class="ar-meta-item"><span class="label">Numeriche</span><span class="value">${ds.summary?.numeric_columns ?? '—'}</span></div>
            <div class="ar-meta-item"><span class="label">Categoriali</span><span class="value">${ds.summary?.categorical_columns ?? '—'}</span></div>
        `;

        const details = ds.columns_detail || [];
        const tableWrap = document.getElementById('columnsTableWrap');
        if (!details.length) {
            tableWrap.innerHTML = ds.error
                ? `<p style="color:#FF6B7A;font-size:0.88rem;">${escapeHtml(ds.error)}</p>`
                : '';
        } else {
            tableWrap.innerHTML = `
                <table class="ar-table">
                    <thead>
                        <tr>
                            <th>Colonna</th>
                            <th>Tipo</th>
                            <th>Unici</th>
                            <th>Null / vuoti</th>
                            <th>Dettaglio</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${details.map((c) => {
                            let detail = '—';
                            if (c.type === 'numeric' && c.stats) {
                                detail = `min ${fmtNum(c.stats.min)} · max ${fmtNum(c.stats.max)} · media ${fmtNum(c.stats.mean)}`;
                            } else if (c.type === 'categorical' && c.top_values?.length) {
                                detail = c.top_values.slice(0, 3).map((t) => `${t.value} (${t.count})`).join(', ');
                            }
                            return `<tr>
                                <td>${escapeHtml(c.name)}</td>
                                <td>${c.type === 'numeric' ? 'Numerica' : 'Categoriale'}</td>
                                <td>${c.unique}</td>
                                <td>${c.nulls}</td>
                                <td>${escapeHtml(detail)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }

        destroyCharts();
        const grid = document.getElementById('chartsGrid');
        const charts = ds.charts || [];
        if (!charts.length) {
            grid.innerHTML = '<p style="color:#5ABBC8;font-size:0.88rem;">Nessun grafico generabile per questo dataset.</p>';
            return;
        }
        grid.innerHTML = charts.map((_, i) => `
            <div class="ar-chart-box">
                <h4 id="chartTitle${i}"></h4>
                <canvas id="chartCanvas${i}"></canvas>
            </div>
        `).join('');

        charts.forEach((ch, i) => {
            document.getElementById('chartTitle' + i).textContent = ch.title || 'Grafico';
            const ctx = document.getElementById('chartCanvas' + i);
            const type = ch.type === 'histogram' ? 'bar' : (ch.type || 'bar');
            const colors = chartColors((ch.labels || []).length);
            const chart = new Chart(ctx, {
                type,
                data: {
                    labels: ch.labels || [],
                    datasets: [{
                        label: ch.title || '',
                        data: ch.values || [],
                        backgroundColor: type === 'pie' ? colors : 'rgba(0,200,255,0.55)',
                        borderColor: type === 'pie' ? colors.map(() => '#030E1C') : '#00C8FF',
                        borderWidth: type === 'pie' ? 1 : 1.5,
                        borderRadius: type === 'bar' ? 4 : 0,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: type === 'pie',
                            labels: { color: '#7ACCE0', boxWidth: 12 },
                        },
                    },
                    scales: type === 'pie' ? {} : {
                        x: {
                            ticks: { color: '#5ABBC8', maxRotation: 45, minRotation: 0 },
                            grid: { color: 'rgba(0,200,255,0.08)' },
                        },
                        y: {
                            beginAtZero: true,
                            ticks: { color: '#5ABBC8' },
                            grid: { color: 'rgba(0,200,255,0.08)' },
                        },
                    },
                },
            });
            _charts.push(chart);
        });
    }

    function renderResults(payload) {
        _datasets = payload.datasets || [];
        const wrap = document.getElementById('resultsWrap');
        const tabs = document.getElementById('datasetTabs');
        if (!_datasets.length) {
            wrap.style.display = 'none';
            return;
        }
        wrap.style.display = 'block';
        tabs.innerHTML = _datasets.map((ds, i) => {
            const label = ds.sheet
                ? `${shortName(ds.source)} · ${ds.sheet}`
                : shortName(ds.source);
            return `<button type="button" class="ar-tab${i === 0 ? ' active' : ''}" data-idx="${i}">${escapeHtml(label)}</button>`;
        }).join('');
        tabs.querySelectorAll('.ar-tab').forEach((btn) => {
            btn.addEventListener('click', () => renderDataset(Number(btn.getAttribute('data-idx'))));
        });
        renderDataset(0);
    }

    function shortName(name) {
        const s = String(name || 'file');
        return s.length > 28 ? s.slice(0, 25) + '…' : s;
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmtNum(n) {
        if (n == null || Number.isNaN(n)) return '—';
        const abs = Math.abs(n);
        if (abs >= 1000 || (abs > 0 && abs < 0.01)) return Number(n).toPrecision(4);
        return Number(n).toLocaleString('it-IT', { maximumFractionDigits: 3 });
    }

    async function analyze() {
        if (!_files.length) return;
        const btn = document.getElementById('btnAnalyze');
        btn.disabled = true;
        btn.textContent = 'Analisi in corso...';
        setStatus('Elaborazione file in corso…', 'info');
        document.getElementById('resultsWrap').style.display = 'none';
        destroyCharts();

        const form = new FormData();
        _files.forEach((f) => form.append('files', f, f.name));

        try {
            const res = await fetch('/api/analisi/analyze', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + localStorage.getItem('authToken') },
                body: form,
            });
            let data = {};
            try { data = await res.json(); } catch (_) {}

            if (!res.ok) {
                const detail = data.detail;
                let msg = 'Analisi fallita.';
                if (typeof detail === 'string') msg = detail;
                else if (detail?.message) msg = detail.message;
                else if (detail?.errors?.length) msg = detail.errors.map((e) => `${e.file}: ${e.error}`).join(' · ');
                else if (data.error) msg = data.error;
                setStatus(msg, 'error');
                return;
            }

            const warn = (data.errors || []).map((e) => `${e.file}: ${e.error}`).join(' · ');
            setStatus(
                warn
                    ? `Analisi completata con avvisi. ${warn}`
                    : `Analisi completata: ${data.count || (data.datasets || []).length} dataset.`,
                warn ? 'info' : 'success'
            );
            renderResults(data);
        } catch (_) {
            setStatus('Errore di rete durante l\'analisi.', 'error');
        } finally {
            btn.disabled = !_files.length;
            btn.textContent = 'Analizza';
        }
    }

    async function initAuth() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.replace('/login');
            return;
        }
        try {
            const res = await fetch('/api/auth/verify', {
                headers: { Authorization: 'Bearer ' + token },
            });
            if (!res.ok) throw new Error();
            const user = await res.json();
            const cards = Array.isArray(user.cards) ? user.cards : [];
            if (!cards.includes('analisi-report')) {
                window.location.replace('/portal');
                return;
            }
            document.getElementById('navUserEmail').textContent = user.email || '';
            document.getElementById('authOverlay').style.display = 'none';
            if (typeof initNavBell === 'function') initNavBell();
        } catch (_) {
            localStorage.removeItem('authToken');
            window.location.replace('/login');
        }
    }

    function wireUi() {
        const drop = document.getElementById('dropZone');
        const input = document.getElementById('fileInput');

        drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('dragover');
        });
        drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
        drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('dragover');
            if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
        });
        input.addEventListener('change', () => {
            if (input.files?.length) addFiles(input.files);
            input.value = '';
        });

        document.getElementById('btnClear').addEventListener('click', () => {
            _files = [];
            renderFileList();
            setStatus('');
            document.getElementById('resultsWrap').style.display = 'none';
            destroyCharts();
        });
        document.getElementById('btnAnalyze').addEventListener('click', analyze);
    }

    initAuth();
    wireUi();
})();
