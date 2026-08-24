(function () {
    const CHART_COLORS = [
        '#00C8FF', '#00E676', '#FFB84D', '#FF6B7A', '#A78BFA',
        '#5ABBC8', '#34D399', '#F472B6', '#60A5FA', '#FBBF24',
    ];

    let _files = [];
    let _charts = [];
    let _maps = [];

    function tokenOrEmpty() {
        return typeof getAuthToken === 'function' ? getAuthToken() : '';
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
            if (typeof clearAuth === 'function') clearAuth();
            window.location.replace('/login');
        });
    };

    function setStatus(text, type) {
        const el = document.getElementById('statusMsg');
        if (!text) { el.style.display = 'none'; return; }
        el.className = 'ar-status ' + (type || 'info');
        el.textContent = text;
        el.style.display = 'block';
    }

    function formatBytes(n) {
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function fmtNum(n) {
        if (n == null || Number.isNaN(n)) return '—';
        return Number(n).toLocaleString('it-IT', { maximumFractionDigits: 8 });
    }

    function badge(kind, label) {
        return `<span class="ar-badge ar-badge-${escapeHtml(kind)}">${escapeHtml(label)}</span>`;
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
                <span>${escapeHtml(f.name)} <span class="ar-file-meta">· ${formatBytes(f.size)}</span></span>
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
        const incoming = [...fileList];
        if (!incoming.length) return;
        if (incoming.length > 1) {
            setStatus('Puoi caricare un solo file. È stato usato il primo.', 'info');
        }
        const f = incoming[0];
        const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
        if (!allowed.includes(ext)) {
            setStatus('Formato non supportato: ' + f.name, 'error');
            return;
        }
        if (f.size > 25 * 1024 * 1024) {
            setStatus('File troppo grande (max 25 MB): ' + f.name, 'error');
            return;
        }
        _files = [f];
        renderFileList();
    }

    function destroyCharts() {
        _charts.forEach((c) => { try { c.destroy(); } catch (_) {} });
        _charts = [];
        _maps.forEach((m) => { try { m.remove(); } catch (_) {} });
        _maps = [];
    }

    function isLight() {
        return document.documentElement.classList.contains('light-theme');
    }

    function tickColor() {
        return isLight() ? '#8B5E00' : '#5ABBC8';
    }

    function renderCharts(charts, grid, prefix) {
        if (!grid) return;
        if (!charts || !charts.length) {
            grid.innerHTML = '';
            return;
        }
        grid.innerHTML = charts.map((_, i) => `
            <div class="ar-chart-box">
                <h4 id="${prefix}-title-${i}"></h4>
                <canvas id="${prefix}-canvas-${i}"></canvas>
            </div>
        `).join('');
        charts.forEach((ch, i) => {
            document.getElementById(prefix + '-title-' + i).textContent = ch.title || 'Grafico';
            const type = ch.type === 'histogram' ? 'bar' : (ch.type || 'bar');
            const colors = (ch.labels || []).map((_, idx) => CHART_COLORS[idx % CHART_COLORS.length]);
            const chart = new Chart(document.getElementById(prefix + '-canvas-' + i), {
                type,
                data: {
                    labels: ch.labels || [],
                    datasets: [{
                        label: ch.title || '',
                        data: ch.values || [],
                        backgroundColor: (type === 'pie' || type === 'doughnut') ? colors : 'rgba(0,200,255,0.55)',
                        borderColor: type === 'pie' ? colors : '#00C8FF',
                        borderWidth: 1.4,
                        fill: type === 'line',
                        tension: 0.25,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: type === 'pie',
                            labels: { color: tickColor(), boxWidth: 12 },
                        },
                    },
                    scales: type === 'pie' ? {} : {
                        x: { ticks: { color: tickColor(), maxRotation: 40 }, grid: { color: 'rgba(0,200,255,0.08)' } },
                        y: { beginAtZero: true, ticks: { color: tickColor() }, grid: { color: 'rgba(0,200,255,0.08)' } },
                    },
                },
            });
            _charts.push(chart);
        });
    }

    function kindLabel(kind) {
        return ({
            vpn: 'VPN',
            hosting: 'Hosting',
            residenziale: 'Residenziale',
            privato: 'Privato',
            sconosciuto: 'Sconosciuto',
        })[kind] || kind;
    }

    const KIND_COLOR = {
        vpn: '#FF6B7A',
        hosting: '#FFB84D',
        residenziale: '#00E676',
        sconosciuto: '#7ACCE0',
        privato: '#A78BFA',
    };

    function hasGeo(row) {
        return Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon));
    }

    function tileUrl() {
        return 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';
    }

    function renderIpMap(el, rows) {
        if (!el || typeof L === 'undefined') return;
        const points = (rows || []).filter(hasGeo);
        if (!points.length) return;
        const map = L.map(el, {
            scrollWheelZoom: false,
            worldCopyJump: false,
            minZoom: 1,
            maxZoom: 8,
            maxBounds: [[-85, -180], [85, 180]],
            maxBoundsViscosity: 1,
        });
        L.tileLayer(tileUrl(), {
            attribution: '&copy; OpenStreetMap, &copy; CARTO',
            subdomains: 'abcd',
            noWrap: true,
            bounds: [[-85, -180], [85, 180]],
        }).addTo(map);

        const seen = {};
        const latlngs = [];
        points.forEach((row) => {
            let lat = Number(row.lat);
            let lon = Number(row.lon);
            const key = lat.toFixed(3) + ',' + lon.toFixed(3);
            seen[key] = (seen[key] || 0) + 1;
            const n = seen[key] - 1;
            if (n) {
                lat += 0.22 * Math.sin(n * 1.1);
                lon += 0.22 * Math.cos(n * 1.1);
            }
            const color = KIND_COLOR[row.kind] || KIND_COLOR.sconosciuto;
            const marker = L.circleMarker([lat, lon], {
                radius: 8,
                color,
                weight: 2,
                fillColor: color,
                fillOpacity: 0.85,
            }).addTo(map);
            marker.bindPopup(
                '<strong>' + escapeHtml(row.ip) + '</strong><br>' +
                escapeHtml(kindLabel(row.kind)) +
                (row.country && row.country !== '—' ? '<br>' + escapeHtml(row.country) : '') +
                (row.city && row.city !== '—' ? '<br>' + escapeHtml(row.city) : '') +
                (row.isp && row.isp !== '—' ? '<br>' + escapeHtml(row.isp) : '')
            );
            latlngs.push([lat, lon]);
        });
        if (latlngs.length === 1) {
            map.setView(latlngs[0], 3);
        } else {
            map.fitBounds(L.latLngBounds(latlngs), { padding: [28, 28], maxZoom: 5 });
        }
        _maps.push(map);
        setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 80);
    }

    function fileReportHtml(entry, index, total) {
        const report = entry.report || {};
        const name = entry.name || ('File ' + (index + 1));
        const profile = report.profile || [];
        const tx = report.transactions || {};
        const sample = tx.sample || [];
        const ips = report.ips || {};
        const ipRows = ips.rows || [];
        const geoRows = ipRows.filter(hasGeo);
        const warnings = report.warnings || [];
        const inEntries = Object.entries(tx.in_total || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
        const outEntries = Object.entries(tx.out_total || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
        const flowList = (entries) => entries.length
            ? `<ul class="ar-flow-list">${entries.map(([asset, amount]) => `
                    <li>
                        <span class="ar-flow-asset" title="${escapeHtml(asset)}">${escapeHtml(asset || '—')}</span>
                        <span class="ar-flow-amount">${escapeHtml(fmtNum(amount))}</span>
                    </li>`).join('')}</ul>`
            : '<p class="ar-flow-empty">Nessun movimento</p>';
        const indexLabel = total > 1 ? `<span class="ar-file-index">File ${index + 1} di ${total}</span>` : '';
        const ex = report.exchange || {};
        const exBadge = ex.label
            ? `<span class="ar-exchange-badge">${escapeHtml(ex.label)}${ex.detected ? ' · auto' : ''}</span>`
            : '';
        return `
            <section class="ar-file-block" data-file="${escapeHtml(name)}">
                <header class="ar-file-head">${indexLabel}${exBadge}<h2>${escapeHtml(name)}</h2></header>
                <div class="ar-card">
                    <h3 class="ar-section-title">${escapeHtml(report.headline || 'Riassunto')}</h3>
                    <div class="ar-kpis">
                        ${(report.kpis || []).map((k) => `
                            <div class="ar-kpi"><span class="label">${escapeHtml(k.label)}</span><span class="value">${escapeHtml(k.value)}</span></div>
                        `).join('')}
                    </div>
                    <ul class="ar-bullets">${(report.bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
                </div>
                <div class="ar-charts" id="charts-${index}"></div>
                ${profile.length ? `
                <div class="ar-card">
                    <h3 class="ar-section-title">Profilo utente</h3>
                    <dl class="ar-dl">${profile.map((p) => `
                        <dt>${escapeHtml(p.label)}</dt><dd>${escapeHtml(p.value)}</dd>
                    `).join('')}</dl>
                </div>` : ''}
                ${tx.count ? `
                <div class="ar-card">
                    <h3 class="ar-section-title">Transazioni wallet</h3>
                    <div class="ar-flow">
                        <div class="ar-flow-col in">
                            <div class="ar-flow-head">
                                <span class="ar-flow-title">${badge('in', 'IN')} Entrata</span>
                                <span class="ar-flow-count">${inEntries.length} asset · ${tx.in_count || 0} tx</span>
                            </div>
                            ${flowList(inEntries)}
                        </div>
                        <div class="ar-flow-col out">
                            <div class="ar-flow-head">
                                <span class="ar-flow-title">${badge('out', 'OUT')} Uscita</span>
                                <span class="ar-flow-count">${outEntries.length} asset · ${tx.out_count || 0} tx</span>
                            </div>
                            ${flowList(outEntries)}
                        </div>
                    </div>
                    ${warnings.length ? `<ul class="ar-warnings">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : ''}
                    <div class="ar-table-wrap">
                        <table class="ar-table">
                            <thead><tr>
                                <th>Direzione</th><th>Importo</th><th>Asset</th><th>Data</th><th>Wallet</th><th>TxID</th>
                            </tr></thead>
                            <tbody>
                                ${sample.map((t) => `<tr>
                                    <td>${badge(t.direction === 'in' ? 'in' : 'out', t.direction === 'in' ? 'IN' : 'OUT')}</td>
                                    <td>${escapeHtml(fmtNum(t.amount))}</td>
                                    <td>${escapeHtml(t.asset || '—')}</td>
                                    <td>${escapeHtml(t.when || '—')}</td>
                                    <td>${escapeHtml(t.wallet || '—')}</td>
                                    <td>${escapeHtml(t.txid || '—')}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>` : warnings.length ? `
                <div class="ar-card">
                    <h3 class="ar-section-title">Transazioni wallet</h3>
                    <ul class="ar-warnings">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
                </div>` : ''}
                ${ipRows.length ? `
                <div class="ar-card">
                    <h3 class="ar-section-title">Indirizzi IP di accesso</h3>
                    <p style="color:#5ABBC8;font-size:0.82rem;margin:0 0 0.9rem;">Indicazione VPN/proxy/Tor/datacenter da ${escapeHtml(ips.provider || 'servizi di IP intelligence')}. È una stima, non una prova forense.</p>
                    ${geoRows.length ? `
                    <div class="ar-map-wrap">
                        <div class="ar-map" id="ip-map-${index}"></div>
                        <div class="ar-map-legend">
                            <span><i style="background:#FF6B7A"></i>VPN</span>
                            <span><i style="background:#FFB84D"></i>Hosting</span>
                            <span><i style="background:#00E676"></i>Residenziale</span>
                            <span><i style="background:#7ACCE0"></i>Sconosciuto</span>
                        </div>
                    </div>` : ''}
                    <div class="ar-table-wrap">
                        <table class="ar-table">
                            <thead><tr>
                                <th>IP</th><th>Tipo</th><th>Paese</th><th>ISP</th><th>Nota</th>
                            </tr></thead>
                            <tbody>
                                ${ipRows.map((r) => `<tr>
                                    <td>${escapeHtml(r.ip)}</td>
                                    <td>${badge(r.kind, kindLabel(r.kind))}</td>
                                    <td>${escapeHtml(r.country || '—')}</td>
                                    <td>${escapeHtml(r.isp || '—')}</td>
                                    <td>${escapeHtml(r.reason || '—')}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>` : ''}
            </section>
        `;
    }

    function renderFiles(files) {
        destroyCharts();
        const wrap = document.getElementById('resultsWrap');
        const host = document.getElementById('fileReports');
        wrap.style.display = 'block';
        const total = files.length;
        const overview = total > 1
            ? `<div class="ar-card ar-overview">Analizzati ${total} file. Ogni blocco sotto è il report di un singolo file.</div>`
            : '';
        host.innerHTML = overview + files.map((f, i) => fileReportHtml(f, i, total)).join('');
        files.forEach((f, i) => {
            renderCharts((f.report || {}).charts || [], document.getElementById('charts-' + i), 'c' + i);
            const rows = ((f.report || {}).ips || {}).rows || [];
            renderIpMap(document.getElementById('ip-map-' + i), rows);
        });
    }

    function askPassword(fileName, errorText) {
        const modal = document.getElementById('passwordModal');
        const input = document.getElementById('passwordInput');
        const err = document.getElementById('passwordError');
        const ok = document.getElementById('passwordOk');
        const cancel = document.getElementById('passwordCancel');
        document.getElementById('passwordFile').textContent = fileName || '';
        document.getElementById('passwordMsg').textContent = errorText
            ? 'Password non valida. Riprova.'
            : 'Questo file è protetto da password.';
        if (errorText) {
            err.textContent = errorText;
            err.hidden = false;
        } else {
            err.textContent = '';
            err.hidden = true;
        }
        input.value = '';
        modal.hidden = false;
        modal.style.display = 'flex';
        setTimeout(() => input.focus(), 30);
        return new Promise((resolve) => {
            function close(value) {
                modal.style.display = 'none';
                modal.hidden = true;
                ok.onclick = null;
                cancel.onclick = null;
                input.onkeydown = null;
                document.removeEventListener('keydown', onEsc);
                resolve(value);
            }
            function onEsc(e) {
                if (e.key === 'Escape') close(null);
            }
            function submit() {
                const v = input.value;
                if (!v) {
                    err.textContent = 'Inserisci la password.';
                    err.hidden = false;
                    input.focus();
                    return;
                }
                close(v);
            }
            ok.onclick = submit;
            cancel.onclick = () => close(null);
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                }
            };
            document.addEventListener('keydown', onEsc);
        });
    }

    async function analyze() {
        if (!_files.length) return;
        const btn = document.getElementById('btnAnalyze');
        btn.disabled = true;
        btn.textContent = 'Analisi in corso...';
        setStatus('Elaborazione file in corso…', 'info');
        document.getElementById('resultsWrap').style.display = 'none';
        destroyCharts();

        const passwords = {};
        try {
            while (true) {
                const form = new FormData();
                _files.forEach((f) => form.append('files', f, f.name));
                form.append('exchange', document.getElementById('exchange').value || 'auto');
                if (Object.keys(passwords).length) {
                    form.append('file_passwords', JSON.stringify(passwords));
                }
                const res = await fetch('/api/analisi/analyze', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + tokenOrEmpty() },
                    body: form,
                });
                let data = {};
                try { data = await res.json(); } catch (_) {}
                if (res.status === 401) {
                    if (typeof clearAuth === 'function') clearAuth();
                    window.location.replace('/login');
                    return;
                }
                const detail = data.detail;
                const code = detail && typeof detail === 'object' ? detail.code : '';
                if (res.status === 409 && code === 'password_required') {
                    const names = detail.files || [];
                    let cancelled = false;
                    for (const fname of names) {
                        const pw = await askPassword(fname);
                        if (pw === null) { cancelled = true; break; }
                        passwords[fname] = pw;
                    }
                    if (cancelled) {
                        setStatus('Analisi annullata: manca la password del file.', 'info');
                        return;
                    }
                    setStatus('Sblocco del file in corso…', 'info');
                    continue;
                }
                if (res.status === 400 && code === 'wrong_password') {
                    const fname = detail.file || '';
                    const pw = await askPassword(fname, detail.message || 'Password errata.');
                    if (pw === null) {
                        setStatus('Analisi annullata: manca la password del file.', 'info');
                        return;
                    }
                    passwords[fname] = pw;
                    setStatus('Sblocco del file in corso…', 'info');
                    continue;
                }
                if (!res.ok) {
                    let msg = 'Analisi fallita.';
                    if (typeof detail === 'string') msg = detail;
                    else if (detail?.message) msg = detail.message;
                    else if (detail?.errors?.length) msg = detail.errors.map((e) => e.file + ': ' + e.error).join(' · ');
                    setStatus(msg, 'error');
                    return;
                }
                const warn = (data.errors || []).map((e) => e.file + ': ' + e.error).join(' · ');
                setStatus(
                    warn ? 'Analisi completata con avvisi. ' + warn : 'Analisi completata.',
                    warn ? 'info' : 'success'
                );
                renderFiles(
                    (data.files && data.files.length)
                        ? data.files
                        : [{ name: 'Report', report: data.report || {} }]
                );
                break;
            }
        } catch (_) {
            setStatus('Errore di rete durante l\'analisi.', 'error');
        } finally {
            btn.disabled = !_files.length;
            btn.textContent = 'Analizza';
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
            if (user.role !== 'superadmin' && !cards.includes('analisi-report')) {
                window.location.replace('/portal');
                return;
            }
            document.getElementById('navUserEmail').textContent = user.email || '';
            document.getElementById('authOverlay').style.display = 'none';
            if (typeof initNavBell === 'function') initNavBell();
        } catch (_) {
            if (typeof clearAuth === 'function') clearAuth();
            window.location.replace('/login');
        }
    }

    function rgbaFromPixel(data) {
        return 'rgba(' + data[0] + ', ' + data[1] + ', ' + data[2] + ', ' + Math.max(data[3] / 255, 0.92) + ')';
    }

    function readBottomRightPixel(imageSrc) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                ctx.drawImage(img, 0, 0);
                const pixel = ctx.getImageData(canvas.width - 1, canvas.height - 1, 1, 1).data;
                resolve(rgbaFromPixel(pixel));
            };
            img.onerror = function () { resolve('rgba(6, 16, 32, 0.9)'); };
            img.src = imageSrc;
        });
    }

    function wireExchangeGrid() {
        const grid = document.getElementById('exchangeGrid');
        const hidden = document.getElementById('exchange');
        if (!grid || !hidden) return;
        const tiles = [...grid.querySelectorAll('.ar-exchange-tile')];
        tiles.forEach(async (tile) => {
            if (tile.dataset.img) {
                const bgColor = await readBottomRightPixel(tile.dataset.img);
                tile.style.setProperty('--tile-bg', bgColor);
            }
        });
        const select = (tile) => {
            tiles.forEach((t) => {
                t.classList.remove('selected');
                t.setAttribute('aria-selected', 'false');
            });
            tile.classList.add('selected');
            tile.setAttribute('aria-selected', 'true');
            hidden.value = tile.getAttribute('data-value') || 'auto';
        };
        tiles.forEach((tile) => {
            tile.addEventListener('click', () => select(tile));
            tile.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    select(tile);
                }
            });
        });
    }

    function wireUi() {
        wireExchangeGrid();
        const drop = document.getElementById('dropZone');
        const input = document.getElementById('fileInput');
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
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
        new MutationObserver(() => {
            _maps.forEach((map) => {
                map.eachLayer((layer) => {
                    if (layer instanceof L.TileLayer) map.removeLayer(layer);
                });
                L.tileLayer(tileUrl(), {
                    attribution: '&copy; OpenStreetMap, &copy; CARTO',
                    subdomains: 'abcd',
                    noWrap: true,
                    bounds: [[-85, -180], [85, 180]],
                }).addTo(map);
            });
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    initAuth();
    wireUi();
})();
