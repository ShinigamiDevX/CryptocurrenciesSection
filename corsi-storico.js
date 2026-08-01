(function () {
    const API = '/api/auth/corsi/versions';

    let _allItems = [];
    let _filters = {
        q: '',
        action: '',
        itemId: '',
        sort: 'createdAt_desc',
    };

    function authHeaders() {
        return {
            Authorization: 'Bearer ' + localStorage.getItem('authToken'),
            'Content-Type': 'application/json',
        };
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function showConfirm(message, onOk, onCancel, okLabel) {
        const modal = document.getElementById('confirmModal');
        document.getElementById('confirmMsg').textContent = message;
        const ok = document.getElementById('confirmOk');
        const cancel = document.getElementById('confirmCancel');
        ok.textContent = okLabel || 'Elimina';
        modal.style.display = 'flex';
        function close() {
            modal.style.display = 'none';
            ok.onclick = null;
            cancel.onclick = null;
        }
        ok.onclick = () => { close(); if (onOk) onOk(); };
        cancel.onclick = () => { close(); if (onCancel) onCancel(); };
    }

    function formatWhen(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    }

    function actionLabel(action) {
        if (action === 'delete') return 'Eliminazione';
        if (action === 'update') return 'Modifica';
        return action || '—';
    }

    async function apiJson(url, options) {
        const res = await fetch(url, options);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Operazione non riuscita.');
        return data;
    }

    function currentVersionId() {
        const h = (location.hash || '').replace(/^#/, '');
        return h || '';
    }

    function uniqueItemIds(items) {
        const set = new Set();
        items.forEach((it) => { if (it.itemId) set.add(it.itemId); });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'it'));
    }

    function applyFilters(items) {
        let out = items.slice();
        const q = _filters.q.trim().toLowerCase();
        if (q) {
            out = out.filter((it) => {
                const hay = [
                    it.title, it.itemId, it.editedByEmail, it.kind, actionLabel(it.action),
                ].join(' ').toLowerCase();
                return hay.includes(q);
            });
        }
        if (_filters.action) {
            out = out.filter((it) => it.action === _filters.action);
        }
        if (_filters.itemId) {
            out = out.filter((it) => it.itemId === _filters.itemId);
        }
        const sort = _filters.sort || 'createdAt_desc';
        out.sort((a, b) => {
            switch (sort) {
                case 'createdAt_asc':
                    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
                case 'title_asc':
                    return String(a.title || a.itemId || '').localeCompare(String(b.title || b.itemId || ''), 'it');
                case 'title_desc':
                    return String(b.title || b.itemId || '').localeCompare(String(a.title || a.itemId || ''), 'it');
                case 'itemId_asc':
                    return String(a.itemId || '').localeCompare(String(b.itemId || ''), 'it');
                case 'itemId_desc':
                    return String(b.itemId || '').localeCompare(String(a.itemId || ''), 'it');
                case 'createdAt_desc':
                default:
                    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
            }
        });
        return out;
    }

    function filtersHtml(itemIds) {
        return `
            <div class="storico-filters" id="storicoFilters">
                <div class="storico-filter-row">
                    <label class="storico-field">
                        <span>Cerca</span>
                        <input type="search" id="filterQ" placeholder="Titolo, modulo, email…" value="${escapeHtml(_filters.q)}">
                    </label>
                    <label class="storico-field">
                        <span>Azione</span>
                        <select id="filterAction">
                            <option value="">Tutte</option>
                            <option value="update"${_filters.action === 'update' ? ' selected' : ''}>Modifica</option>
                            <option value="delete"${_filters.action === 'delete' ? ' selected' : ''}>Eliminazione</option>
                        </select>
                    </label>
                    <label class="storico-field">
                        <span>Modulo</span>
                        <select id="filterItemId">
                            <option value="">Tutti</option>
                            ${itemIds.map((id) => `
                                <option value="${escapeHtml(id)}"${_filters.itemId === id ? ' selected' : ''}>${escapeHtml(id)}</option>
                            `).join('')}
                        </select>
                    </label>
                    <label class="storico-field">
                        <span>Ordina per</span>
                        <select id="filterSort">
                            <option value="createdAt_desc"${_filters.sort === 'createdAt_desc' ? ' selected' : ''}>Data (più recenti)</option>
                            <option value="createdAt_asc"${_filters.sort === 'createdAt_asc' ? ' selected' : ''}>Data (più vecchie)</option>
                            <option value="title_asc"${_filters.sort === 'title_asc' ? ' selected' : ''}>Titolo A→Z</option>
                            <option value="title_desc"${_filters.sort === 'title_desc' ? ' selected' : ''}>Titolo Z→A</option>
                            <option value="itemId_asc"${_filters.sort === 'itemId_asc' ? ' selected' : ''}>Modulo A→Z</option>
                            <option value="itemId_desc"${_filters.sort === 'itemId_desc' ? ' selected' : ''}>Modulo Z→A</option>
                        </select>
                    </label>
                </div>
                <p class="editor-hint" id="filterCount"></p>
            </div>
        `;
    }

    function readFiltersFromDom() {
        _filters.q = document.getElementById('filterQ')?.value || '';
        _filters.action = document.getElementById('filterAction')?.value || '';
        _filters.itemId = document.getElementById('filterItemId')?.value || '';
        _filters.sort = document.getElementById('filterSort')?.value || 'createdAt_desc';
    }

    function wireFilters() {
        ['filterQ', 'filterAction', 'filterItemId', 'filterSort'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const evt = id === 'filterQ' ? 'input' : 'change';
            el.addEventListener(evt, () => {
                readFiltersFromDom();
                paintList();
            });
        });
    }

    function deleteVersion(id, label) {
        showConfirm(`Eliminare definitivamente questa versione dallo storico (${label})?`, async () => {
            try {
                await apiJson(API + '/' + encodeURIComponent(id), {
                    method: 'DELETE',
                    headers: authHeaders(),
                });
                _allItems = _allItems.filter((it) => it.id !== id);
                if (currentVersionId() === id) {
                    location.hash = '';
                    return;
                }
                paintList();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    function paintList() {
        const root = document.getElementById('contentRoot');
        const filtered = applyFilters(_allItems);
        const listEl = document.getElementById('versionList');
        const countEl = document.getElementById('filterCount');
        if (!listEl) {
            // full re-render shell
            root.innerHTML = `
                <h1 class="page-title">Storico versioni</h1>
                <p>Archivio delle versioni precedenti dei file Markdown. Usa i filtri per cercare e ordinare.</p>
                ${filtersHtml(uniqueItemIds(_allItems))}
                <ul class="manage-list" id="versionList"></ul>
            `;
            wireFilters();
            return paintList();
        }
        if (countEl) {
            countEl.textContent = filtered.length === _allItems.length
                ? `${filtered.length} versioni`
                : `${filtered.length} di ${_allItems.length} versioni`;
        }
        if (!filtered.length) {
            listEl.innerHTML = '<li><span class="meta">Nessuna versione corrisponde ai filtri.</span></li>';
            return;
        }
        listEl.innerHTML = filtered.map((it) => `
            <li>
                <div class="meta">
                    <strong>${escapeHtml(it.title || it.itemId)}</strong>
                    <small>
                        ${escapeHtml(it.itemId)} · ${escapeHtml(actionLabel(it.action))} ·
                        ${escapeHtml(formatWhen(it.createdAt))} ·
                        ${escapeHtml(it.editedByEmail || '—')}
                    </small>
                </div>
                <div class="actions">
                    <a class="btn-sm btn-primary" href="#${escapeHtml(it.id)}" style="color:#fff;text-decoration:none;">Apri</a>
                    <button type="button" class="btn-sm btn-danger" data-del="${escapeHtml(it.id)}" data-label="${escapeHtml(it.title || it.itemId)}">Elimina</button>
                </div>
            </li>
        `).join('');
        listEl.querySelectorAll('[data-del]').forEach((btn) => {
            btn.addEventListener('click', () => {
                deleteVersion(btn.getAttribute('data-del'), btn.getAttribute('data-label') || 'versione');
            });
        });
    }

    async function renderList() {
        const root = document.getElementById('contentRoot');
        root.className = 'page';
        root.innerHTML = '<h1 class="page-title">Storico versioni</h1><p>Caricamento...</p>';
        try {
            const data = await apiJson(API, { headers: authHeaders() });
            _allItems = data.items || [];
            if (!_allItems.length) {
                root.innerHTML = `
                    <h1 class="page-title">Storico versioni</h1>
                    <p>Nessuna versione archiviata. Le versioni precedenti vengono salvate automaticamente quando un docente o un Super Admin modifica o elimina un modulo Markdown.</p>
                `;
                return;
            }
            root.innerHTML = `
                <h1 class="page-title">Storico versioni</h1>
                <p>Archivio delle versioni precedenti dei file Markdown. Usa i filtri per cercare e ordinare.</p>
                ${filtersHtml(uniqueItemIds(_allItems))}
                <ul class="manage-list" id="versionList"></ul>
            `;
            wireFilters();
            paintList();
        } catch (err) {
            root.innerHTML = `<h1 class="page-title">Storico versioni</h1><p class="corsi-error">${escapeHtml(err.message)}</p>`;
        }
    }

    async function renderDetail(id) {
        const root = document.getElementById('contentRoot');
        root.className = 'page';
        root.innerHTML = '<h1 class="page-title">Versione</h1><p>Caricamento...</p>';
        try {
            const row = await apiJson(API + '/' + encodeURIComponent(id), { headers: authHeaders() });
            const preview = (typeof marked !== 'undefined' && marked.parse)
                ? marked.parse(row.content || '')
                : `<pre>${escapeHtml(row.content || '')}</pre>`;
            root.innerHTML = `
                <h1 class="page-title">${escapeHtml(row.title || row.itemId)}</h1>
                <p><a href="#">← Torna allo storico</a></p>
                <p class="editor-hint">
                    Modulo: <strong>${escapeHtml(row.itemId)}</strong> ·
                    Tipo: ${escapeHtml(row.kind)} ·
                    Azione: ${escapeHtml(actionLabel(row.action))} ·
                    ${escapeHtml(formatWhen(row.createdAt))} ·
                    ${escapeHtml(row.editedByEmail || '—')}
                </p>
                <div class="editor-actions">
                    <button type="button" class="btn-primary" id="btnRestore">Ripristina questa versione</button>
                    <button type="button" class="btn-danger" id="btnDeleteVersion">Elimina dallo storico</button>
                </div>
                <p id="restoreMsg" class="editor-hint"></p>
                <div class="editor-preview" style="display:block;">
                    <h2>Anteprima</h2>
                    <div>${preview}</div>
                </div>
                <h2>Markdown</h2>
                <pre><code>${escapeHtml(row.content || '')}</code></pre>
            `;
            document.getElementById('btnRestore').addEventListener('click', () => {
                showConfirm(
                    'Ripristinare questa versione come contenuto attuale del modulo? Lo stato corrente verrà archiviato nello storico.',
                    async () => {
                        const msg = document.getElementById('restoreMsg');
                        msg.textContent = 'Ripristino...';
                        msg.className = 'editor-hint';
                        try {
                            await apiJson(API + '/' + encodeURIComponent(id) + '/restore', {
                                method: 'POST',
                                headers: authHeaders(),
                                body: '{}',
                            });
                            msg.textContent = 'Versione ripristinata. Gli altri docenti e il Super Admin sono stati notificati.';
                            msg.className = 'editor-hint corsi-ok';
                        } catch (err) {
                            msg.textContent = err.message;
                            msg.className = 'editor-hint corsi-error';
                        }
                    },
                    null,
                    'Ripristina'
                );
            });
            document.getElementById('btnDeleteVersion').addEventListener('click', () => {
                deleteVersion(id, row.title || row.itemId);
            });
        } catch (err) {
            root.innerHTML = `<h1 class="page-title">Errore</h1><p class="corsi-error">${escapeHtml(err.message)}</p><p><a href="#">Torna allo storico</a></p>`;
        }
    }

    async function route() {
        const id = currentVersionId();
        if (id) await renderDetail(id);
        else await renderList();
    }

    async function initAuth() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.replace('/login');
            return false;
        }
        try {
            const res = await fetch('/api/auth/verify', {
                headers: { Authorization: 'Bearer ' + token },
            });
            if (!res.ok) throw new Error();
            const user = await res.json();
            const cards = Array.isArray(user.cards) ? user.cards : [];
            if (!cards.includes('corsi')) {
                window.location.replace('/portal');
                return false;
            }
            const canEdit = !!user.canManageCorsi || !!user.docente || user.role === 'superadmin';
            if (!canEdit) {
                window.location.replace('/corsi');
                return false;
            }
            document.getElementById('authOverlay').style.display = 'none';
            return true;
        } catch (_) {
            localStorage.removeItem('authToken');
            window.location.replace('/login');
            return false;
        }
    }

    async function boot() {
        const ok = await initAuth();
        if (!ok) return;
        window.addEventListener('hashchange', () => { route(); });
        await route();
    }

    boot();
})();
