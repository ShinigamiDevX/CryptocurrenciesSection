/**
 * Campanella notifiche condivisa (tutti gli utenti autenticati).
 * Richiede nel DOM: #navBellWrap, #navBellBtn, #navBellBadge, #navBellPanel, #navBellList
 * Opzionale: #navBellMarkAll, #navBellFullscreen
 */
(function (global) {
    let _fullscreen = false;
    let _bellItems = [];
    let _bellSelecting = false;
    const _bellSelected = new Set();
    /** @type {{ items: object[], holdTimer: any, fadeTimer: any, fading: boolean } | null} */
    let _bellUndo = null;
    const BELL_UNDO_HOLD_MS = 5000;
    const BELL_UNDO_FADE_MS = 2800;

    function authHeader(extra) {
        if (typeof global.authHeader === 'function') return global.authHeader(extra);
        const token = (typeof getAuthToken === 'function')
            ? getAuthToken()
            : (localStorage.getItem('authToken') || '');
        return Object.assign({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, extra || {});
    }

    function positionNavBellPanel() {
        const btn = document.getElementById('navBellBtn');
        const panel = document.getElementById('navBellPanel');
        if (!btn || !panel || _fullscreen) return;
        const r = btn.getBoundingClientRect();
        const width = Math.min(360, window.innerWidth - 16);
        let left = r.right - width;
        if (left < 8) left = 8;
        panel.style.top = r.bottom + 10 + 'px';
        panel.style.left = left + 'px';
        panel.style.right = 'auto';
        panel.style.width = width + 'px';
        panel.style.bottom = 'auto';
        panel.style.height = '';
        panel.style.maxHeight = '';
    }

    function applyFullscreenStyles(on) {
        const panel = document.getElementById('navBellPanel');
        const btnFs = document.getElementById('navBellFullscreen');
        if (!panel) return;
        _fullscreen = !!on;
        panel.classList.toggle('nav-bell-fullscreen', _fullscreen);
        if (_fullscreen) {
            panel.style.top = '0';
            panel.style.left = '0';
            panel.style.right = '0';
            panel.style.bottom = '0';
            panel.style.width = '100%';
            panel.style.height = '100%';
            panel.style.maxHeight = '100%';
            panel.style.borderRadius = '0';
        } else {
            panel.style.borderRadius = '';
            panel.style.height = '';
            panel.style.maxHeight = '';
            positionNavBellPanel();
        }
        if (btnFs) {
            btnFs.textContent = _fullscreen ? 'Riduci' : 'Schermo intero';
            btnFs.title = _fullscreen ? 'Esci da schermo intero' : 'Vedi a schermo intero';
            btnFs.setAttribute('aria-pressed', _fullscreen ? 'true' : 'false');
        }
    }

    function closeNavBell() {
        const panel = document.getElementById('navBellPanel');
        const btn = document.getElementById('navBellBtn');
        closeBellDetail();
        exitBellSelect();
        applyFullscreenStyles(false);
        if (panel) {
            panel.classList.remove('open');
            panel.hidden = true;
        }
        if (btn) btn.classList.remove('open');
    }

    function setUnreadBadge(count) {
        const badge = document.getElementById('navBellBadge');
        const btn = document.getElementById('navBellBtn');
        if (!badge || !btn) return;
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : String(count);
            badge.hidden = false;
            badge.classList.add('visible');
            btn.classList.add('has-alerts');
        } else {
            badge.hidden = true;
            badge.classList.remove('visible');
            btn.classList.remove('has-alerts');
        }
    }

    function recalcBellBadge() {
        const pending = _bellUndo ? new Set(_bellUndo.items.map((n) => String(n.id))) : null;
        const unread = _bellItems.filter((n) => {
            if (pending && pending.has(String(n.id))) return false;
            return !n.read;
        }).length;
        setUnreadBadge(unread);
    }

    function visibleBellItems() {
        const pending = _bellUndo ? new Set(_bellUndo.items.map((n) => String(n.id))) : null;
        return _bellItems.filter((n) => !(pending && pending.has(String(n.id))));
    }

    function parseNotifParts(n) {
        const raw = String((n && n.body) || '').trim();
        let actor = '';
        let topic = '';
        let detail = raw;
        try {
            const j = JSON.parse(raw);
            if (j && typeof j === 'object' && Number(j.v) === 1) {
                return {
                    actor: String(j.actor || '').trim(),
                    topic: String(j.topic || '').trim(),
                    detail: String(j.detail || '').trim(),
                };
            }
        } catch { /* testo libero */ }
        if ((n && n.type) === 'idea') {
            const nl = raw.indexOf('\n');
            const first = nl === -1 ? raw : raw.slice(0, nl);
            detail = nl === -1 ? '' : raw.slice(nl + 1).trim();
            const sep = first.indexOf(' · ');
            if (sep >= 0) {
                actor = first.slice(0, sep).trim();
                topic = first.slice(sep + 3).trim();
            } else {
                actor = first.trim();
            }
            return { actor, topic, detail };
        }
        const ha = raw.match(/^(.+?)\s+ha\s+/);
        if (ha) actor = ha[1].trim();
        else {
            const role = raw.match(/^(.+?\s+\([^)]+\))\s+/);
            if (role) actor = role[1].trim();
        }
        return { actor, topic, detail: raw };
    }

    function ensureBellDetail() {
        let el = document.getElementById('navBellDetail');
        if (el) return el;
        const panel = document.getElementById('navBellPanel');
        const list = document.getElementById('navBellList');
        if (!panel || !list) return null;
        el = document.createElement('div');
        el.id = 'navBellDetail';
        el.className = 'nav-bell-detail';
        el.hidden = true;
        el.innerHTML = '<button type="button" class="nav-bell-detail-back" id="navBellDetailBack">Indietro</button>'
            + '<strong id="navBellDetailTitle"></strong>'
            + '<span class="nav-bell-actor" id="navBellDetailActor"></span>'
            + '<span class="nav-bell-topic" id="navBellDetailTopic"></span>'
            + '<p class="nav-bell-detail-body" id="navBellDetailBody"></p>'
            + '<time id="navBellDetailWhen"></time>'
            + '<a class="nav-bell-detail-open" id="navBellDetailOpen" hidden>Apri</a>';
        list.parentNode.insertBefore(el, list.nextSibling);
        document.getElementById('navBellDetailBack').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeBellDetail();
        });
        return el;
    }

    function closeBellDetail() {
        const el = document.getElementById('navBellDetail');
        const list = document.getElementById('navBellList');
        if (el) el.hidden = true;
        if (list) list.hidden = false;
        const panel = document.getElementById('navBellPanel');
        if (panel) panel.classList.remove('showing-detail');
    }

    function openBellDetail(n) {
        const el = ensureBellDetail();
        const list = document.getElementById('navBellList');
        if (!el || !n) return;
        const parts = parseNotifParts(n);
        const when = n.createdAt
            ? new Date(n.createdAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
            : '';
        document.getElementById('navBellDetailTitle').textContent = n.title || 'Notifica';
        const actorEl = document.getElementById('navBellDetailActor');
        actorEl.textContent = parts.actor || '';
        actorEl.hidden = !parts.actor;
        const topicEl = document.getElementById('navBellDetailTopic');
        topicEl.textContent = parts.topic || '';
        topicEl.hidden = !parts.topic;
        const bodyEl = document.getElementById('navBellDetailBody');
        bodyEl.textContent = parts.detail || '';
        bodyEl.hidden = !parts.detail;
        document.getElementById('navBellDetailWhen').textContent = when;
        const openEl = document.getElementById('navBellDetailOpen');
        const href = n.link || '';
        const hasLink = href && href !== '#';
        if (hasLink) {
            openEl.href = href;
            openEl.hidden = false;
        } else {
            openEl.removeAttribute('href');
            openEl.hidden = true;
        }
        if (list) list.hidden = true;
        el.hidden = false;
        const panel = document.getElementById('navBellPanel');
        if (panel) panel.classList.add('showing-detail');
    }

    function renderItems(items) {
        if (Array.isArray(items)) _bellItems = items.slice();
        const list = document.getElementById('navBellList');
        if (!list) return;
        const shown = visibleBellItems();
        if (!shown.length) {
            list.innerHTML = '<div class="nav-bell-empty">Nessuna notifica.</div>';
            syncBellSelectUi();
            return;
        }
        list.innerHTML = shown
            .map((n) => {
                const when = new Date(n.createdAt).toLocaleString('it-IT', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                });
                const href = n.link || '#';
                const unread = !n.read;
                const unreadCls = unread ? ' unread' : '';
                const selCls = _bellSelected.has(String(n.id)) ? ' selected' : '';
                const markLabel = unread ? 'Segna come letto' : 'Segna come non letto';
                const parts = parseNotifParts(n);
                const isIdea = n.type === 'idea';
                let meta = '';
                if (parts.actor) meta += '<span class="nav-bell-actor">' + escapeHtml(parts.actor) + '</span>';
                if (isIdea && parts.topic) meta += '<span class="nav-bell-topic">' + escapeHtml(parts.topic) + '</span>';
                return `<div class="nav-bell-item${unreadCls}${selCls}" data-nid="${escapeAttr(n.id)}">
                    <a class="nav-bell-item-body" href="${escapeAttr(href)}" data-nid="${escapeAttr(n.id)}">
                        <strong>${escapeHtml(n.title)}</strong>
                        ${meta}
                        <time>${when}</time>
                    </a>
                    <div class="nav-bell-item-actions">
                        <button type="button" class="nav-bell-mark-one" data-mark="${escapeAttr(n.id)}">${markLabel}</button>
                        <button type="button" class="nav-bell-del-one" data-del="${escapeAttr(n.id)}">Elimina</button>
                    </div>
                </div>`;
            })
            .join('');

        list.querySelectorAll('.nav-bell-mark-one').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (_bellSelecting) return;
                const id = btn.getAttribute('data-mark');
                const item = btn.closest('.nav-bell-item');
                if (!id || !item) return;
                const unread = item.classList.contains('unread');
                btn.disabled = true;
                if (unread) {
                    await markRead(id);
                    setBellItemRead(item, true);
                } else {
                    await markUnread(id);
                    setBellItemRead(item, false);
                }
                btn.disabled = false;
            });
        });

        list.querySelectorAll('.nav-bell-del-one').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (_bellSelecting) return;
                const id = btn.getAttribute('data-del');
                if (!id) return;
                const ok = await confirmBellDelete(1);
                if (!ok) return;
                queueBellDelete([id]);
            });
        });

        list.querySelectorAll('.nav-bell-item').forEach((item) => {
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = item.getAttribute('data-nid');
                if (!id) return;
                if (!_bellSelecting) enterBellSelect(id);
                else toggleBellSelect(id);
            });
            item.addEventListener('click', (e) => {
                if (!_bellSelecting) return;
                if (e.target.closest('button')) return;
                e.preventDefault();
                e.stopPropagation();
                const id = item.getAttribute('data-nid');
                if (id) toggleBellSelect(id);
            });
        });

        list.querySelectorAll('.nav-bell-item-body[data-nid]').forEach((el) => {
            el.addEventListener('click', async (e) => {
                e.preventDefault();
                if (_bellSelecting) return;
                const id = el.getAttribute('data-nid');
                if (!id) return;
                const item = el.closest('.nav-bell-item');
                const row = _bellItems.find((n) => String(n.id) === String(id));
                if (item && item.classList.contains('unread')) {
                    setBellItemRead(item, true);
                    await markRead(id);
                }
                if (row) openBellDetail(row);
            });
        });
        syncBellSelectUi();
    }

    function setBellItemRead(item, read) {
        if (!item) return;
        item.classList.toggle('unread', !read);
        const mark = item.querySelector('.nav-bell-mark-one');
        if (mark) mark.textContent = read ? 'Segna come non letto' : 'Segna come letto';
        const id = item.getAttribute('data-nid');
        const row = _bellItems.find((n) => String(n.id) === String(id));
        if (row) row.read = !!read;
        recalcBellBadge();
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(s) {
        return escapeHtml(s).replace(/'/g, '&#39;');
    }

    function ensureBellConfirm() {
        let el = document.getElementById('navBellConfirm');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'navBellConfirm';
        el.className = 'nav-bell-confirm';
        el.hidden = true;
        el.innerHTML = '<div class="nav-bell-confirm-box" role="dialog" aria-modal="true" aria-labelledby="navBellConfirmMsg">'
            + '<div class="nav-bell-confirm-ico" aria-hidden="true">🗑</div>'
            + '<p id="navBellConfirmMsg"></p>'
            + '<div class="nav-bell-confirm-btns">'
            + '<button type="button" class="cancel" id="navBellConfirmCancel">Annulla</button>'
            + '<button type="button" class="ok" id="navBellConfirmOk">Elimina</button>'
            + '</div></div>';
        document.body.appendChild(el);
        return el;
    }

    function confirmBellDelete(count) {
        const modal = ensureBellConfirm();
        const msg = document.getElementById('navBellConfirmMsg');
        const okBtn = document.getElementById('navBellConfirmOk');
        const cancelBtn = document.getElementById('navBellConfirmCancel');
        const n = Number(count) || 1;
        msg.textContent = n === 1
            ? 'Eliminare questa notifica?'
            : ('Eliminare ' + n + ' notifiche selezionate?');
        modal.hidden = false;
        okBtn.focus();
        return new Promise((resolve) => {
            function close(answer) {
                modal.hidden = true;
                okBtn.onclick = null;
                cancelBtn.onclick = null;
                modal.onclick = null;
                document.removeEventListener('keydown', onKey);
                resolve(answer);
            }
            function onKey(e) {
                if (e.key === 'Escape') { e.preventDefault(); close(false); }
            }
            okBtn.onclick = (e) => { e.stopPropagation(); close(true); };
            cancelBtn.onclick = (e) => { e.stopPropagation(); close(false); };
            modal.onclick = (e) => {
                e.stopPropagation();
                if (e.target === modal) close(false);
            };
            document.addEventListener('keydown', onKey);
        });
    }

    function ensureBellUndoToast() {
        let el = document.getElementById('navBellUndo');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'navBellUndo';
        el.className = 'nav-bell-undo';
        el.hidden = true;
        el.innerHTML = '<span class="nav-bell-undo-msg" id="navBellUndoMsg">Notifica eliminata</span>'
            + '<button type="button" class="nav-bell-undo-btn" id="navBellUndoBtn">Annulla</button>';
        document.body.appendChild(el);
        el.addEventListener('click', (e) => e.stopPropagation());
        el.addEventListener('mouseenter', () => resetBellUndoFade());
        document.getElementById('navBellUndoBtn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            undoBellDelete();
        });
        return el;
    }

    function clearBellUndoTimers() {
        if (!_bellUndo) return;
        if (_bellUndo.holdTimer) clearTimeout(_bellUndo.holdTimer);
        if (_bellUndo.fadeTimer) clearTimeout(_bellUndo.fadeTimer);
        _bellUndo.holdTimer = null;
        _bellUndo.fadeTimer = null;
        _bellUndo.fading = false;
    }

    function scheduleBellUndoFade() {
        if (!_bellUndo) return;
        clearBellUndoTimers();
        const toast = ensureBellUndoToast();
        toast.classList.remove('is-fading');
        toast.style.opacity = '1';
        _bellUndo.holdTimer = setTimeout(() => {
            if (!_bellUndo) return;
            _bellUndo.fading = true;
            toast.classList.add('is-fading');
            toast.style.opacity = '0';
            _bellUndo.fadeTimer = setTimeout(() => {
                commitBellDelete();
            }, BELL_UNDO_FADE_MS);
        }, BELL_UNDO_HOLD_MS);
    }

    function resetBellUndoFade() {
        if (!_bellUndo) return;
        const toast = ensureBellUndoToast();
        clearBellUndoTimers();
        toast.classList.remove('is-fading');
        toast.style.opacity = '1';
        scheduleBellUndoFade();
    }

    async function commitBellDelete() {
        if (!_bellUndo) return;
        const items = _bellUndo.items.slice();
        clearBellUndoTimers();
        _bellUndo = null;
        const toast = document.getElementById('navBellUndo');
        if (toast) {
            toast.hidden = true;
            toast.classList.remove('is-fading');
            toast.style.opacity = '';
        }
        const ids = new Set(items.map((n) => String(n.id)));
        _bellItems = _bellItems.filter((n) => !ids.has(String(n.id)));
        for (const n of items) {
            await deleteNotification(n.id);
        }
        recalcBellBadge();
        renderItems();
    }

    function undoBellDelete() {
        if (!_bellUndo) return;
        clearBellUndoTimers();
        _bellUndo = null;
        const toast = document.getElementById('navBellUndo');
        if (toast) {
            toast.hidden = true;
            toast.classList.remove('is-fading');
            toast.style.opacity = '';
        }
        recalcBellBadge();
        renderItems();
    }

    function queueBellDelete(ids) {
        const idSet = new Set((ids || []).map(String).filter(Boolean));
        if (!idSet.size) return;
        // Se c'era un undo in corso, conferma subito quelle eliminazioni
        if (_bellUndo) {
            const prev = _bellUndo.items.slice();
            clearBellUndoTimers();
            _bellUndo = null;
            const prevIds = new Set(prev.map((n) => String(n.id)));
            _bellItems = _bellItems.filter((n) => !prevIds.has(String(n.id)));
            prev.forEach((n) => { deleteNotification(n.id); });
        }
        const items = _bellItems.filter((n) => idSet.has(String(n.id)));
        if (!items.length) return;
        _bellUndo = { items, holdTimer: null, fadeTimer: null, fading: false };
        items.forEach((n) => _bellSelected.delete(String(n.id)));
        exitBellSelect();
        recalcBellBadge();
        renderItems();
        const toast = ensureBellUndoToast();
        const msg = document.getElementById('navBellUndoMsg');
        msg.textContent = items.length === 1
            ? 'Notifica eliminata'
            : (items.length + ' notifiche eliminate');
        toast.hidden = false;
        toast.classList.remove('is-fading');
        toast.style.opacity = '1';
        scheduleBellUndoFade();
    }

    function ensureBellSelectBar(panel) {
        let bar = document.getElementById('navBellSelectBar');
        if (bar) return bar;
        bar = document.createElement('div');
        bar.id = 'navBellSelectBar';
        bar.className = 'nav-bell-select-bar';
        bar.hidden = true;
        bar.innerHTML = '<span class="nav-bell-select-count" id="navBellSelectCount">0 selezionate</span>'
            + '<div class="nav-bell-select-actions">'
            + '<button type="button" data-bell-sel="read">Segna come lette</button>'
            + '<button type="button" data-bell-sel="unread">Segna come non lette</button>'
            + '<button type="button" class="danger" data-bell-sel="del">Elimina</button>'
            + '<button type="button" data-bell-sel="cancel">Annulla</button>'
            + '</div>';
        const head = panel.querySelector('.nav-bell-panel-head');
        if (head && head.nextSibling) panel.insertBefore(bar, head.nextSibling);
        else panel.insertBefore(bar, panel.firstChild);
        bar.addEventListener('click', async (e) => {
            e.stopPropagation();
            const btn = e.target.closest('[data-bell-sel]');
            if (!btn) return;
            const act = btn.getAttribute('data-bell-sel');
            if (act === 'cancel') { exitBellSelect(); return; }
            const ids = [..._bellSelected];
            if (!ids.length) return;
            if (act === 'read') {
                btn.disabled = true;
                for (const id of ids) {
                    await markRead(id);
                    const row = _bellItems.find((n) => String(n.id) === String(id));
                    if (row) row.read = true;
                }
                btn.disabled = false;
                exitBellSelect();
                renderItems();
                return;
            }
            if (act === 'unread') {
                btn.disabled = true;
                for (const id of ids) {
                    await markUnread(id);
                    const row = _bellItems.find((n) => String(n.id) === String(id));
                    if (row) row.read = false;
                }
                btn.disabled = false;
                exitBellSelect();
                renderItems();
                return;
            }
            if (act === 'del') {
                const ok = await confirmBellDelete(ids.length);
                if (!ok) return;
                queueBellDelete(ids);
            }
        });
        return bar;
    }

    function enterBellSelect(id) {
        _bellSelecting = true;
        _bellSelected.clear();
        if (id) _bellSelected.add(String(id));
        syncBellSelectUi();
        const panel = document.getElementById('navBellPanel');
        if (panel) panel.classList.add('selecting');
        document.querySelectorAll('#navBellList .nav-bell-item').forEach((el) => {
            el.classList.toggle('selected', _bellSelected.has(String(el.getAttribute('data-nid'))));
        });
    }

    function toggleBellSelect(id) {
        const sid = String(id);
        if (_bellSelected.has(sid)) _bellSelected.delete(sid);
        else _bellSelected.add(sid);
        if (!_bellSelected.size) {
            exitBellSelect();
            return;
        }
        document.querySelectorAll('#navBellList .nav-bell-item').forEach((el) => {
            el.classList.toggle('selected', _bellSelected.has(String(el.getAttribute('data-nid'))));
        });
        syncBellSelectUi();
    }

    function exitBellSelect() {
        _bellSelecting = false;
        _bellSelected.clear();
        const panel = document.getElementById('navBellPanel');
        if (panel) panel.classList.remove('selecting');
        document.querySelectorAll('#navBellList .nav-bell-item.selected').forEach((el) => el.classList.remove('selected'));
        syncBellSelectUi();
    }

    function syncBellSelectUi() {
        const panel = document.getElementById('navBellPanel');
        if (!panel) return;
        const bar = ensureBellSelectBar(panel);
        const countEl = document.getElementById('navBellSelectCount');
        const n = _bellSelected.size;
        if (_bellSelecting && n > 0) {
            bar.hidden = false;
            if (countEl) countEl.textContent = n === 1 ? '1 selezionata' : (n + ' selezionate');
        } else {
            bar.hidden = true;
        }
    }

    async function markRead(id) {
        try {
            const res = await fetch('/api/auth/notifications/' + encodeURIComponent(id) + '/read', {
                method: 'POST',
                headers: authHeader(),
                keepalive: true,
            });
            if (res.ok) {
                const data = await res.json();
                const row = _bellItems.find((n) => String(n.id) === String(id));
                if (row) row.read = true;
                if (data.unread != null) setUnreadBadge(data.unread);
                else recalcBellBadge();
            }
        } catch { /* ignore */ }
    }

    async function markUnread(id) {
        try {
            const res = await fetch('/api/auth/notifications/' + encodeURIComponent(id) + '/unread', {
                method: 'POST',
                headers: authHeader(),
            });
            if (res.ok) {
                const data = await res.json();
                const row = _bellItems.find((n) => String(n.id) === String(id));
                if (row) row.read = false;
                if (data.unread != null) setUnreadBadge(data.unread);
                else recalcBellBadge();
            }
        } catch { /* ignore */ }
    }

    async function deleteNotification(id) {
        try {
            const res = await fetch('/api/auth/notifications/' + encodeURIComponent(id), {
                method: 'DELETE',
                headers: authHeader(),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.unread != null) setUnreadBadge(data.unread);
            }
        } catch { /* ignore */ }
    }

    async function markAllRead() {
        try {
            const res = await fetch('/api/auth/notifications/read-all', {
                method: 'POST',
                headers: authHeader(),
            });
            if (res.ok) {
                setUnreadBadge(0);
                await refreshNavBell();
            }
        } catch { /* ignore */ }
    }

    async function refreshNavBell() {
        const list = document.getElementById('navBellList');
        if (!list) return;
        try {
            const res = await fetch('/api/auth/notifications', { headers: authHeader() });
            if (!res.ok) return;
            const data = await res.json();
            const pending = _bellUndo ? new Set(_bellUndo.items.map((n) => String(n.id))) : null;
            let items = data.items || [];
            // Mantieni in cache le pending (non ancora eliminate sul server) anche se il refresh le riporta
            if (pending) {
                const byId = new Map(items.map((n) => [String(n.id), n]));
                _bellUndo.items.forEach((n) => {
                    if (!byId.has(String(n.id))) byId.set(String(n.id), n);
                });
                items = [...byId.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
            }
            _bellItems = items;
            // Rimuovi dalla selezione id spariti
            [..._bellSelected].forEach((id) => {
                if (!_bellItems.some((n) => String(n.id) === id) || (pending && pending.has(id))) {
                    _bellSelected.delete(id);
                }
            });
            if (!_bellSelected.size) _bellSelecting = false;
            setUnreadBadge(data.unread || 0);
            if (pending) recalcBellBadge();
            renderItems();
        } catch { /* silenzioso */ }
    }

    function ensureHeadActions(panel) {
        const head = panel.querySelector('.nav-bell-panel-head');
        if (!head) return;

        let actions = head.querySelector('.nav-bell-head-actions');
        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'nav-bell-head-actions';
            [...head.querySelectorAll('a, button')].forEach((n) => {
                if (!n.closest('.nav-bell-head-actions')) actions.appendChild(n);
            });
            head.appendChild(actions);
        }

        if (!document.getElementById('navBellFullscreen')) {
            const fs = document.createElement('button');
            fs.type = 'button';
            fs.id = 'navBellFullscreen';
            fs.className = 'nav-bell-head-btn';
            fs.textContent = 'Schermo intero';
            fs.title = 'Vedi a schermo intero';
            fs.setAttribute('aria-pressed', 'false');
            fs.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                applyFullscreenStyles(!_fullscreen);
            });
            actions.insertBefore(fs, actions.firstChild);
        }

        if (!document.getElementById('navBellMarkAll')) {
            const a = document.createElement('button');
            a.type = 'button';
            a.id = 'navBellMarkAll';
            a.className = 'nav-bell-head-btn';
            a.textContent = 'Segna tutte';
            a.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                markAllRead();
            });
            actions.appendChild(a);
        }
        ensureBellSelectBar(panel);
    }

    function initNavBell() {
        const wrap = document.getElementById('navBellWrap');
        const btn = document.getElementById('navBellBtn');
        const panel = document.getElementById('navBellPanel');
        if (!btn || !panel) return;

        if (wrap) wrap.style.display = '';
        if (panel.parentElement !== document.body) document.body.appendChild(panel);
        panel.hidden = true;
        panel.classList.remove('open', 'nav-bell-fullscreen', 'selecting');
        _fullscreen = false;

        ensureHeadActions(panel);
        ensureBellConfirm();
        ensureBellUndoToast();

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = panel.hidden || !panel.classList.contains('open');
            if (willOpen) {
                if (typeof closeNavMessages === 'function') closeNavMessages();
                applyFullscreenStyles(false);
                positionNavBellPanel();
                panel.hidden = false;
                panel.classList.add('open');
                btn.classList.add('open');
                refreshNavBell();
            } else {
                closeNavBell();
            }
        });

        document.addEventListener('click', () => {
            if (_fullscreen) return;
            closeNavBell();
        });
        panel.addEventListener('click', (e) => e.stopPropagation());

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('navBellConfirm') && !document.getElementById('navBellConfirm').hidden) return;
            if (panel.hidden) return;
            if (document.getElementById('navBellDetail') && !document.getElementById('navBellDetail').hidden) {
                closeBellDetail();
                e.preventDefault();
                return;
            }
            if (_bellSelecting) {
                exitBellSelect();
                e.preventDefault();
                return;
            }
            if (_fullscreen) {
                applyFullscreenStyles(false);
                e.preventDefault();
                return;
            }
            closeNavBell();
        });

        window.addEventListener('resize', () => {
            if (!panel.hidden && !_fullscreen) positionNavBellPanel();
        });

        refreshNavBell();
        setInterval(refreshNavBell, 45000);
        initNavMessages();
        initNavAvatar();
    }

    global.initNavBell = initNavBell;
    global.refreshNavBell = refreshNavBell;
    global.closeNavBell = closeNavBell;

    // ── Immagini di profilo ──────────────────────────────────────────────────
    // Le immagini richiedono il Bearer, quindi si scaricano via fetch e si usano
    // come blob URL; la cache è per utente+versione (la versione cambia a ogni upload).
    const _avatarCache = new Map();

    function avatarUrl(id, version, kind) {
        const ver = Number(version) || 0;
        if (!id || !ver) return Promise.resolve('');
        const k = kind === 'group' ? 'group' : 'user';
        const key = k + ':' + id + ':' + ver;
        if (_avatarCache.has(key)) return _avatarCache.get(key);
        const path = k === 'group'
            ? '/api/auth/messages/groups/' + encodeURIComponent(id) + '/avatar'
            : '/api/auth/avatar/' + encodeURIComponent(id);
        const p = fetch(path, { headers: authHeader() })
            .then((res) => (res.status === 200 ? res.blob() : null))
            .then((blob) => (blob && blob.size ? URL.createObjectURL(blob) : ''))
            .catch(() => '');
        _avatarCache.set(key, p);
        return p;
    }

    function avatarHtml(id, version, fallbackText, kind) {
        const k = kind === 'group' ? 'group' : 'user';
        return '<span class="nav-msg-avatar" data-av-kind="' + k + '" data-av-id="' + escapeAttr(id) + '" data-av-ver="' + (Number(version) || 0) + '">'
            + escapeHtml(fallbackText) + '</span>';
    }

    function hydrateAvatars(root) {
        if (!root) return;
        root.querySelectorAll('[data-av-id]').forEach((elm) => {
            const ver = Number(elm.getAttribute('data-av-ver')) || 0;
            if (!ver) return;
            avatarUrl(elm.getAttribute('data-av-id'), ver, elm.getAttribute('data-av-kind')).then((url) => {
                if (!url || !elm.isConnected) return;
                elm.innerHTML = '<img src="' + url + '" alt="">';
                elm.classList.add('has-img');
            });
        });
    }

    async function refreshNavAvatar() {
        const wrap = document.getElementById('navAvatarWrap');
        const img = document.getElementById('navAvatarImg');
        if (!wrap || !img) return;
        try {
            const res = await fetch('/api/auth/avatar/me', { headers: authHeader() });
            if (res.status !== 200) { wrap.hidden = true; return; }
            const blob = await res.blob();
            if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
            img.src = URL.createObjectURL(blob);
            wrap.hidden = false;
        } catch { wrap.hidden = true; }
    }

    function initNavAvatar() {
        const emailLi = document.getElementById('navUserEmail');
        if (!emailLi || !emailLi.parentElement) return;
        if (!document.getElementById('navAvatarWrap')) {
            const li = document.createElement('li');
            li.id = 'navAvatarWrap';
            li.className = 'nav-avatar-wrap';
            li.hidden = true;
            li.innerHTML = '<button type="button" id="navAvatarBtn" title="Vedi immagine di profilo" aria-label="Vedi immagine di profilo"><img id="navAvatarImg" alt=""></button>';
            emailLi.parentElement.insertBefore(li, emailLi);
        }
        const avBtn = document.getElementById('navAvatarBtn');
        if (avBtn && !avBtn.dataset.wired) {
            avBtn.dataset.wired = '1';
            avBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const img = document.getElementById('navAvatarImg');
                if (img && img.src) openAvatarLightbox(img.src);
            });
        }
        refreshNavAvatar();
    }

    function openAvatarLightbox(url) {
        if (!url) return;
        let light = document.getElementById('navAvatarLight');
        if (!light) {
            light = document.createElement('div');
            light.id = 'navAvatarLight';
            light.className = 'nav-msg-light-global';
            light.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(3,14,28,0.92);padding:1.2rem;cursor:pointer';
            light.addEventListener('click', () => { light.hidden = true; light.innerHTML = ''; });
            document.body.appendChild(light);
        }
        light.innerHTML = '<img alt="" style="max-width:min(92vw,720px);max-height:92vh;border-radius:12px;object-fit:contain;box-shadow:0 16px 48px rgba(0,0,0,0.6)">';
        light.querySelector('img').src = url;
        light.hidden = false;
    }

    global.refreshNavAvatar = refreshNavAvatar;
    global.avatarUrl = avatarUrl;

    const MSG_STYLE = `
.nav-avatar-wrap { flex-shrink: 0; list-style: none; display: flex; align-items: center; }
.nav-avatar-wrap[hidden] { display: none; }
.nav-avatar-wrap a, .nav-avatar-wrap button {
    display: inline-flex !important; width: 36px; height: 36px; padding: 0 !important; margin: 0;
    border-radius: 50%; overflow: hidden; background: rgba(0,200,255,0.08) !important;
    border: 1px solid rgba(0,200,255,0.35); box-sizing: border-box; cursor: pointer;
}
.nav-avatar-wrap a:hover, .nav-avatar-wrap button:hover { border-color: #00C8FF; }
.nav-avatar-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
html.light-theme .nav-avatar-wrap a, html.light-theme .nav-avatar-wrap button { background: rgba(255,122,0,0.08) !important; border-color: rgba(255,122,0,0.4); }
html.light-theme .nav-avatar-wrap a:hover, html.light-theme .nav-avatar-wrap button:hover { border-color: #FF7A00; }
.nav-msg-avatar { overflow: hidden; cursor: pointer; }
.nav-msg-avatar.has-img { background: transparent; }
.nav-msg-head-av { width: 28px !important; height: 28px !important; font-size: 0.72rem !important; }
.nav-msg-head-av[hidden] { display: none !important; }
.nav-msg-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 50%; }
#navMsgBadge.nav-bell-badge,
.nav-bell-badge {
    z-index: 3;
    background: #FF2D55 !important;
    color: #ffffff !important;
    -webkit-text-fill-color: #ffffff !important;
    font-weight: 800;
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
}
#navMsgBadge.nav-bell-badge {
    font-size: 11px;
    line-height: 16px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
}
html.light-theme #navMsgBadge.nav-bell-badge,
html.light-theme .nav-bell-badge {
    background: #E53935 !important;
    color: #ffffff !important;
    -webkit-text-fill-color: #ffffff !important;
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
}
#navMsgBadge.nav-bell-badge.visible { display: block !important; }
#navMsgPanel.open { display: flex !important; flex-direction: column; height: min(520px, calc(100vh - 90px)); }
#navMsgPanel.open.nav-bell-fullscreen {
    height: 100% !important; max-height: 100%; width: 100% !important;
    top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
    border-radius: 0 !important; border: none; z-index: 5000;
}
#navMsgPanel.nav-bell-fullscreen .nav-msg-scroll,
#navMsgPanel.nav-bell-fullscreen .nav-msg-thread {
    max-width: 720px; width: 100%; margin-left: auto; margin-right: auto;
}
#navMsgPanel.nav-bell-fullscreen .nav-msg-compose,
#navMsgPanel.nav-bell-fullscreen .nav-msg-multi,
#navMsgPanel.nav-bell-fullscreen .nav-msg-preview,
#navMsgPanel.nav-bell-fullscreen .nav-msg-picker,
#navMsgPanel.nav-bell-fullscreen .nav-msg-search {
    max-width: 720px; width: calc(100% - 1.4rem); margin-left: auto; margin-right: auto;
}
#navMsgPanel.nav-bell-fullscreen .nav-msg-search { width: calc(100% - 2rem); }
#navMsgPanel.nav-bell-fullscreen .nav-bell-panel-head { padding: 1.1rem 1.5rem; }
#navMsgPanel.nav-bell-fullscreen .nav-bell-panel-head strong { font-size: 1.15rem; }
#navMsgFsBtn.nav-bell-head-btn { margin-right: 0.15rem; }
#navMsgPanel .nav-bell-panel-head { flex-shrink: 0; display: flex; align-items: center; gap: 0.45rem; }
.nav-msg-head-left { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
.nav-msg-head-left strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-msg-icon-btn {
    width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid rgba(0,200,255,0.28); background: transparent; color: #7ACCE0;
    border-radius: 7px; cursor: pointer; padding: 0; font: inherit; font-size: 0.95rem; line-height: 1;
    text-transform: none;
}
.nav-msg-icon-btn:hover { color: #00C8FF; border-color: #00C8FF; }
.nav-msg-icon-btn[hidden] { display: none !important; }
.nav-msg-icon-btn svg { width: 16px; height: 16px; display: block; }
.nav-msg-head-actions { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }
.nav-msg-view { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.nav-msg-view[hidden] { display: none !important; }
.nav-msg-search {
    box-sizing: border-box; width: calc(100% - 1.4rem); margin: 0.65rem 0.7rem 0.4rem;
    border-radius: 8px; border: 1px solid rgba(0,200,255,0.28); background: rgba(0,12,24,0.65);
    color: #E8F7FF; font: inherit; font-size: 0.84rem; padding: 0.5rem 0.65rem;
}
.nav-msg-scroll { flex: 1; min-height: 0; overflow: auto; }
#navMsgPanel.nav-msg-panel,
.nav-msg-scroll,
.nav-msg-thread,
.nav-msg-add-list,
.nav-msg-picker-grid,
.nav-msg-emoji-panel,
.nav-msg-member-list,
.nav-msg-fm-files,
.nav-msg-compose-input,
.nav-msg-pdf-scroll {
    overscroll-behavior: contain;
}
/* Scrollbar tema Criptogram (cyan su navy) */
.nav-msg-panel,
.nav-msg-scroll,
.nav-msg-thread,
.nav-msg-add-list,
.nav-msg-picker-grid,
.nav-msg-emoji-panel,
.nav-msg-member-list,
.nav-msg-fm-files {
    scrollbar-width: thin;
    scrollbar-color: rgba(0,200,255,0.45) rgba(0,18,36,0.95);
}
.nav-msg-panel::-webkit-scrollbar,
.nav-msg-scroll::-webkit-scrollbar,
.nav-msg-thread::-webkit-scrollbar,
.nav-msg-add-list::-webkit-scrollbar,
.nav-msg-picker-grid::-webkit-scrollbar,
.nav-msg-emoji-panel::-webkit-scrollbar,
.nav-msg-member-list::-webkit-scrollbar,
.nav-msg-fm-files::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}
.nav-msg-panel::-webkit-scrollbar-track,
.nav-msg-scroll::-webkit-scrollbar-track,
.nav-msg-thread::-webkit-scrollbar-track,
.nav-msg-add-list::-webkit-scrollbar-track,
.nav-msg-picker-grid::-webkit-scrollbar-track,
.nav-msg-emoji-panel::-webkit-scrollbar-track,
.nav-msg-member-list::-webkit-scrollbar-track,
.nav-msg-fm-files::-webkit-scrollbar-track {
    background: rgba(0,18,36,0.95);
    border-radius: 8px;
}
.nav-msg-panel::-webkit-scrollbar-thumb,
.nav-msg-scroll::-webkit-scrollbar-thumb,
.nav-msg-thread::-webkit-scrollbar-thumb,
.nav-msg-add-list::-webkit-scrollbar-thumb,
.nav-msg-picker-grid::-webkit-scrollbar-thumb,
.nav-msg-emoji-panel::-webkit-scrollbar-thumb,
.nav-msg-member-list::-webkit-scrollbar-thumb,
.nav-msg-fm-files::-webkit-scrollbar-thumb {
    background: rgba(0,200,255,0.38);
    border-radius: 8px;
    border: 2px solid rgba(0,18,36,0.95);
    background-clip: padding-box;
}
.nav-msg-panel::-webkit-scrollbar-thumb:hover,
.nav-msg-scroll::-webkit-scrollbar-thumb:hover,
.nav-msg-thread::-webkit-scrollbar-thumb:hover,
.nav-msg-add-list::-webkit-scrollbar-thumb:hover,
.nav-msg-picker-grid::-webkit-scrollbar-thumb:hover,
.nav-msg-emoji-panel::-webkit-scrollbar-thumb:hover,
.nav-msg-member-list::-webkit-scrollbar-thumb:hover,
.nav-msg-fm-files::-webkit-scrollbar-thumb:hover {
    background: rgba(0,200,255,0.62);
}
.nav-msg-panel::-webkit-scrollbar-corner,
.nav-msg-scroll::-webkit-scrollbar-corner,
.nav-msg-thread::-webkit-scrollbar-corner,
.nav-msg-add-list::-webkit-scrollbar-corner,
.nav-msg-picker-grid::-webkit-scrollbar-corner,
.nav-msg-emoji-panel::-webkit-scrollbar-corner,
.nav-msg-member-list::-webkit-scrollbar-corner,
.nav-msg-fm-files::-webkit-scrollbar-corner {
    background: rgba(0,18,36,0.95);
}
html.light-theme .nav-msg-panel,
html.light-theme .nav-msg-scroll,
html.light-theme .nav-msg-thread,
html.light-theme .nav-msg-add-list,
html.light-theme .nav-msg-picker-grid,
html.light-theme .nav-msg-emoji-panel,
html.light-theme .nav-msg-member-list,
html.light-theme .nav-msg-fm-files {
    scrollbar-color: rgba(255,140,0,0.45) rgba(255,248,240,0.95);
}
html.light-theme .nav-msg-panel::-webkit-scrollbar-track,
html.light-theme .nav-msg-scroll::-webkit-scrollbar-track,
html.light-theme .nav-msg-thread::-webkit-scrollbar-track,
html.light-theme .nav-msg-add-list::-webkit-scrollbar-track,
html.light-theme .nav-msg-picker-grid::-webkit-scrollbar-track,
html.light-theme .nav-msg-emoji-panel::-webkit-scrollbar-track,
html.light-theme .nav-msg-member-list::-webkit-scrollbar-track,
html.light-theme .nav-msg-fm-files::-webkit-scrollbar-track,
html.light-theme .nav-msg-panel::-webkit-scrollbar-corner,
html.light-theme .nav-msg-scroll::-webkit-scrollbar-corner,
html.light-theme .nav-msg-thread::-webkit-scrollbar-corner,
html.light-theme .nav-msg-add-list::-webkit-scrollbar-corner,
html.light-theme .nav-msg-picker-grid::-webkit-scrollbar-corner,
html.light-theme .nav-msg-emoji-panel::-webkit-scrollbar-corner,
html.light-theme .nav-msg-member-list::-webkit-scrollbar-corner,
html.light-theme .nav-msg-fm-files::-webkit-scrollbar-corner {
    background: rgba(255,248,240,0.95);
}
html.light-theme .nav-msg-panel::-webkit-scrollbar-thumb,
html.light-theme .nav-msg-scroll::-webkit-scrollbar-thumb,
html.light-theme .nav-msg-thread::-webkit-scrollbar-thumb,
html.light-theme .nav-msg-add-list::-webkit-scrollbar-thumb,
html.light-theme .nav-msg-picker-grid::-webkit-scrollbar-thumb,
html.light-theme .nav-msg-emoji-panel::-webkit-scrollbar-thumb,
html.light-theme .nav-msg-member-list::-webkit-scrollbar-thumb,
html.light-theme .nav-msg-fm-files::-webkit-scrollbar-thumb {
    background: rgba(255,140,0,0.4);
    border-color: rgba(255,248,240,0.95);
}
html.light-theme .nav-msg-panel::-webkit-scrollbar-thumb:hover,
html.light-theme .nav-msg-scroll::-webkit-scrollbar-thumb:hover,
html.light-theme .nav-msg-thread::-webkit-scrollbar-thumb:hover,
html.light-theme .nav-msg-add-list::-webkit-scrollbar-thumb:hover,
html.light-theme .nav-msg-picker-grid::-webkit-scrollbar-thumb:hover,
html.light-theme .nav-msg-emoji-panel::-webkit-scrollbar-thumb:hover,
html.light-theme .nav-msg-member-list::-webkit-scrollbar-thumb:hover,
html.light-theme .nav-msg-fm-files::-webkit-scrollbar-thumb:hover {
    background: rgba(255,140,0,0.65);
}
.nav-msg-conv {
    display: flex; align-items: center; gap: 0.7rem; width: 100%; padding: 0.65rem 0.9rem;
    border: 0; border-bottom: 1px solid rgba(0,200,255,0.08); background: transparent;
    color: inherit; text-align: left; cursor: pointer; font: inherit; text-transform: none;
}
.nav-msg-conv:hover { background: rgba(0,200,255,0.06); }
.nav-msg-avatar {
    flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    background: rgba(0,200,255,0.14); color: #00C8FF; font-weight: 700; font-size: 0.85rem;
}
.nav-msg-conv-body { flex: 1; min-width: 0; }
.nav-msg-conv-top { display: flex; justify-content: space-between; gap: 0.5rem; }
.nav-msg-conv-top strong { font-size: 0.84rem; color: #E8F7FF; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-msg-conv-top time { font-size: 0.7rem; color: #7ACCE0; white-space: nowrap; }
.nav-msg-conv-last { display: flex; justify-content: space-between; gap: 0.5rem; margin-top: 0.15rem; }
.nav-msg-conv-last span { font-size: 0.78rem; color: #7ACCE0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-msg-conv.unread .nav-msg-conv-last span, .nav-msg-conv.unread .nav-msg-conv-top strong { color: #00C8FF; }
.nav-msg-count {
    flex-shrink: 0; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
    background: #00C8FF; color: #030E1C !important; -webkit-text-fill-color: #030E1C !important;
    font-size: 0.7rem; font-weight: 800; line-height: 18px; text-align: center;
}
.nav-msg-new-group-btn {
    display: flex; align-items: center; gap: 0.65rem; width: calc(100% - 1.4rem); margin: 0.65rem 0.7rem 0.15rem;
    padding: 0.65rem 0.8rem; border: 1px solid rgba(0,200,255,0.28); border-radius: 10px;
    background: rgba(0,200,255,0.08); color: #00C8FF; font: inherit; font-size: 0.84rem; font-weight: 700;
    cursor: pointer; text-align: left; text-transform: none; transition: background 0.2s, border-color 0.2s, transform 0.2s;
}
.nav-msg-new-group-btn:hover { background: rgba(0,200,255,0.14); border-color: #00C8FF; }
.nav-msg-new-group-btn .nav-msg-avatar {
    width: 34px; height: 34px; background: linear-gradient(135deg,#00C8FF,#00E676); color: #031018; font-size: 1.1rem;
}
.nav-msg-new-group-btn.active {
    background: rgba(0,200,255,0.18); border-color: #00C8FF;
    box-shadow: 0 0 0 1px rgba(0,200,255,0.25);
}
.nav-msg-person {
    display: flex; align-items: center; gap: 0.6rem; width: 100%; padding: 0.55rem 0.9rem;
    border: 0; border-bottom: 1px solid rgba(0,200,255,0.08); background: transparent;
    color: #D6F3FF; font: inherit; font-size: 0.82rem; cursor: pointer; text-align: left; text-transform: none;
    transition: background 0.28s ease, transform 0.28s ease, box-shadow 0.28s ease, padding-left 0.28s ease;
}
.nav-msg-person:hover { background: rgba(0,200,255,0.06); }
.nav-msg-person .nav-msg-avatar { width: 28px; height: 28px; font-size: 0.72rem; transition: transform 0.28s ease; }
.nav-msg-person.picked {
    background: rgba(0,200,255,0.14); box-shadow: inset 3px 0 0 #00C8FF; padding-left: 1.05rem;
}
.nav-msg-person.picked .nav-msg-avatar { transform: scale(1.08); }
.nav-msg-person.pick-anim { animation: navMsgPickPulse 0.38s ease; }
@keyframes navMsgPickPulse {
    0% { transform: scale(1); }
    35% { transform: scale(0.97); background: rgba(0,200,255,0.22); }
    100% { transform: scale(1); }
}
.nav-msg-person-mark {
    margin-left: auto; width: 1.1rem; height: 1.1rem; border-radius: 50%; flex-shrink: 0;
    border: 2px solid rgba(0,200,255,0.35); box-sizing: border-box;
    transition: background 0.25s, border-color 0.25s, transform 0.25s;
}
.nav-msg-person.picked .nav-msg-person-mark {
    background: #00C8FF; border-color: #00C8FF; transform: scale(1.05);
    box-shadow: inset 0 0 0 2px #030E1C;
}
.nav-msg-multi {
    flex-shrink: 0; display: none; gap: 0.5rem; align-items: center;
    padding: 0.55rem 0.7rem 0.7rem; border-top: 1px solid rgba(0,200,255,0.12);
}
.nav-msg-multi.visible { display: flex; }
.nav-msg-multi-count { flex: 1; min-width: 0; color: #7ACCE0; font-size: 0.8rem; font-weight: 600; }
.nav-msg-continue {
    border: 0; border-radius: 8px; padding: 0.45rem 0.9rem; font: inherit; font-size: 0.78rem; font-weight: 700;
    cursor: pointer; text-transform: none; background: linear-gradient(135deg,#00C8FF,#00E676); color: #031018;
}
.nav-msg-continue:hover:not(:disabled) { filter: brightness(1.07); }
.nav-msg-continue:disabled { opacity: 0.45; cursor: default; }
.nav-msg-add-members {
    margin: 0.35rem 0 0.55rem; width: 100%; padding: 0.45rem 0.65rem; border-radius: 8px;
    border: 1px dashed rgba(0,200,255,0.35); background: rgba(0,200,255,0.06); color: #00C8FF;
    font: inherit; font-size: 0.78rem; font-weight: 700; cursor: pointer; text-transform: none;
}
.nav-msg-add-members:hover { background: rgba(0,200,255,0.12); }
.nav-msg-leave-group {
    margin: 0.15rem 0 0.7rem; width: 100%; padding: 0.55rem 0.65rem; border-radius: 8px;
    border: 1px solid rgba(255,71,87,0.4); background: rgba(255,71,87,0.08); color: #FF8A9A;
    font: inherit; font-size: 0.8rem; font-weight: 700; cursor: pointer; text-transform: none;
}
.nav-msg-leave-group:hover { background: rgba(255,71,87,0.16); color: #FF6B7A; }
html.light-theme .nav-msg-leave-group { background: rgba(255,71,87,0.08); border-color: rgba(255,71,87,0.35); color: #C62828; }
.nav-msg-add-list { max-height: 160px; overflow: auto; margin-bottom: 0.55rem; border: 1px solid rgba(0,200,255,0.12); border-radius: 8px; }
.nav-msg-add-confirm { padding: 0.45rem 0.65rem; display: flex; justify-content: flex-end; gap: 0.4rem; }
.nav-msg-member button.danger { color: #FF8A9A; border-color: rgba(255,71,87,0.35); }
html.light-theme .nav-msg-new-group-btn { background: rgba(255,122,0,0.08); border-color: rgba(255,140,0,0.28); color: #CC5000; }
html.light-theme .nav-msg-new-group-btn:hover, html.light-theme .nav-msg-new-group-btn.active { background: rgba(255,122,0,0.14); border-color: #CC5000; }
html.light-theme .nav-msg-person.picked { background: rgba(255,122,0,0.12); box-shadow: inset 3px 0 0 #FF7A00; }
html.light-theme .nav-msg-person.picked .nav-msg-person-mark { background: #FF7A00; border-color: #FF7A00; box-shadow: inset 0 0 0 2px #fff8ed; }
html.light-theme .nav-msg-person-mark { border-color: rgba(255,140,0,0.4); }
html.light-theme .nav-msg-add-members { border-color: rgba(255,140,0,0.35); background: rgba(255,122,0,0.06); color: #CC5000; }
html.light-theme .nav-msg-multi-count { color: #7A5A28; }
.nav-msg-thread { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0.75rem 0.8rem; display: flex; flex-direction: column; gap: 0.3rem; }
.nav-msg-day { align-self: center; margin: 0.4rem 0; padding: 0.15rem 0.6rem; border-radius: 999px; background: rgba(0,200,255,0.1); color: #7ACCE0; font-size: 0.68rem; font-weight: 700; }
.nav-msg-bubble {
    max-width: 82%; padding: 0.45rem 0.65rem 0.3rem; border-radius: 12px;
    font-size: 0.84rem; line-height: 1.4; white-space: pre-wrap; word-break: break-word;
    background: var(--msg-theirs, rgba(0,200,255,0.1)); color: var(--msg-theirs-fg, #E8F7FF);
    align-self: flex-start; border-bottom-left-radius: 4px;
    position: relative; padding-right: 1.5rem;
}
.nav-msg-bubble.mine {
    align-self: flex-end; color: var(--msg-mine-fg, #031018);
    background: linear-gradient(135deg, var(--msg-mine, #00C8FF), var(--msg-mine2, #00E676));
    border-bottom-left-radius: 12px; border-bottom-right-radius: 4px;
}
.nav-msg-bubble time { display: block; margin-top: 0.15rem; font-size: 0.64rem; color: inherit; opacity: 0.72; text-align: right; }
.nav-msg-bubble.naked, .nav-msg-bubble.naked.mine,
.nav-msg-bubble.sticker, .nav-msg-bubble.sticker.mine {
    background: transparent !important; padding: 0.15rem 1.55rem 0.1rem 0.15rem; box-shadow: none;
    color: inherit;
}
.nav-msg-bubble.naked time, .nav-msg-bubble.sticker time {
    color: #7ACCE0; opacity: 0.85; text-shadow: 0 1px 2px rgba(0,0,0,0.45);
}
.nav-msg-sticker { font-size: 3.1rem; line-height: 1.1; display: block; }
.nav-msg-sticker-img { display: block; width: 148px; max-width: 72vw; height: auto; max-height: 168px; object-fit: contain; }
.nav-msg-emoji-lg { font-size: 3.6rem; line-height: 1.15; display: block; }
.nav-msg-media { display: block; margin: 0.05rem 0 0.25rem; }
.nav-msg-media img, .nav-msg-media video {
    display: block; max-width: 220px; max-height: 220px; width: auto; height: auto;
    border-radius: 14px; cursor: pointer; background: rgba(0,0,0,0.25);
}
.nav-msg-media video { cursor: default; max-height: 200px; }
.nav-msg-file-card {
    display: flex; flex-direction: column; gap: 0.45rem; width: 100%; max-width: 280px;
    margin: 0.05rem 0 0.2rem;
}
.nav-msg-file {
    display: flex; align-items: center; gap: 0.65rem; width: 100%;
    padding: 0.55rem 0.7rem; border-radius: 10px;
    border: 1px solid rgba(0,200,255,0.28); background: rgba(0,12,24,0.45);
    color: inherit; text-align: left; font: inherit; cursor: pointer; text-transform: none;
}
.nav-msg-file:hover { border-color: #00C8FF; background: rgba(0,200,255,0.1); }
.nav-msg-file-ico {
    flex-shrink: 0; min-width: 36px; height: 36px; padding: 0 0.35rem; border-radius: 8px;
    display: inline-flex; align-items: center; justify-content: center;
    background: rgba(0,200,255,0.14); color: #00C8FF; font-size: 0.68rem; font-weight: 800;
    letter-spacing: 0.02em; text-transform: uppercase;
}
.nav-msg-file-meta { flex: 1; min-width: 0; }
.nav-msg-file-meta strong {
    display: block; font-size: 0.8rem; color: #E8F7FF;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nav-msg-file-meta span { display: block; font-size: 0.7rem; color: #7ACCE0; margin-top: 0.1rem; }
.nav-msg-file-preview {
    display: block; width: 100%; max-width: 280px; border-radius: 10px; overflow: hidden;
    border: 1px solid rgba(0,200,255,0.22); background: rgba(0,12,24,0.55);
    min-height: 72px; cursor: pointer;
}
.nav-msg-file-preview[hidden] { display: none !important; }
.nav-msg-file-preview.is-loading {
    display: flex; align-items: center; justify-content: center;
    color: #7ACCE0; font-size: 0.72rem; min-height: 88px;
}
.nav-msg-file-preview img,
.nav-msg-file-preview video,
.nav-msg-file-preview .nav-msg-pdf-page {
    display: block; width: 100%; max-height: 220px; object-fit: contain; background: #fff;
}
.nav-msg-file-preview img,
.nav-msg-file-preview video { background: #000; }
.nav-msg-file-preview iframe {
    display: block; width: 100%; height: 200px; border: 0; background: #fff;
}
.nav-msg-file-preview .nav-msg-pdf-pages {
    display: block; width: 100%; background: #fff; line-height: 0;
}
.nav-msg-file-preview .nav-msg-pdf-page {
    max-height: 220px; height: auto;
}
.nav-msg-file-preview .nav-msg-file-preview-fallback {
    padding: 0.85rem 0.9rem; color: #7ACCE0; font-size: 0.75rem; line-height: 1.35;
}
html.light-theme .nav-msg-file { border-color: rgba(255,140,0,0.3); background: rgba(255,248,237,0.85); }
html.light-theme .nav-msg-file:hover { border-color: #FF7A00; background: rgba(255,122,0,0.1); }
html.light-theme .nav-msg-file-ico { background: rgba(255,122,0,0.14); color: #CC5000; }
html.light-theme .nav-msg-file-meta strong { color: #2C1A00; }
html.light-theme .nav-msg-file-meta span { color: #8B5E00; }
html.light-theme .nav-msg-file-preview {
    border-color: rgba(255,140,0,0.28); background: rgba(255,248,237,0.9);
}
html.light-theme .nav-msg-file-preview.is-loading,
html.light-theme .nav-msg-file-preview .nav-msg-file-preview-fallback { color: #8B5E00; }
.nav-msg-bubble.naked .nav-msg-cap { margin-top: 0.2rem; font-size: 0.82rem; color: #C8E8F5; text-shadow: 0 1px 2px rgba(0,0,0,0.35); }
.nav-msg-cap { display: block; white-space: pre-wrap; }
.nav-msg-more {
    position: absolute; top: 2px; right: 4px; width: 20px; height: 20px; padding: 0;
    border: 0; border-radius: 6px; background: rgba(3,14,28,0.55); color: #C8F0E8;
    font: inherit; font-size: 0.9rem; line-height: 1; cursor: pointer; opacity: 0; transition: opacity 0.15s;
}
.nav-msg-bubble:hover .nav-msg-more, .nav-msg-bubble.menu-open .nav-msg-more { opacity: 1; }
.nav-msg-menu {
    position: fixed; z-index: 3200; min-width: 180px; padding: 0.3rem;
    background: #030E1C; border: 1px solid rgba(0,200,255,0.28); border-radius: 10px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.6);
}
.nav-msg-menu[hidden] { display: none !important; }
.nav-msg-menu button {
    display: block; width: 100%; padding: 0.5rem 0.7rem; border: 0; border-radius: 7px;
    background: transparent; color: #D6F3FF; font: inherit; font-size: 0.82rem; text-align: left;
    cursor: pointer; text-transform: none;
}
.nav-msg-menu button[hidden] { display: none !important; }
.nav-msg-menu button:hover { background: rgba(0,200,255,0.1); color: #00C8FF; }
.nav-msg-menu button.danger { color: #FF8A9A; }
.nav-msg-menu button.danger:hover { background: rgba(255,71,87,0.12); color: #FF6B7A; }
.nav-msg-confirm {
    position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center;
    background: rgba(3,14,28,0.86); padding: 1rem;
}
.nav-msg-confirm[hidden] { display: none !important; }
.nav-msg-confirm-box {
    width: 100%; max-width: 300px; padding: 1.1rem 1.2rem; border-radius: 12px;
    background: #030E1C; border: 1px solid rgba(0,200,255,0.28); box-shadow: 0 16px 40px rgba(0,0,0,0.6);
}
.nav-msg-confirm-box p { margin: 0 0 0.9rem; color: #C8F0E8; font-size: 0.88rem; line-height: 1.45; }
.nav-msg-confirm-btns { display: flex; gap: 0.5rem; justify-content: flex-end; }
.nav-msg-confirm-btns button {
    padding: 0.45rem 0.9rem; border-radius: 7px; font: inherit; font-size: 0.82rem; cursor: pointer; text-transform: none;
}
.nav-msg-confirm-btns .cancel { background: transparent; border: 1px solid rgba(0,200,255,0.3); color: #5ABBC8; }
.nav-msg-confirm-btns .ok { background: #FF4757; border: 1px solid #FF4757; color: #fff; font-weight: 700; }
html.light-theme .nav-msg-more { background: rgba(255,255,255,0.8); color: #5A3A10; }
html.light-theme .nav-msg-menu, html.light-theme .nav-msg-confirm-box { background: #fff8ed; border-color: rgba(255,140,0,0.28); }
html.light-theme .nav-msg-menu button { color: #2C1A00; }
html.light-theme .nav-msg-menu button:hover { background: rgba(255,122,0,0.1); color: #CC5000; }
html.light-theme .nav-msg-confirm { background: rgba(255,248,237,0.86); }
html.light-theme .nav-msg-confirm-box p { color: #2C1A00; }
html.light-theme .nav-msg-confirm-btns .cancel { color: #8B5E00; border-color: rgba(255,140,0,0.35); }
.nav-msg-preview {
    flex-shrink: 0; display: none; align-items: center; gap: 0.55rem;
    padding: 0.45rem 0.7rem; border-top: 1px solid rgba(0,200,255,0.12);
    background: rgba(0,200,255,0.06);
}
.nav-msg-preview.visible { display: flex; }
.nav-msg-preview-thumb {
    width: 44px; height: 44px; border-radius: 8px; object-fit: cover; background: #000; flex-shrink: 0;
}
.nav-msg-preview-meta { flex: 1; min-width: 0; font-size: 0.78rem; color: #7ACCE0; }
.nav-msg-preview-meta strong { display: block; color: #E8F7FF; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-msg-picker {
    flex-shrink: 0; display: none; flex-direction: column; height: 196px;
    border-top: 1px solid rgba(0,200,255,0.12); background: rgba(0,12,24,0.55);
}
.nav-msg-picker.visible { display: flex; }
.nav-msg-picker-tabs { display: flex; gap: 0; border-bottom: 1px solid rgba(0,200,255,0.12); }
.nav-msg-picker-tabs button {
    flex: 1; padding: 0.4rem; border: 0; background: transparent; color: #7ACCE0;
    font: inherit; font-size: 0.78rem; font-weight: 700; cursor: pointer; text-transform: none;
}
.nav-msg-picker-tabs button.active { color: #00C8FF; box-shadow: inset 0 -2px 0 #00C8FF; }
.nav-msg-fav-label {
    grid-column: 1 / -1; font-size: 0.68rem; font-weight: 700; color: #7ACCE0;
    padding: 0.25rem 0.15rem 0.1rem; text-transform: uppercase; letter-spacing: 0.04em;
}
.nav-msg-storage {
    margin: 0.55rem 0.8rem 0.35rem; padding: 0.55rem 0.7rem; border-radius: 10px;
    background: rgba(0,200,255,0.08); border: 1px solid rgba(0,200,255,0.2);
    cursor: pointer; transition: background 0.15s, border-color 0.15s;
    text-align: left; width: calc(100% - 1.6rem); box-sizing: border-box; font: inherit;
    display: block; color: inherit;
}
.nav-msg-storage:hover, .nav-msg-storage:focus-visible {
    background: rgba(0,200,255,0.14); border-color: rgba(0,200,255,0.45); outline: none;
}
.nav-msg-storage.over { background: rgba(255,71,87,0.12); border-color: rgba(255,71,87,0.4); }
.nav-msg-storage strong { display: block; color: #00C8FF; font-size: 0.78rem; margin-bottom: 0.25rem; }
.nav-msg-storage.over strong { color: #FF6B7A; }
.nav-msg-storage span { display: block; color: #7ACCE0; font-size: 0.72rem; margin-bottom: 0.35rem; }
.nav-msg-storage-hint { display: block; margin-top: 0.2rem; font-size: 0.68rem; color: #5ABBC8; }
.nav-msg-storage-bar { height: 6px; border-radius: 4px; background: rgba(0,0,0,0.35); overflow: hidden; }
.nav-msg-storage-bar i { display: block; height: 100%; background: linear-gradient(90deg,#00C8FF,#00E676); }
.nav-msg-storage.over .nav-msg-storage-bar i { background: linear-gradient(90deg,#FF4757,#FF8A9A); }
.nav-msg-admin-file {
    display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.8rem;
    border-bottom: 1px solid rgba(0,200,255,0.08); font-size: 0.78rem; color: #D6F3FF;
}
.nav-msg-admin-file button {
    margin-left: auto; border: 1px solid rgba(255,71,87,0.4); background: transparent;
    color: #FF8A9A; border-radius: 6px; font: inherit; font-size: 0.7rem; padding: 0.2rem 0.45rem;
    cursor: pointer; text-transform: none;
}
.nav-msg-fm-toolbar {
    display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;
    padding: 0.45rem 0.8rem; border-bottom: 1px solid rgba(0,200,255,0.12);
}
.nav-msg-fm-toolbar > button {
    border: 1px solid rgba(0,200,255,0.28); background: rgba(0,200,255,0.08); color: #7ACCE0;
    border-radius: 8px; font: inherit; font-size: 0.75rem; padding: 0.35rem 0.55rem; cursor: pointer;
}
.nav-msg-fm-sort { position: relative; margin-left: auto; }
.nav-msg-fm-sort-btn {
    display: inline-flex; align-items: center; gap: 0.45rem; max-width: 100%;
    border: 1px solid rgba(0,200,255,0.35); background: rgba(0,12,24,0.85); color: #E8F7FF;
    border-radius: 8px; font: inherit; font-size: 0.75rem; padding: 0.38rem 0.65rem; cursor: pointer;
    box-shadow: inset 0 0 0 1px rgba(0,200,255,0.06);
}
.nav-msg-fm-sort-btn:hover, .nav-msg-fm-sort.open .nav-msg-fm-sort-btn {
    border-color: #00C8FF; background: rgba(0,200,255,0.1); color: #00C8FF;
}
.nav-msg-fm-sort-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-msg-fm-sort-arrow { color: #00C8FF; font-size: 0.62rem; flex-shrink: 0; transition: transform 0.15s; }
.nav-msg-fm-sort.open .nav-msg-fm-sort-arrow { transform: rotate(180deg); }
.nav-msg-fm-sort-menu {
    position: absolute; top: calc(100% + 4px); right: 0; z-index: 8; min-width: 190px;
    padding: 0.3rem; background: #030E1C; border: 1px solid rgba(0,200,255,0.35);
    border-radius: 10px; box-shadow: 0 16px 40px rgba(0,0,0,0.65);
}
.nav-msg-fm-sort-menu[hidden] { display: none !important; }
.nav-msg-fm-sort-menu button {
    display: block; width: 100%; padding: 0.48rem 0.7rem; border: 0; border-radius: 7px;
    background: transparent; color: #D6F3FF; font: inherit; font-size: 0.8rem; text-align: left;
    cursor: pointer; text-transform: none;
}
.nav-msg-fm-sort-menu button:hover { background: rgba(0,200,255,0.1); color: #00C8FF; }
.nav-msg-fm-sort-menu button.active { background: rgba(0,200,255,0.16); color: #00C8FF; font-weight: 700; }
html.light-theme .nav-msg-fm-sort-btn {
    background: #fff8ed; border-color: rgba(255,140,0,0.35); color: #2C1A00;
}
html.light-theme .nav-msg-fm-sort-btn:hover, html.light-theme .nav-msg-fm-sort.open .nav-msg-fm-sort-btn {
    border-color: #FF8C00; background: rgba(255,122,0,0.1); color: #CC5000;
}
html.light-theme .nav-msg-fm-sort-arrow { color: #CC5000; }
html.light-theme .nav-msg-fm-sort-menu { background: #fff8ed; border-color: rgba(255,140,0,0.35); }
html.light-theme .nav-msg-fm-sort-menu button { color: #2C1A00; }
html.light-theme .nav-msg-fm-sort-menu button:hover { background: rgba(255,122,0,0.1); color: #CC5000; }
html.light-theme .nav-msg-fm-sort-menu button.active { background: rgba(255,122,0,0.16); color: #CC5000; }
.nav-msg-fm-row {
    display: grid; grid-template-columns: 1fr auto; gap: 0.35rem 0.6rem; align-items: center;
    width: 100%; padding: 0.55rem 0.8rem; border: 0; border-bottom: 1px solid rgba(0,200,255,0.08);
    background: transparent; color: #D6F3FF; text-align: left; font: inherit; cursor: pointer;
}
.nav-msg-fm-row:hover { background: rgba(0,200,255,0.08); }
.nav-msg-fm-row strong { display: block; color: #E8F7FF; font-size: 0.82rem; }
.nav-msg-fm-row .meta { display: block; color: #7ACCE0; font-size: 0.7rem; margin-top: 0.15rem; }
.nav-msg-fm-row .bytes { color: #00C8FF; font-size: 0.78rem; font-weight: 700; white-space: nowrap; }
.nav-msg-fm-actions { display: flex; gap: 0.35rem; grid-column: 1 / -1; }
.nav-msg-fm-actions button {
    border: 1px solid rgba(0,200,255,0.28); background: rgba(0,200,255,0.06); color: #7ACCE0;
    border-radius: 6px; font: inherit; font-size: 0.7rem; padding: 0.25rem 0.5rem; cursor: pointer;
}
.nav-msg-fm-actions button.danger { border-color: rgba(255,71,87,0.4); color: #FF8A9A; }
.nav-msg-fm-files { grid-column: 1 / -1; padding: 0.2rem 0 0.35rem; }
.nav-msg-fm-files[hidden] { display: none !important; }
.nav-msg-picker-grid { flex: 1; overflow: auto; display: grid; grid-template-columns: repeat(8, 1fr); gap: 0.15rem; padding: 0.4rem; }
.nav-msg-picker-grid[hidden] { display: none !important; }
.nav-msg-picker-grid button {
    border: 0; background: transparent; cursor: pointer; font-size: 1.35rem; line-height: 1.5;
    border-radius: 6px; padding: 0.1rem;
}
.nav-msg-picker-grid button:hover { background: rgba(0,200,255,0.12); }
.nav-msg-emoji-panel { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
.nav-msg-emoji-panel[hidden] { display: none !important; }
.nav-msg-emoji-recent {
    display: grid; grid-template-columns: repeat(8, 1fr); gap: 0.12rem;
    padding: 0.35rem 0.35rem 0.5rem; margin: 0; flex-shrink: 0;
    border-bottom: 1px solid rgba(0,200,255,0.28);
    background: rgba(3,14,28,0.96);
    position: sticky; top: 0; z-index: 2;
}
.nav-msg-emoji-recent[hidden] { display: none !important; }
.nav-msg-emoji-recent button, .nav-msg-picker-grid.emojis button {
    padding: 0.12rem; aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
    border: 0; background: transparent; cursor: pointer; border-radius: 6px;
}
.nav-msg-emoji-recent button:hover, .nav-msg-picker-grid.emojis button:hover { background: rgba(0,200,255,0.12); }
.nav-msg-emoji-recent img, .nav-msg-picker-grid.emojis img {
    width: 28px; height: 28px; object-fit: contain; display: block; pointer-events: none;
}
.nav-msg-emoji-cat { flex-shrink: 0; }
.nav-msg-emoji-cat-label {
    padding: 0.4rem 0.45rem 0.1rem; font-size: 0.66rem; font-weight: 700;
    color: #7ACCE0; letter-spacing: 0.03em; text-transform: uppercase;
}
.nav-msg-picker-grid.emojis {
    grid-template-columns: repeat(8, 1fr); gap: 0.12rem; padding: 0.25rem 0.35rem 0.45rem;
    flex: none; overflow: visible;
}
html.light-theme .nav-msg-emoji-recent { border-bottom-color: rgba(255,140,0,0.28); background: rgba(255,122,0,0.05); }
html.light-theme .nav-msg-emoji-cat-label { color: #CC5000; }
.nav-msg-picker-grid.stickers { grid-template-columns: repeat(6, 1fr); gap: 0.15rem; }
.nav-msg-picker-grid.stickers button { font-size: 1.55rem; padding: 0.15rem; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; }
.nav-msg-picker-grid.stickers img { width: 32px; height: 32px; object-fit: contain; display: block; pointer-events: none; }
.nav-msg-picker-empty { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; min-height: 8rem; padding: 1rem; text-align: center; color: var(--nav-msg-muted, #7a9bb5); font-size: 0.9rem; }
.nav-msg-attach {
    position: absolute; left: 0.55rem; bottom: 3.4rem; z-index: 4; min-width: 150px; padding: 0.3rem;
    background: #030E1C; border: 1px solid rgba(0,200,255,0.28); border-radius: 10px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.55);
}
.nav-msg-attach[hidden] { display: none !important; }
.nav-msg-attach button {
    display: block; width: 100%; padding: 0.5rem 0.7rem; border: 0; border-radius: 7px;
    background: transparent; color: #D6F3FF; font: inherit; font-size: 0.82rem; text-align: left;
    cursor: pointer; text-transform: none;
}
.nav-msg-attach button:hover { background: rgba(0,200,255,0.1); color: #00C8FF; }
.nav-msg-theme {
    position: absolute; inset: 0; z-index: 6; display: flex; align-items: flex-end; justify-content: center;
    background: rgba(3,14,28,0.72); padding: 0.7rem;
}
.nav-msg-theme[hidden] { display: none !important; }
.nav-msg-theme-box {
    width: 100%; padding: 0.9rem 1rem 1rem; border-radius: 12px;
    background: #030E1C; border: 1px solid rgba(0,200,255,0.28);
}
.nav-msg-theme-box h4 { margin: 0 0 0.7rem; color: #00C8FF; font-size: 0.88rem; }
.nav-msg-theme-presets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; margin-bottom: 0.75rem; }
.nav-msg-swatch {
    height: 36px; border-radius: 8px; border: 2px solid transparent; cursor: pointer; padding: 0;
}
.nav-msg-swatch.active { border-color: #fff; box-shadow: 0 0 0 2px #00C8FF; }
.nav-msg-theme-custom { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.7rem; }
.nav-msg-theme-custom label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.72rem; color: #7ACCE0; }
.nav-msg-theme-custom input[type="color"] { width: 100%; height: 32px; border: 0; background: transparent; cursor: pointer; padding: 0; }
.nav-msg-light {
    position: absolute; inset: 0; z-index: 80; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 0.55rem;
    background: #0b1724; padding: 0.55rem 0.55rem 0.65rem; cursor: pointer;
}
.nav-msg-light[hidden] { display: none !important; }
.nav-msg-light.is-pdf { justify-content: stretch; align-items: stretch; }
.nav-msg-light img, .nav-msg-light video, .nav-msg-light iframe {
    max-width: 100%; max-height: calc(100% - 3.5rem); border-radius: 8px; border: 0; background: #fff;
}
.nav-msg-light iframe { width: min(920px, 100%); height: min(78vh, 100%); cursor: default; }
.nav-msg-light .nav-msg-pdf-scroll {
    flex: 1; min-height: 0; width: 100%; max-height: none;
    overflow: auto; background: #5c5c5c; border-radius: 8px; padding: 0.7rem 0.55rem;
    display: flex; flex-direction: column; gap: 0.7rem; align-items: center; cursor: default;
}
.nav-msg-light .nav-msg-pdf-pages { width: 100%; max-width: 720px; }
.nav-msg-light .nav-msg-pdf-page {
    display: block; width: 100%; height: auto; background: #fff;
    box-shadow: 0 4px 18px rgba(0,0,0,0.35);
}
.nav-msg-light-bar {
    flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
    width: 100%; cursor: default;
}
.nav-msg-light-actions {
    display: flex; flex-wrap: wrap; gap: 0.45rem; justify-content: center; cursor: default;
}
.nav-msg-light-actions button, .nav-msg-light-actions a {
    padding: 0.45rem 0.9rem; border-radius: 8px; font: inherit; font-size: 0.8rem; font-weight: 700;
    cursor: pointer; text-decoration: none; border: 1px solid rgba(0,200,255,0.4);
    background: rgba(0,200,255,0.16); color: #00C8FF;
}
.nav-msg-light-actions .close-light {
    background: transparent; color: #C8F0E8; border-color: rgba(200,240,232,0.35);
}
.nav-msg-light-meta { color: #D6F3FF; font-size: 0.82rem; text-align: center; max-width: 90%; cursor: default; line-height: 1.4; }
.nav-msg-light-global[hidden] { display: none !important; }
html.light-theme .nav-msg-light { background: #2a2218; }
html.light-theme .nav-msg-light .nav-msg-pdf-scroll { background: #6a6358; }
html.light-theme .nav-msg-light-actions a, html.light-theme .nav-msg-light-actions button {
    border-color: rgba(255,200,140,0.45); background: #FF8C00; color: #fff;
}
html.light-theme .nav-msg-light-actions .close-light {
    background: rgba(255,248,237,0.14); color: #fff8ed; border-color: rgba(255,248,237,0.4);
}
html.light-theme .nav-msg-light-meta { color: #F3E2C8; }
.nav-msg-select-bar {
    display: none !important; align-items: center; gap: 0.45rem; flex: 1 1 auto; width: 100%; min-width: 0;
}
#navMsgPanel.selecting .nav-bell-panel-head { justify-content: flex-start; }
#navMsgPanel.selecting .nav-msg-head-left,
#navMsgPanel.selecting .nav-msg-head-actions { display: none !important; }
#navMsgPanel.selecting .nav-msg-select-bar { display: flex !important; }
.nav-msg-select-bar strong { color: #00C8FF; font-size: 0.82rem; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-msg-select-bar .sel-me, .nav-msg-select-bar .sel-all {
    border: 0; border-radius: 7px; padding: 0.35rem 0.6rem; font: inherit; font-size: 0.72rem; font-weight: 700;
    cursor: pointer; text-transform: none; white-space: nowrap;
}
.nav-msg-select-bar .sel-me { background: rgba(0,200,255,0.16); color: #00C8FF; }
.nav-msg-select-bar .sel-all { background: #FF4757; color: #fff; }
.nav-msg-select-bar .sel-all[hidden] { display: none !important; }
#navMsgPanel.selecting .nav-msg-bubble { cursor: pointer; padding-left: 1.85rem; }
#navMsgPanel.selecting .nav-msg-bubble.mine { padding-left: 0.65rem; padding-right: 1.85rem; }
#navMsgPanel.selecting .nav-msg-bubble::before {
    content: ''; position: absolute; left: 0.4rem; top: 50%; transform: translateY(-50%);
    width: 0.95rem; height: 0.95rem; border-radius: 50%; box-sizing: border-box;
    border: 2px solid rgba(0,200,255,0.75); background: transparent;
}
#navMsgPanel.selecting .nav-msg-bubble.mine::before { left: auto; right: 0.4rem; }
#navMsgPanel.selecting .nav-msg-bubble.selected::before {
    border-color: #00C8FF; background: #00C8FF;
    box-shadow: inset 0 0 0 2px #030E1C;
}
.nav-msg-bubble.selected { box-shadow: inset 0 0 0 2px #00C8FF !important; background: rgba(0,200,255,0.18) !important; }
.nav-msg-bubble.selected.mine { box-shadow: inset 0 0 0 2px #fff !important; }
.nav-msg-bubble.naked.selected, .nav-msg-bubble.sticker.selected {
    background: rgba(0,200,255,0.12) !important; border-radius: 12px;
}
.nav-msg-from { display: block; font-size: 0.78rem; font-weight: 800; color: #7EE8D8; margin: 0 0 0.22rem; line-height: 1.25; }
.nav-msg-bubble.mine .nav-msg-from { color: var(--msg-mine-fg, #031018); }
.nav-msg-bubble.archived {
    opacity: 1; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.22);
}
.nav-msg-archive-tag {
    display: inline-block; margin: 0 0 0.28rem; padding: 0.16rem 0.5rem; border-radius: 6px;
    font-size: 0.72rem; font-weight: 700; letter-spacing: 0.01em; text-transform: none; line-height: 1.25;
    background: #6B3A08; color: #FFF6E8;
}
.nav-msg-archive-tag.is-deleted { background: #6E1824; color: #FFE8EB; }
.nav-msg-group-avpick { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 0.75rem; }
.nav-msg-group-avpick .nav-msg-avatar { width: 52px; height: 52px; font-size: 1.1rem; }
.nav-msg-group-name {
    width: 100%; box-sizing: border-box; margin-bottom: 0.7rem; padding: 0.5rem 0.65rem;
    border-radius: 8px; border: 1px solid rgba(0,200,255,0.28); background: rgba(0,12,24,0.65);
    color: #E8F7FF; font: inherit; font-size: 0.84rem;
}
.nav-msg-member {
    display: flex; align-items: center; gap: 0.55rem; padding: 0.45rem 0; border-bottom: 1px solid rgba(0,200,255,0.08);
    font-size: 0.8rem; color: #D6F3FF;
}
.nav-msg-member .nav-msg-avatar { width: 28px; height: 28px; font-size: 0.7rem; }
.nav-msg-member-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-msg-role { font-size: 0.68rem; font-weight: 700; color: #00C8FF; margin-right: 0.3rem; white-space: nowrap; }
.nav-msg-member-actions { display: flex; flex-wrap: wrap; gap: 0.25rem; justify-content: flex-end; }
.nav-msg-member button {
    border: 1px solid rgba(0,200,255,0.3); background: transparent; color: #7ACCE0; border-radius: 6px;
    font: inherit; font-size: 0.68rem; padding: 0.2rem 0.45rem; cursor: pointer; text-transform: none;
}
.nav-msg-member-list { max-height: 220px; overflow: auto; margin: 0.4rem 0 0.7rem; }
html.light-theme .nav-msg-select-bar strong { color: #CC5000; }
html.light-theme .nav-msg-select-bar .sel-me { background: rgba(255,122,0,0.16); color: #CC5000; }
html.light-theme .nav-msg-from { color: #9A3B00; }
html.light-theme .nav-msg-bubble.mine .nav-msg-from { color: var(--msg-mine-fg, #1a0a00); }
html.light-theme .nav-msg-bubble.archived { box-shadow: inset 0 0 0 1px rgba(90,40,0,0.28); }
html.light-theme .nav-msg-archive-tag { background: #6B3200; color: #FFF8ED; }
html.light-theme .nav-msg-archive-tag.is-deleted { background: #7A1824; color: #FFF5F5; }
html.light-theme .nav-msg-group-name { background: #fff; color: #2C1A00; border-color: rgba(255,140,0,0.28); }
html.light-theme .nav-msg-member { color: #2C1A00; border-bottom-color: rgba(255,140,0,0.12); }
#navMsgPanel.nav-msg-panel { position: fixed !important; z-index: 3000; }
.nav-msg-compose {
    flex-shrink: 0; display: flex; gap: 0.35rem; align-items: flex-end;
    padding: 0.55rem 0.7rem 0.7rem; border-top: 1px solid rgba(0,200,255,0.12);
}
.nav-msg-compose textarea, .nav-msg-compose-input, .nav-msg-multi textarea {
    flex: 1; min-height: 38px; max-height: 120px; resize: none; box-sizing: border-box;
    border-radius: 10px; border: 1px solid rgba(0,200,255,0.28); background: rgba(0,12,24,0.65);
    color: #E8F7FF; font: inherit; font-size: 0.84rem; line-height: 1.35; padding: 0.5rem 0.65rem;
}
.nav-msg-compose-input {
    overflow-y: auto; white-space: pre-wrap; word-break: break-word;
    -webkit-user-select: text; user-select: text; cursor: text;
}
.nav-msg-compose-input.is-empty:before {
    content: attr(data-placeholder); color: rgba(122,204,224,0.55); pointer-events: none;
}
.nav-msg-compose-emoji {
    display: inline-block; width: 1.45em; height: 1.45em; vertical-align: -0.3em;
    object-fit: contain; margin: 0 0.05em;
}
.nav-msg-inline-emoji {
    display: inline-block; width: 1.35em; height: 1.35em; vertical-align: -0.28em;
    object-fit: contain; margin: 0 0.04em;
}
.nav-msg-inline-emoji.lg { width: 3.2rem; height: 3.2rem; vertical-align: middle; margin: 0.1rem; }
.nav-msg-compose textarea:focus, .nav-msg-compose-input:focus, .nav-msg-multi textarea:focus, .nav-msg-search:focus { outline: none; border-color: #00C8FF; }
.nav-msg-send {
    flex-shrink: 0; width: 38px; height: 38px; border: none; border-radius: 10px;
    background: linear-gradient(135deg,#00C8FF,#00E676); color: #030E1C; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
}
.nav-msg-send:disabled { opacity: 0.55; cursor: default; }
.nav-msg-send svg { width: 18px; height: 18px; fill: currentColor; }
.nav-msg-status { flex-shrink: 0; margin: 0; padding: 0 0.8rem 0.5rem; font-size: 0.76rem; color: #5EEAD4; min-height: 1em; }
.nav-msg-status.err { color: #FF8A9A; }
html.light-theme .nav-msg-icon-btn { color: #8B5E00; border-color: rgba(255,140,0,0.35); }
html.light-theme .nav-msg-icon-btn:hover { color: #CC5000; border-color: #CC5000; }
html.light-theme .nav-msg-search, html.light-theme .nav-msg-compose textarea, html.light-theme .nav-msg-compose-input, html.light-theme .nav-msg-multi textarea { background: #fff; color: #2C1A00; border-color: rgba(255,140,0,0.28); }
html.light-theme .nav-msg-compose-input.is-empty:before { color: rgba(139,94,0,0.45); }
html.light-theme .nav-msg-conv, html.light-theme .nav-msg-person { border-bottom-color: rgba(255,140,0,0.12); color: #2C1A00; }
html.light-theme .nav-msg-conv:hover, html.light-theme .nav-msg-person:hover { background: rgba(255,122,0,0.08); }
html.light-theme .nav-msg-conv-top strong { color: #2C1A00; }
html.light-theme .nav-msg-conv-top time, html.light-theme .nav-msg-conv-last span, html.light-theme .nav-msg-day, html.light-theme .nav-msg-bubble time { color: #7A5A28; }
html.light-theme .nav-msg-conv.unread .nav-msg-conv-last span, html.light-theme .nav-msg-conv.unread .nav-msg-conv-top strong { color: #CC5000; }
html.light-theme .nav-msg-avatar { background: rgba(255,122,0,0.14); color: #CC5000; }
html.light-theme .nav-msg-count {
    background: #FF7A00; color: #ffffff !important; -webkit-text-fill-color: #ffffff !important;
}
html.light-theme .nav-msg-day { background: rgba(255,122,0,0.12); }
html.light-theme .nav-msg-bubble { background: var(--msg-theirs, rgba(255,122,0,0.1)); color: var(--msg-theirs-fg, #2C1A00); }
html.light-theme .nav-msg-bubble.mine { background: linear-gradient(135deg, var(--msg-mine, #FF7A00), var(--msg-mine2, #FFCC00)); color: var(--msg-mine-fg, #1a0a00); }
html.light-theme .nav-msg-bubble.naked, html.light-theme .nav-msg-bubble.naked.mine,
html.light-theme .nav-msg-bubble.sticker, html.light-theme .nav-msg-bubble.sticker.mine {
    background: transparent !important; color: #2C1A00;
}
html.light-theme .nav-msg-bubble.naked time, html.light-theme .nav-msg-bubble.sticker time {
    color: #7A5A28; text-shadow: none;
}
html.light-theme .nav-msg-bubble.naked .nav-msg-cap { color: #2C1A00; text-shadow: none; }
html.light-theme .nav-msg-send, html.light-theme .nav-msg-continue { background: linear-gradient(135deg,#FF7A00,#FFCC00); color: #1a0a00; }
html.light-theme .nav-msg-compose, html.light-theme .nav-msg-multi, html.light-theme .nav-msg-preview, html.light-theme .nav-msg-picker { border-top-color: rgba(255,140,0,0.16); }
html.light-theme .nav-msg-preview { background: rgba(255,122,0,0.08); }
html.light-theme .nav-msg-preview-meta { color: #7A5A28; }
html.light-theme .nav-msg-preview-meta strong { color: #2C1A00; }
html.light-theme .nav-msg-picker { background: rgba(255,248,237,0.7); }
html.light-theme .nav-msg-picker-tabs { border-bottom-color: rgba(255,140,0,0.16); }
html.light-theme .nav-msg-picker-tabs button { color: #8B5E00; }
html.light-theme .nav-msg-picker-tabs button.active { color: #CC5000; box-shadow: inset 0 -2px 0 #CC5000; }
html.light-theme .nav-msg-attach, html.light-theme .nav-msg-theme-box { background: #fff8ed; border-color: rgba(255,140,0,0.28); }
html.light-theme .nav-msg-attach button { color: #2C1A00; }
html.light-theme .nav-msg-attach button:hover { background: rgba(255,122,0,0.1); color: #CC5000; }
html.light-theme .nav-msg-theme { background: rgba(255,248,237,0.78); }
html.light-theme .nav-msg-theme-box h4 { color: #CC5000; }
html.light-theme .nav-msg-theme-custom label { color: #7A5A28; }
html.light-theme .nav-msg-light { background: #2a2218; }
.nav-bell-item-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.nav-bell-del-one {
    padding: 0.3rem 0.7rem; font-size: 0.72rem; font-weight: 600; font-family: inherit;
    color: #FF8A9A; background: rgba(255,71,87,0.1); border: 1px solid rgba(255,71,87,0.35);
    border-radius: 6px; cursor: pointer;
}
.nav-bell-del-one:hover { background: rgba(255,71,87,0.2); border-color: rgba(255,71,87,0.55); }
.nav-bell-del-one:disabled, .nav-bell-mark-one:disabled { opacity: 0.5; cursor: wait; }
html.light-theme .nav-bell-del-one { color: #C62828; background: rgba(198,40,40,0.08); border-color: rgba(198,40,40,0.32); }
html.light-theme .nav-bell-del-one:hover { background: rgba(198,40,40,0.16); }
#navBellPanel.selecting .nav-bell-item-actions { display: none; }
#navBellPanel.selecting .nav-bell-item { cursor: pointer; }
#navBellPanel.selecting .nav-bell-item.selected {
    background: rgba(0,200,255,0.14);
    box-shadow: inset 3px 0 0 #00C8FF;
}
.nav-bell-select-bar {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem;
    padding: 0.55rem 0.85rem; border-bottom: 1px solid rgba(0,200,255,0.12);
    background: rgba(0,200,255,0.06);
}
.nav-bell-select-bar[hidden] { display: none !important; }
.nav-bell-select-count { color: #5EEAD4; font-size: 0.76rem; font-weight: 700; margin-right: auto; }
.nav-bell-select-actions { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.nav-bell-select-actions button {
    padding: 0.32rem 0.65rem; border-radius: 6px; font: inherit; font-size: 0.72rem; font-weight: 600;
    cursor: pointer; border: 1px solid rgba(0,200,255,0.32); background: rgba(0,200,255,0.1); color: #7ACCE0;
}
.nav-bell-select-actions button:hover { border-color: #00C8FF; color: #00C8FF; }
.nav-bell-select-actions button.danger {
    color: #FF8A9A; border-color: rgba(255,71,87,0.4); background: rgba(255,71,87,0.1);
}
.nav-bell-select-actions button.danger:hover { background: rgba(255,71,87,0.2); }
.nav-bell-confirm {
    position: fixed; inset: 0; z-index: 9200; display: flex; align-items: center; justify-content: center;
    padding: 1rem; background: rgba(3,14,28,0.72); backdrop-filter: blur(4px);
}
.nav-bell-confirm[hidden] { display: none !important; }
.nav-bell-confirm-box {
    width: min(400px, 100%); padding: 1.35rem 1.4rem 1.2rem; border-radius: 14px;
    background: linear-gradient(165deg, #0a1f3a 0%, #07182c 100%);
    border: 1px solid rgba(0,200,255,0.35);
    box-shadow: 0 20px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05);
    text-align: center;
}
.nav-bell-confirm-ico {
    width: 2.6rem; height: 2.6rem; margin: 0 auto 0.75rem; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; font-size: 1.25rem;
    background: rgba(255,71,87,0.14); border: 1px solid rgba(255,71,87,0.35);
}
.nav-bell-confirm-box p {
    margin: 0 0 1.1rem; color: #C8F0E8; font-size: 0.92rem; line-height: 1.45;
}
.nav-bell-confirm-btns { display: flex; gap: 0.55rem; justify-content: flex-end; }
.nav-bell-confirm-btns button {
    padding: 0.55rem 1.1rem; border-radius: 8px; font: inherit; font-size: 0.84rem; font-weight: 700; cursor: pointer;
}
.nav-bell-confirm-btns .cancel {
    background: transparent; border: 1px solid rgba(0,200,255,0.32); color: #7ACCE0;
}
.nav-bell-confirm-btns .ok {
    background: linear-gradient(135deg, #FF4757, #FF1744); border: none; color: #fff;
}
.nav-bell-undo {
    position: fixed; left: 50%; bottom: 1.35rem; transform: translateX(-50%);
    z-index: 9100; display: flex; align-items: center; gap: 0.85rem;
    max-width: calc(100vw - 2rem); padding: 0.75rem 1rem;
    border-radius: 12px; border: 1px solid rgba(0,200,255,0.35);
    background: linear-gradient(135deg, #0a2238, #07182c);
    box-shadow: 0 12px 36px rgba(0,0,0,0.45);
    color: #D6F3FF; font-size: 0.86rem; font-weight: 600;
    opacity: 1; transition: opacity 2.8s ease;
}
.nav-bell-undo[hidden] { display: none !important; }
.nav-bell-undo.is-fading { pointer-events: auto; }
.nav-bell-undo-btn {
    flex-shrink: 0; padding: 0.4rem 0.85rem; border-radius: 8px; cursor: pointer;
    border: 1px solid #00C8FF; background: rgba(0,200,255,0.16); color: #00C8FF;
    font: inherit; font-size: 0.8rem; font-weight: 700;
}
.nav-bell-undo-btn:hover { background: rgba(0,200,255,0.28); }
html.light-theme #navBellPanel.selecting .nav-bell-item.selected {
    background: rgba(255,122,0,0.12); box-shadow: inset 3px 0 0 #CC5000;
}
html.light-theme .nav-bell-select-bar {
    background: rgba(255,122,0,0.08); border-bottom-color: rgba(255,140,0,0.16);
}
html.light-theme .nav-bell-select-count { color: #B84800; }
html.light-theme .nav-bell-select-actions button {
    color: #8B5E00; border-color: rgba(204,80,0,0.28); background: rgba(255,122,0,0.08);
}
html.light-theme .nav-bell-select-actions button:hover { color: #CC5000; border-color: #CC5000; }
html.light-theme .nav-bell-select-actions button.danger {
    color: #C62828; border-color: rgba(198,40,40,0.32); background: rgba(198,40,40,0.08);
}
html.light-theme .nav-bell-confirm { background: rgba(44,26,0,0.45); }
html.light-theme .nav-bell-confirm-box {
    background: linear-gradient(165deg, #fff8ed, #f7efe3);
    border-color: rgba(204,80,0,0.32);
}
html.light-theme .nav-bell-confirm-box p { color: #2C1A00; }
html.light-theme .nav-bell-confirm-btns .cancel {
    color: #8B5E00; border-color: rgba(204,80,0,0.35);
}
html.light-theme .nav-bell-undo {
    background: linear-gradient(135deg, #fff8ed, #f3ebe0);
    border-color: rgba(204,80,0,0.35); color: #2C1A00;
}
html.light-theme .nav-bell-undo-btn {
    border-color: #CC5000; color: #CC5000; background: rgba(255,122,0,0.12);
}
`;

    const SEND_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a1 1 0 0 0-1.38 1.13L3.6 11l9.4 1-9.4 1-1.58 6.27a1 1 0 0 0 1.38 1.13z"/></svg>';
    const CLIP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.5 6.5v10.25a4.75 4.75 0 1 1-9.5 0V6.2a3.2 3.2 0 1 1 6.4 0v10.05a1.65 1.65 0 1 1-3.3 0V7.25h1.5v8.95a.15.15 0 0 0 .3 0V6.2a1.7 1.7 0 1 0-3.4 0v10.55a3.25 3.25 0 0 0 6.5 0V6.5h1.5z"/></svg>';
    const EMOJI_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-3.2 7.3a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4zm6.4 0a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4zM12 17.4A5.2 5.2 0 0 1 7.4 15l1.2-.9A3.7 3.7 0 0 0 12 16a3.7 3.7 0 0 0 3.4-1.9l1.2.9A5.2 5.2 0 0 1 12 17.4z"/></svg>';
    const PALETTE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3a9 9 0 0 0 0 18h.8a1.7 1.7 0 0 0 1.4-2.7 1.7 1.7 0 0 1 1.4-2.7H17a4 4 0 0 0 4-4A9 9 0 0 0 12 3zm-5 8.2A1.3 1.3 0 1 1 8.3 10 1.3 1.3 0 0 1 7 11.2zm3-3.5A1.3 1.3 0 1 1 11.3 6.4 1.3 1.3 0 0 1 10 7.7zm4 0A1.3 1.3 0 1 1 15.3 6.4 1.3 1.3 0 0 1 14 7.7zm3 3.5A1.3 1.3 0 1 1 18.3 10 1.3 1.3 0 0 1 17 11.2z"/></svg>';
    const EMOJI_PACK_BASE = '/emoji/';
    const PACK_STICKER_RE = /^[A-Za-z0-9_\-]+\.png$/i;
    /** Marker inline emoji pack: [[e:file.png]] (e legacy ⟦e:file.png⟧). */
    const PACK_EMOJI_MARK_RE = /(?:\u27E6e:([A-Za-z0-9_\-]+\.png)\u27E7|\[\[e:([A-Za-z0-9_\-]+\.png)\]\])/gi;
    const EMOJI_RECENT_KEY = 'criptogramEmojiRecent';
    const EMOJI_RECENT_MAX = 8;
    const THEME_PRESETS = [
        { id: 'cyan', mine: '#00C8FF', mine2: '#00E676', theirs: '#123A4A' },
        { id: 'green', mine: '#00E676', mine2: '#00C853', theirs: '#123A28' },
        { id: 'purple', mine: '#B388FF', mine2: '#7C4DFF', theirs: '#2A1848' },
        { id: 'orange', mine: '#FF7A00', mine2: '#FFCC00', theirs: '#4A2808' },
        { id: 'red', mine: '#FF5252', mine2: '#FF1744', theirs: '#4A1218' },
        { id: 'gold', mine: '#FFD54F', mine2: '#FFA000', theirs: '#3A2A08' },
        { id: 'pink', mine: '#FF80AB', mine2: '#F50057', theirs: '#4A1230' },
        { id: 'blue', mine: '#448AFF', mine2: '#2962FF', theirs: '#102848' },
    ];

    function ensureMsgStyles() {
        if (document.getElementById('navMsgStyles')) return;
        const style = document.createElement('style');
        style.id = 'navMsgStyles';
        style.textContent = MSG_STYLE;
        document.head.appendChild(style);
    }

    function ensureMsgUi() {
        const bell = document.getElementById('navBellWrap');
        if (!bell || !bell.parentElement || document.getElementById('navMsgWrap')) return !!document.getElementById('navMsgBtn');
        const li = document.createElement('li');
        li.id = 'navMsgWrap';
        li.className = 'nav-bell-wrap';
        li.innerHTML = '<button type="button" class="nav-bell-btn" id="navMsgBtn" aria-label="Criptogram" title="Criptogram">'
            + '<img src="/icons/line/chat.svg" alt="">'
            + '<span class="nav-bell-badge" id="navMsgBadge" hidden>0</span></button>';
        bell.parentElement.insertBefore(li, bell);
        const panel = document.createElement('div');
        panel.className = 'nav-bell-panel nav-msg-panel';
        panel.id = 'navMsgPanel';
        panel.hidden = true;
        panel.innerHTML = ''
            + '<div class="nav-bell-panel-head">'
            + '  <div class="nav-msg-head-left">'
            + '    <button type="button" class="nav-msg-icon-btn" id="navMsgBack" title="Indietro" aria-label="Indietro" hidden>&#8249;</button>'
            + '    <span class="nav-msg-avatar nav-msg-head-av" id="navMsgHeadAv" hidden></span>'
            + '    <strong id="navMsgTitle">Criptogram</strong>'
            + '  </div>'
            + '  <div class="nav-msg-head-actions">'
            + '    <button type="button" class="nav-bell-head-btn" id="navMsgAdminBtn" title="Archivio Criptogram" hidden>Archivio</button>'
            + '    <button type="button" class="nav-bell-head-btn" id="navMsgFsBtn" title="Vedi a schermo intero" aria-pressed="false">Schermo intero</button>'
            + '    <button type="button" class="nav-msg-icon-btn" id="navMsgThemeBtn" title="Tema chat" aria-label="Tema chat">' + PALETTE_SVG + '</button>'
            + '    <button type="button" class="nav-msg-icon-btn" id="navMsgNew" title="Nuova chat" aria-label="Nuova chat">+</button>'
            + '  </div>'
            + '  <div class="nav-msg-select-bar" id="navMsgSelectBar">'
            + '    <button type="button" class="nav-msg-icon-btn" id="navMsgSelectCancel" title="Annulla selezione" aria-label="Annulla selezione">×</button>'
            + '    <strong id="navMsgSelectCount">0 selezionati</strong>'
            + '    <button type="button" class="sel-me" id="navMsgSelectMe">Elimina per me</button>'
            + '    <button type="button" class="sel-all" id="navMsgSelectAll">Elimina per tutti</button>'
            + '  </div>'
            + '</div>'
            + '<div class="nav-msg-view" id="navMsgViewList">'
            + '  <div class="nav-msg-scroll" id="navMsgConvs"><div class="nav-bell-empty">Caricamento…</div></div>'
            + '</div>'
            + '<div class="nav-msg-view" id="navMsgViewNew" hidden>'
            + '  <button type="button" class="nav-msg-new-group-btn" id="navMsgNewGroupBtn">'
            + '    <span class="nav-msg-avatar" aria-hidden="true">+</span>'
            + '    <span>Nuovo Gruppo</span>'
            + '  </button>'
            + '  <input class="nav-msg-search" id="navMsgSearch" type="search" placeholder="Cerca un utente" autocomplete="off">'
            + '  <div class="nav-msg-scroll" id="navMsgPeople"></div>'
            + '  <div class="nav-msg-multi" id="navMsgMulti">'
            + '    <span class="nav-msg-multi-count" id="navMsgGroupPickCount">0 selezionati</span>'
            + '    <button type="button" class="nav-msg-continue" id="navMsgCreateGroup">Continua</button>'
            + '  </div>'
            + '  <p class="nav-msg-status" id="navMsgNewStatus"></p>'
            + '</div>'
            + '<div class="nav-msg-view" id="navMsgViewChat" hidden>'
            + '  <div class="nav-msg-thread" id="navMsgThread"></div>'
            + '  <div class="nav-msg-preview" id="navMsgPreview">'
            + '    <img class="nav-msg-preview-thumb" id="navMsgPreviewThumb" alt="">'
            + '    <div class="nav-msg-preview-meta"><strong id="navMsgPreviewName">File</strong><span id="navMsgPreviewKind">Allegato</span></div>'
            + '    <button type="button" class="nav-msg-icon-btn" id="navMsgPreviewClear" title="Rimuovi allegato" aria-label="Rimuovi allegato">×</button>'
            + '  </div>'
            + '  <div class="nav-msg-picker" id="navMsgPicker">'
            + '    <div class="nav-msg-picker-tabs">'
            + '      <button type="button" class="active" data-tab="emoji">Emoji</button>'
            + '      <button type="button" data-tab="sticker">Sticker</button>'
            + '    </div>'
            + '    <div class="nav-msg-emoji-panel" id="navMsgEmojiGrid"></div>'
            + '    <div class="nav-msg-picker-grid stickers" id="navMsgStickerGrid" hidden></div>'
            + '  </div>'
            + '  <div class="nav-msg-compose">'
            + '    <button type="button" class="nav-msg-icon-btn" id="navMsgAttachBtn" title="Allega" aria-label="Allega foto, video o documento">' + CLIP_SVG + '</button>'
            + '    <button type="button" class="nav-msg-icon-btn" id="navMsgEmojiBtn" title="Emoji e sticker" aria-label="Emoji e sticker">' + EMOJI_SVG + '</button>'
            + '    <div id="navMsgText" class="nav-msg-compose-input is-empty" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Messaggio" spellcheck="true"></div>'
            + '    <button type="button" class="nav-msg-send" id="navMsgSend" title="Invia" aria-label="Invia">' + SEND_SVG + '</button>'
            + '    <input type="file" id="navMsgFileImage" accept="image/jpeg,image/png,image/webp,image/gif" hidden>'
            + '    <input type="file" id="navMsgFileVideo" accept="video/mp4,video/webm,video/quicktime" hidden>'
            + '    <input type="file" id="navMsgFileDoc" hidden>'
            + '  </div>'
            + '  <div class="nav-msg-attach" id="navMsgAttachMenu" hidden>'
            + '    <button type="button" data-att="image">Foto/GIF</button>'
            + '    <button type="button" data-att="video">Video</button>'
            + '    <button type="button" data-att="file">Documenti</button>'
            + '  </div>'
            + '  <p class="nav-msg-status" id="navMsgStatus"></p>'
            + '</div>'
            + '<div class="nav-msg-theme" id="navMsgTheme" hidden>'
            + '  <div class="nav-msg-theme-box">'
            + '    <h4>Tema di Criptogram</h4>'
            + '    <div class="nav-msg-theme-presets" id="navMsgThemePresets"></div>'
            + '    <div class="nav-msg-theme-custom">'
            + '      <label>I tuoi messaggi<input type="color" id="navMsgColorMine" value="#00C8FF"></label>'
            + '      <label>Ricevuti<input type="color" id="navMsgColorTheirs" value="#123A4A"></label>'
            + '    </div>'
            + '  </div>'
            + '</div>'
            + '<div class="nav-msg-theme" id="navMsgGroupForm" hidden>'
            + '  <div class="nav-msg-theme-box">'
            + '    <h4>Nuovo gruppo</h4>'
            + '    <div class="nav-msg-group-avpick">'
            + '      <span class="nav-msg-avatar" id="navMsgGroupAvPreview">GR</span>'
            + '      <button type="button" class="nav-msg-icon-btn" id="navMsgGroupAvBtn" style="width:auto;padding:0 0.7rem;font-size:0.78rem;">Scegli immagine</button>'
            + '      <input type="file" id="navMsgGroupAvFile" accept="image/jpeg,image/png,image/webp" hidden>'
            + '    </div>'
            + '    <input class="nav-msg-group-name" id="navMsgGroupName" maxlength="60" placeholder="Nome del gruppo">'
            + '    <p class="nav-msg-status" id="navMsgGroupFormStatus"></p>'
            + '    <div class="nav-msg-confirm-btns">'
            + '      <button type="button" class="cancel" id="navMsgGroupCancel">Annulla</button>'
            + '      <button type="button" class="ok" id="navMsgGroupOk" style="background:linear-gradient(135deg,#00C8FF,#00E676);border:0;color:#031018;">Crea</button>'
            + '    </div>'
            + '  </div>'
            + '</div>'
            + '<div class="nav-msg-theme" id="navMsgGroupInfo" hidden>'
            + '  <div class="nav-msg-theme-box">'
            + '    <h4 id="navMsgGroupInfoTitle">Gruppo</h4>'
            + '    <div class="nav-msg-group-avpick">'
            + '      <span class="nav-msg-avatar" id="navMsgGroupInfoAv">GR</span>'
            + '      <button type="button" class="nav-msg-icon-btn" id="navMsgGroupInfoAvBtn" style="width:auto;padding:0 0.7rem;font-size:0.78rem;display:none;">Cambia immagine</button>'
            + '      <input type="file" id="navMsgGroupInfoAvFile" accept="image/jpeg,image/png,image/webp" hidden>'
            + '    </div>'
            + '    <input class="nav-msg-group-name" id="navMsgGroupInfoName" maxlength="60" placeholder="Nome del gruppo">'
            + '    <button type="button" class="nav-msg-add-members" id="navMsgGroupAddBtn" hidden>Aggiungi partecipanti</button>'
            + '    <div class="nav-msg-add-list" id="navMsgGroupAddList" hidden></div>'
            + '    <div class="nav-msg-member-list" id="navMsgGroupMembers"></div>'
            + '    <button type="button" class="nav-msg-leave-group" id="navMsgGroupLeave">Esci dal gruppo</button>'
            + '    <p class="nav-msg-status" id="navMsgGroupInfoStatus"></p>'
            + '    <div class="nav-msg-confirm-btns">'
            + '      <button type="button" class="cancel" id="navMsgGroupInfoClose">Chiudi</button>'
            + '      <button type="button" class="ok" id="navMsgGroupInfoSave" style="background:linear-gradient(135deg,#00C8FF,#00E676);border:0;color:#031018;display:none;">Salva nome</button>'
            + '    </div>'
            + '  </div>'
            + '</div>'
            + '<div class="nav-msg-view" id="navMsgViewAdmin" hidden>'
            + '  <button type="button" class="nav-msg-storage" id="navMsgStorage" title="Apri file manager">'
            + '    <strong>Spazio allegati</strong>'
            + '    <span id="navMsgStorageLabel">—</span>'
            + '    <div class="nav-msg-storage-bar"><i id="navMsgStorageBar" style="width:0%"></i></div>'
            + '    <em class="nav-msg-storage-hint">Clicca per aprire il file manager</em>'
            + '  </button>'
            + '  <div id="navMsgAdminMain">'
            + '    <div class="nav-msg-picker-tabs" style="border-top:1px solid rgba(0,200,255,0.12);">'
            + '      <button type="button" class="active" data-admin-tab="chats">Chat</button>'
            + '      <button type="button" data-admin-tab="files">Allegati</button>'
            + '    </div>'
            + '    <div class="nav-msg-scroll" id="navMsgAdminChats"><div class="nav-bell-empty">Caricamento…</div></div>'
            + '    <div class="nav-msg-scroll" id="navMsgAdminFiles" hidden></div>'
            + '  </div>'
            + '  <div id="navMsgAdminFm" hidden>'
            + '    <div class="nav-msg-fm-toolbar">'
            + '      <button type="button" id="navMsgFmBack">← Archivio</button>'
            + '      <div class="nav-msg-fm-sort" id="navMsgFmSort">'
            + '        <button type="button" class="nav-msg-fm-sort-btn" id="navMsgFmSortBtn" aria-haspopup="listbox" aria-expanded="false" aria-label="Ordina chat">'
            + '          <span id="navMsgFmSortLabel">Spazio occupato</span>'
            + '          <span class="nav-msg-fm-sort-arrow" aria-hidden="true">▾</span>'
            + '        </button>'
            + '        <div class="nav-msg-fm-sort-menu" id="navMsgFmSortMenu" hidden role="listbox">'
            + '          <button type="button" role="option" data-sort="bytes" class="active">Spazio occupato</button>'
            + '          <button type="button" role="option" data-sort="label">Nome A–Z</button>'
            + '          <button type="button" role="option" data-sort="messages">N. messaggi</button>'
            + '          <button type="button" role="option" data-sort="attachments">N. allegati</button>'
            + '          <button type="button" role="option" data-sort="lastAt">Ultima attività</button>'
            + '        </div>'
            + '      </div>'
            + '    </div>'
            + '    <div class="nav-msg-scroll" id="navMsgFmList"><div class="nav-bell-empty">Caricamento…</div></div>'
            + '  </div>'
            + '</div>'
            + '<div class="nav-msg-light" id="navMsgLight" hidden></div>'
            + '<div class="nav-msg-confirm" id="navMsgConfirm" hidden>'
            + '  <div class="nav-msg-confirm-box">'
            + '    <p id="navMsgConfirmText"></p>'
            + '    <div class="nav-msg-confirm-btns">'
            + '      <button type="button" class="cancel" id="navMsgConfirmCancel">Annulla</button>'
            + '      <button type="button" class="ok" id="navMsgConfirmOk">Elimina</button>'
            + '    </div>'
            + '  </div>'
            + '</div>';
        document.body.appendChild(panel);
        const menu = document.createElement('div');
        menu.className = 'nav-msg-menu';
        menu.id = 'navMsgMenu';
        menu.hidden = true;
        menu.innerHTML = '<button type="button" data-act="select">Seleziona</button>'
            + '<button type="button" data-act="save" id="navMsgMenuSave" hidden>Salva</button>'
            + '<button type="button" data-act="fav" id="navMsgMenuFav" hidden>Aggiungi ai preferiti</button>'
            + '<button type="button" data-scope="me">Elimina per me</button>'
            + '<button type="button" class="danger" data-scope="all" id="navMsgMenuAll">Elimina per tutti</button>'
            + '<button type="button" class="danger" data-act="admin-del" id="navMsgMenuAdminDel" hidden>Elimina (Super Admin)</button>';
        document.body.appendChild(menu);
        const convMenu = document.createElement('div');
        convMenu.className = 'nav-msg-menu';
        convMenu.id = 'navMsgConvMenu';
        convMenu.hidden = true;
        convMenu.innerHTML = '<button type="button" class="danger" data-conv-act="delete" id="navMsgConvDelete">Elimina chat</button>';
        document.body.appendChild(convMenu);
        return true;
    }

    function initNavMessages() {
        ensureMsgStyles();
        if (!ensureMsgUi()) return;
        const btn = document.getElementById('navMsgBtn');
        const panel = document.getElementById('navMsgPanel');
        if (!btn || !panel || btn.dataset.wired) return;
        btn.dataset.wired = '1';

        const el = (id) => document.getElementById(id);
        const views = { list: el('navMsgViewList'), new: el('navMsgViewNew'), chat: el('navMsgViewChat'), admin: el('navMsgViewAdmin') };
        const titleEl = el('navMsgTitle');
        const headAv = el('navMsgHeadAv');
        const backBtn = el('navMsgBack');
        const newBtn = el('navMsgNew');
        const fsBtn = el('navMsgFsBtn');
        const adminBtn = el('navMsgAdminBtn');
        let msgFullscreen = false;
        const themeBtn = el('navMsgThemeBtn');
        const convsEl = el('navMsgConvs');
        const peopleEl = el('navMsgPeople');
        const searchEl = el('navMsgSearch');
        const multiEl = el('navMsgMulti');
        const newGroupBtn = el('navMsgNewGroupBtn');
        const groupPickCount = el('navMsgGroupPickCount');
        const newStatus = el('navMsgNewStatus');
        const threadEl = el('navMsgThread');
        const textEl = el('navMsgText');
        const sendBtn = el('navMsgSend');
        const statusEl = el('navMsgStatus');
        const pickerEl = el('navMsgPicker');
        const emojiGrid = el('navMsgEmojiGrid');
        const stickerGrid = el('navMsgStickerGrid');
        const attachBtn = el('navMsgAttachBtn');
        const emojiBtn = el('navMsgEmojiBtn');
        const attachMenu = el('navMsgAttachMenu');
        const previewEl = el('navMsgPreview');
        const previewThumb = el('navMsgPreviewThumb');
        const previewName = el('navMsgPreviewName');
        const previewKind = el('navMsgPreviewKind');
        const fileImage = el('navMsgFileImage');
        const fileVideo = el('navMsgFileVideo');
        const fileDoc = el('navMsgFileDoc');
        const themePanel = el('navMsgTheme');
        const lightEl = el('navMsgLight');
        const adminChatsEl = el('navMsgAdminChats');
        const adminFilesEl = el('navMsgAdminFiles');
        const adminMainEl = el('navMsgAdminMain');
        const adminFmEl = el('navMsgAdminFm');
        const fmListEl = el('navMsgFmList');
        const fmSortWrap = el('navMsgFmSort');
        const fmSortBtn = el('navMsgFmSortBtn');
        const fmSortMenu = el('navMsgFmSortMenu');
        const fmSortLabel = el('navMsgFmSortLabel');
        const storageBox = el('navMsgStorage');
        let fmChats = [];
        let fmExpanded = '';
        let fmSortMode = 'bytes';

        let directory = [];
        let selected = new Set();
        let creatingGroup = false;
        let groupInfoCache = null;
        let addingMembersOpen = false;
        let addMemberPick = new Set();
        let view = 'list';
        let peer = null;
        let lastRenderedKey = '';
        let pollTimer = null;
        let pendingMedia = null;
        let pendingGroupImage = '';
        let selectedMsgs = new Map();
        let selecting = false;
        let favoriteStickers = [];
        let emojiPackFiles = null;
        let emojiPackCategories = null;
        let emojiPackBase = EMOJI_PACK_BASE;
        let isSuperadmin = false;
        let adminMode = false;
        let chatTheme = THEME_PRESETS[0];
        const attCache = new Map();

        function initials(label) {
            const base = String(label || '').split('·')[0].trim();
            const parts = base.split(/\s+/).filter(Boolean);
            const s = (parts[0] || '?').charAt(0) + (parts[1] ? parts[1].charAt(0) : '');
            return s.toUpperCase();
        }

        function fmtTime(iso) {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return '';
            return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        }

        function fmtListTime(iso) {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return '';
            const today = new Date();
            const sameDay = d.toDateString() === today.toDateString();
            if (sameDay) return fmtTime(iso);
            return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
        }

        function dayLabel(iso) {
            const d = new Date(iso);
            const today = new Date();
            const y = new Date(); y.setDate(today.getDate() - 1);
            if (d.toDateString() === today.toDateString()) return 'Oggi';
            if (d.toDateString() === y.toDateString()) return 'Ieri';
            return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
        }

        function setBadge(count) {
            const badge = el('navMsgBadge');
            if (!badge) return;
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : String(count);
                badge.removeAttribute('hidden');
                badge.classList.add('visible');
                btn.classList.add('has-alerts');
            } else {
                badge.hidden = true;
                badge.classList.remove('visible');
                btn.classList.remove('has-alerts');
            }
        }

        // ── Notifiche desktop Windows (Web Notification API) ─────────────────
        let notifBaselineReady = false;
        const notifPeerSnap = new Map(); // peerId -> { unread, lastAt }
        const notifShownKeys = new Set();

        async function ensureDesktopNotifPermission() {
            if (typeof Notification === 'undefined') return false;
            if (Notification.permission === 'granted') return true;
            if (Notification.permission === 'denied') return false;
            try {
                const p = await Notification.requestPermission();
                return p === 'granted';
            } catch {
                return false;
            }
        }

        function canShowDesktopNotif(peerId) {
            if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
            const lookingAtChat = !panel.hidden && view === 'chat' && peer && peer.id === peerId
                && document.visibilityState === 'visible' && document.hasFocus();
            return !lookingAtChat;
        }

        function showDesktopNotif(conv) {
            if (!conv || !canShowDesktopNotif(conv.peerId)) return;
            const key = String(conv.peerId) + '|' + String(conv.lastAt || '') + '|' + String(conv.unread || 0);
            if (notifShownKeys.has(key)) return;
            notifShownKeys.add(key);
            if (notifShownKeys.size > 80) {
                const first = notifShownKeys.values().next().value;
                notifShownKeys.delete(first);
            }
            const title = conv.peerLabel || 'Criptogram';
            let body = String(conv.lastBody || '').trim();
            if (conv.lastMine) body = body ? ('Tu: ' + body) : 'Nuovo messaggio';
            if (!body) body = conv.isGroup ? 'Nuovo messaggio nel gruppo' : 'Nuovo messaggio';
            if (body.length > 140) body = body.slice(0, 137) + '…';
            try {
                const n = new Notification(title, {
                    body,
                    tag: 'criptogram-' + conv.peerId,
                    renotify: true,
                    silent: false,
                    icon: '/icons/line/chat.svg',
                });
                n.onclick = () => {
                    try { window.focus(); } catch { /* ignore */ }
                    if (typeof closeNavBell === 'function') closeNavBell();
                    applyMsgFullscreen(false);
                    panel.hidden = false;
                    panel.classList.add('open');
                    btn.classList.add('open');
                    position();
                    openChat(conv.peerId, conv.peerLabel, { isGroup: !!conv.isGroup });
                    try { n.close(); } catch { /* ignore */ }
                };
            } catch { /* ignore */ }
        }

        function processIncomingNotifs(conversations) {
            const list = Array.isArray(conversations) ? conversations : [];
            if (!notifBaselineReady) {
                list.forEach((c) => {
                    notifPeerSnap.set(String(c.peerId), {
                        unread: Number(c.unread) || 0,
                        lastAt: String(c.lastAt || ''),
                    });
                });
                notifBaselineReady = true;
                return;
            }
            list.forEach((c) => {
                const id = String(c.peerId);
                const unread = Number(c.unread) || 0;
                const lastAt = String(c.lastAt || '');
                const prev = notifPeerSnap.get(id) || { unread: 0, lastAt: '' };
                notifPeerSnap.set(id, { unread, lastAt });
                if (unread <= 0 || c.lastMine) return;
                const isNew = unread > prev.unread || (lastAt && lastAt !== prev.lastAt && unread > 0);
                if (isNew) showDesktopNotif(c);
            });
        }

        function setStatus(target, text, err) {
            target.textContent = text || '';
            target.className = 'nav-msg-status' + (err ? ' err' : '');
        }

        function fgFor(hex) {
            const n = parseInt(String(hex || '').replace('#', ''), 16);
            if (!Number.isFinite(n)) return '#E8F7FF';
            const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
            return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#031018' : '#E8F7FF';
        }

        function applyTheme(t) {
            if (!t) return;
            chatTheme = t;
            panel.style.setProperty('--msg-mine', t.mine);
            panel.style.setProperty('--msg-mine2', t.mine2 || t.mine);
            panel.style.setProperty('--msg-theirs', t.theirs);
            panel.style.setProperty('--msg-mine-fg', fgFor(t.mine2 || t.mine));
            panel.style.setProperty('--msg-theirs-fg', fgFor(t.theirs));
        }

        let themeSaveTimer = null;
        async function persistTheme() {
            try {
                const res = await fetch('/api/auth/messages/theme', {
                    method: 'PUT',
                    headers: authHeader(),
                    body: JSON.stringify({ theme: chatTheme }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Tema non salvato.');
                if (data.theme) applyTheme(data.theme);
            } catch (err) {
                setStatus(statusEl, err.message || 'Tema non salvato.', true);
            }
        }

        function chooseTheme(t, opts) {
            applyTheme(t);
            fillThemePresets();
            if (themeSaveTimer) clearTimeout(themeSaveTimer);
            const delay = (opts && opts.immediate) ? 0 : 250;
            themeSaveTimer = setTimeout(() => {
                themeSaveTimer = null;
                persistTheme();
            }, delay);
        }

        function closeExtras() {
            if (attachMenu) attachMenu.hidden = true;
            if (pickerEl) pickerEl.classList.remove('visible');
            if (themePanel) themePanel.hidden = true;
            if (lightEl) { lightEl.hidden = true; lightEl.innerHTML = ''; }
            const gf = el('navMsgGroupForm'); if (gf) gf.hidden = true;
            const gi = el('navMsgGroupInfo'); if (gi) gi.hidden = true;
        }

        function clearPending() {
            if (pendingMedia && pendingMedia.url) URL.revokeObjectURL(pendingMedia.url);
            pendingMedia = null;
            if (previewEl) previewEl.classList.remove('visible');
            if (fileImage) fileImage.value = '';
            if (fileVideo) fileVideo.value = '';
            if (fileDoc) fileDoc.value = '';
        }

        function showView(next, title) {
            view = next;
            Object.keys(views).forEach((k) => { if (views[k]) views[k].hidden = k !== next; });
            backBtn.hidden = next === 'list';
            newBtn.hidden = next !== 'list';
            themeBtn.hidden = !(next === 'list' || next === 'chat');
            if (adminBtn) adminBtn.hidden = !(isSuperadmin && next === 'list');
            if (fsBtn) fsBtn.hidden = next === 'admin' ? false : false;
            titleEl.textContent = title || (next === 'new' ? (creatingGroup ? 'Nuovo gruppo' : 'Nuova chat') : (next === 'admin' ? 'Archivio Criptogram' : 'Criptogram'));
            closeExtras();
            exitSelect();
            if (next !== 'new') {
                creatingGroup = false;
                selected = new Set();
                if (multiEl) multiEl.classList.remove('visible');
                if (newGroupBtn) newGroupBtn.classList.remove('active');
            }
            if (next !== 'chat') {
                if (next !== 'admin') peer = null;
                lastRenderedKey = ''; headAv.hidden = true;
                clearPending();
                addingMembersOpen = false;
                addMemberPick = new Set();
                groupInfoCache = null;
            }
            // Mantieni adminMode in chat se stiamo leggendo dall'archivio Super Admin
            if (next !== 'admin' && !(next === 'chat' && peer && peer.admin)) adminMode = false;
        }

        function setHeadAvatar(id, label, version, kind) {
            headAv.hidden = false;
            headAv.classList.remove('has-img');
            headAv.textContent = initials(label);
            headAv.setAttribute('data-av-kind', kind === 'group' ? 'group' : 'user');
            headAv.setAttribute('data-av-id', id);
            headAv.setAttribute('data-av-ver', String(Number(version) || 0));
            hydrateAvatars(headAv.parentElement);
        }

        function exitSelect() {
            selecting = false;
            selectedMsgs = new Map();
            panel.classList.remove('selecting');
            if (threadEl) threadEl.querySelectorAll('.nav-msg-bubble.selected').forEach((b) => b.classList.remove('selected'));
            refreshSelectBar();
        }

        function refreshSelectBar() {
            const n = selectedMsgs.size;
            selecting = n > 0;
            panel.classList.toggle('selecting', selecting);
            const countEl = el('navMsgSelectCount');
            const allBtn = el('navMsgSelectAll');
            const bar = el('navMsgSelectBar');
            if (countEl) countEl.textContent = n === 1 ? '1 selezionato' : n + ' selezionati';
            let hasMine = false;
            selectedMsgs.forEach((mine) => { if (mine) hasMine = true; });
            if (allBtn) {
                allBtn.hidden = !hasMine;
                allBtn.style.display = hasMine ? '' : 'none';
            }
            if (bar) bar.setAttribute('aria-hidden', selecting ? 'false' : 'true');
        }

        function findBubbleById(id) {
            const sid = String(id || '');
            if (!sid || !threadEl) return null;
            try {
                if (typeof CSS !== 'undefined' && CSS.escape) {
                    return threadEl.querySelector('.nav-msg-bubble[data-mid="' + CSS.escape(sid) + '"]');
                }
            } catch { /* ignore */ }
            return [...threadEl.querySelectorAll('.nav-msg-bubble')].find((b) => b.getAttribute('data-mid') === sid) || null;
        }

        function toggleSelect(bubble) {
            if (!bubble) return;
            const id = String(bubble.getAttribute('data-mid') || '');
            if (!id) return;
            const mine = bubble.getAttribute('data-mine') === '1';
            if (selectedMsgs.has(id)) {
                selectedMsgs.delete(id);
                bubble.classList.remove('selected');
            } else {
                selectedMsgs.set(id, mine);
                bubble.classList.add('selected');
            }
            refreshSelectBar();
        }

        function enterSelect(bubble) {
            if (!bubble) return;
            const id = String(bubble.getAttribute('data-mid') || '');
            if (!id) return;
            if (!selectedMsgs.has(id)) {
                selectedMsgs.set(id, bubble.getAttribute('data-mine') === '1');
                bubble.classList.add('selected');
            }
            refreshSelectBar();
        }

        function autosize(ta) {
            if (!ta) return;
            ta.style.height = 'auto';
            ta.style.height = Math.min(120, Math.max(38, ta.scrollHeight)) + 'px';
        }

        function composeGetRaw() {
            let out = '';
            let blockPending = false;
            const walk = (node) => {
                if (!node) return;
                if (node.nodeType === 3) {
                    out += node.nodeValue || '';
                    return;
                }
                if (node.nodeType !== 1) return;
                const tag = node.tagName;
                if (tag === 'IMG') {
                    const name = node.getAttribute('data-pack-emoji') || '';
                    if (PACK_STICKER_RE.test(name)) out += '[[e:' + name + ']]';
                    return;
                }
                if (tag === 'BR') { out += '\n'; blockPending = false; return; }
                if (tag === 'DIV' || tag === 'P') {
                    if (out.length && !out.endsWith('\n')) out += '\n';
                    blockPending = true;
                }
                Array.from(node.childNodes || []).forEach(walk);
                if ((tag === 'DIV' || tag === 'P') && blockPending && !out.endsWith('\n')) {
                    /* keep single trailing newline handling in trim at call sites */
                }
            };
            Array.from(textEl.childNodes || []).forEach(walk);
            return out.replace(/\u200B/g, '');
        }

        function composeSetPlaceholder(s) {
            textEl.setAttribute('data-placeholder', s || 'Messaggio');
        }

        function composeSetDisabled(disabled) {
            textEl.contentEditable = disabled ? 'false' : 'true';
            textEl.setAttribute('aria-disabled', disabled ? 'true' : 'false');
            textEl.classList.toggle('disabled', !!disabled);
        }

        function composeClear() {
            textEl.innerHTML = '';
            textEl.classList.add('is-empty');
            autosize(textEl);
        }

        function composeSyncEmpty() {
            textEl.classList.toggle('is-empty', !composeGetRaw().replace(/\n/g, '').trim() && !textEl.querySelector('img'));
        }

        function insertPackEmojiAtCursor(name) {
            const file = String(name || '').trim();
            if (!PACK_STICKER_RE.test(file)) return;
            textEl.focus();
            const img = document.createElement('img');
            img.className = 'nav-msg-compose-emoji';
            img.src = packStickerUrl(file);
            img.alt = '';
            img.draggable = false;
            img.setAttribute('data-pack-emoji', file);
            const zw = document.createTextNode('\u200B');
            const sel = window.getSelection();
            let range = null;
            if (sel && sel.rangeCount) {
                range = sel.getRangeAt(0);
                if (!textEl.contains(range.commonAncestorContainer)) range = null;
            }
            if (!range) {
                range = document.createRange();
                range.selectNodeContents(textEl);
                range.collapse(false);
            }
            range.deleteContents();
            const frag = document.createDocumentFragment();
            frag.appendChild(img);
            frag.appendChild(zw);
            range.insertNode(frag);
            range.setStartAfter(zw);
            range.collapse(true);
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }
            textEl.classList.remove('is-empty');
            pushRecentEmoji(file);
            autosize(textEl);
        }

        function formatBodyHtml(text, imgClass) {
            const s = String(text || '');
            if (!s) return '';
            const cls = imgClass || 'nav-msg-inline-emoji';
            const re = /(?:\u27E6e:([A-Za-z0-9_\-]+\.png)\u27E7|\[\[e:([A-Za-z0-9_\-]+\.png)\]\])/gi;
            let html = '';
            let last = 0;
            let m;
            while ((m = re.exec(s))) {
                html += escapeHtml(s.slice(last, m.index));
                const name = m[1] || m[2] || '';
                if (PACK_STICKER_RE.test(name)) {
                    html += '<img class="' + cls + '" src="' + escapeAttr(packStickerUrl(name)) + '" alt="" data-pack-emoji="' + escapeAttr(name) + '" loading="lazy" decoding="async">';
                } else {
                    html += escapeHtml(m[0]);
                }
                last = m.index + m[0].length;
            }
            html += escapeHtml(s.slice(last));
            return html;
        }

        function isPackEmojiOnlyMessage(text) {
            const s = String(text || '').trim();
            if (!s || (!/\u27E6e:/i.test(s) && !/\[\[e:/i.test(s))) return false;
            const stripped = s.replace(PACK_EMOJI_MARK_RE, '').replace(/\u200B/g, '').trim();
            PACK_EMOJI_MARK_RE.lastIndex = 0;
            return !stripped;
        }

        // ── Elenco conversazioni ─────────────────────────────────────────────
        async function loadConversations() {
            const res = await fetch('/api/auth/messages', { headers: authHeader() });
            if (res.status === 403) { el('navMsgWrap').style.display = 'none'; return; }
            if (!res.ok) return;
            const data = await res.json();
            setBadge(data.unread || 0);
            processIncomingNotifs(data.conversations || []);
            if (data.theme) applyTheme(data.theme);
            if (Array.isArray(data.favoriteStickers)) favoriteStickers = data.favoriteStickers;
            isSuperadmin = !!data.isSuperadmin;
            if (adminBtn) adminBtn.hidden = !(isSuperadmin && view === 'list');
            const convs = data.conversations || [];
            if (!convs.length) {
                convsEl.innerHTML = '<div class="nav-bell-empty">Nessuna chat. Premi + per iniziarne una.</div>';
                return;
            }
            convsEl.innerHTML = convs.map((c) => {
                const preview = (c.lastMine ? 'Tu: ' : '') + (c.lastBody || (c.isGroup ? 'Gruppo creato' : ''));
                const kind = c.isGroup ? 'group' : 'user';
                return '<button type="button" class="nav-msg-conv' + (c.unread ? ' unread' : '') + '" data-peer="' + escapeAttr(c.peerId) + '" data-label="' + escapeAttr(c.peerLabel) + '" data-group="' + (c.isGroup ? '1' : '0') + '">'
                    + avatarHtml(c.peerId, c.peerAvatarVersion, initials(c.peerLabel), kind)
                    + '<span class="nav-msg-conv-body">'
                    + '<span class="nav-msg-conv-top"><strong>' + escapeHtml(c.peerLabel) + '</strong><time>' + escapeHtml(fmtListTime(c.lastAt)) + '</time></span>'
                    + '<span class="nav-msg-conv-last"><span>' + escapeHtml(preview) + '</span>'
                    + (c.unread ? '<span class="nav-msg-count">' + (c.unread > 99 ? '99+' : c.unread) + '</span>' : '')
                    + '</span></span></button>';
            }).join('');
            hydrateAvatars(convsEl);
        }

        // ── Nuova chat ───────────────────────────────────────────────────────
        async function loadDirectory() {
            const res = await fetch('/api/auth/messages/directory', { headers: authHeader() });
            if (!res.ok) return;
            const data = await res.json();
            directory = data.users || [];
            if (Array.isArray(data.favoriteStickers)) favoriteStickers = data.favoriteStickers;
            isSuperadmin = !!data.isSuperadmin;
            renderPeople();
        }

        function updateGroupPickBar() {
            const n = selected.size;
            if (groupPickCount) {
                groupPickCount.textContent = n === 0
                    ? 'Tocca i partecipanti'
                    : (n === 1 ? '1 selezionato' : n + ' selezionati');
            }
            if (multiEl) multiEl.classList.toggle('visible', creatingGroup);
            if (newGroupBtn) newGroupBtn.classList.toggle('active', creatingGroup);
        }

        function setCreatingGroup(on) {
            creatingGroup = !!on;
            selected = new Set();
            if (searchEl) {
                searchEl.placeholder = creatingGroup
                    ? 'Cerca partecipanti da aggiungere…'
                    : 'Cerca un utente';
            }
            if (titleEl && view === 'new') {
                titleEl.textContent = creatingGroup ? 'Nuovo gruppo' : 'Nuova chat';
            }
            setStatus(newStatus, creatingGroup
                ? 'Seleziona i partecipanti, poi Continua.'
                : '');
            updateGroupPickBar();
            renderPeople();
        }

        function renderPeople() {
            const q = (searchEl.value || '').trim().toLowerCase();
            const rows = directory.filter((u) => !q || u.label.toLowerCase().includes(q));
            if (!rows.length) {
                peopleEl.innerHTML = '<div class="nav-bell-empty">Nessun utente trovato.</div>';
            } else {
                peopleEl.innerHTML = rows.map((u) => {
                    const picked = creatingGroup && selected.has(u.id);
                    return '<button type="button" class="nav-msg-person' + (picked ? ' picked' : '') + '" data-uid="' + escapeAttr(u.id) + '" data-label="' + escapeAttr(u.label) + '">'
                        + avatarHtml(u.id, u.avatarVersion, initials(u.label))
                        + '<span>' + escapeHtml(u.label) + '</span>'
                        + (creatingGroup ? '<span class="nav-msg-person-mark" aria-hidden="true"></span>' : '')
                        + '</button>';
                }).join('');
                hydrateAvatars(peopleEl);
            }
            updateGroupPickBar();
        }

        /** Una sola emoji (un grapheme), senza lettere/cifre né altre emoji. */
        function isSingleEmojiMessage(text) {
            const s = String(text || '').trim();
            if (!s) return false;
            if (isPackEmojiOnlyMessage(s)) return true;
            if (/[\p{L}\p{N}]/u.test(s)) return false;
            let graphemes;
            try {
                graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
            } catch {
                graphemes = [...s];
            }
            if (graphemes.length !== 1) return false;
            const g = graphemes[0];
            return /\p{Extended_Pictographic}/u.test(g) || /\p{Emoji_Presentation}/u.test(g);
        }

        function isNakedBubble(m) {
            const kind = m.kind || 'text';
            if (kind === 'sticker' || kind === 'image' || kind === 'video' || kind === 'file') return true;
            return kind === 'text' && isSingleEmojiMessage(m.body);
        }

        function isPackStickerBody(body) {
            return PACK_STICKER_RE.test(String(body || '').trim());
        }

        function packStickerUrl(name) {
            return emojiPackBase + encodeURIComponent(String(name || '').trim());
        }

        function stickerButtonHtml(sticker, attrs) {
            const s = String(sticker || '');
            const extra = attrs || '';
            if (isPackStickerBody(s)) {
                return '<button type="button" data-sticker="' + escapeAttr(s) + '"' + extra + '>'
                    + '<img src="' + escapeAttr(packStickerUrl(s)) + '" alt="" loading="lazy" decoding="async">'
                    + '</button>';
            }
            return '<button type="button" data-sticker="' + escapeAttr(s) + '"' + extra + '>' + escapeHtml(s) + '</button>';
        }

        function bubbleBody(m) {
            const kind = m.kind || 'text';
            if (kind === 'sticker') {
                const body = String(m.body || '').trim();
                if (isPackStickerBody(body)) {
                    return '<img class="nav-msg-sticker-img" src="' + escapeAttr(packStickerUrl(body)) + '" alt="Sticker" loading="lazy" decoding="async">';
                }
                return '<span class="nav-msg-sticker">' + escapeHtml(body) + '</span>';
            }
            if (kind === 'text' && isPackEmojiOnlyMessage(m.body)) {
                return '<span class="nav-msg-emoji-lg">' + formatBodyHtml(String(m.body).trim(), 'nav-msg-inline-emoji lg') + '</span>';
            }
            if (kind === 'text' && isSingleEmojiMessage(m.body)) {
                return '<span class="nav-msg-emoji-lg">' + escapeHtml(String(m.body).trim()) + '</span>';
            }
            let html = '';
            if ((kind === 'image' || kind === 'video') && m.attachment && m.attachment.id) {
                html += '<span class="nav-msg-media" data-att="' + escapeAttr(m.attachment.id) + '" data-kind="' + escapeAttr(kind) + '"></span>';
            }
            if (kind === 'file' && m.attachment && m.attachment.id) {
                const fname = m.attachment.name || m.body || 'Documento';
                const fsize = Number(m.attachment.size) || 0;
                const fmime = m.attachment.mime || '';
                const previewKind = filePreviewKind(fmime, fname);
                const typeLabel = fileTypeBadge(fmime, fname);
                html += '<div class="nav-msg-file-card">'
                    + '<span class="nav-msg-file-preview is-loading" data-file-preview="' + escapeAttr(m.attachment.id) + '" data-file-name="' + escapeAttr(fname) + '" data-file-mime="' + escapeAttr(fmime) + '" data-preview-kind="' + escapeAttr(previewKind) + '" title="Apri anteprima">Anteprima…</span>'
                    + '<button type="button" class="nav-msg-file" data-file-att="' + escapeAttr(m.attachment.id) + '" data-file-name="' + escapeAttr(fname) + '" title="Apri file">'
                    + '<span class="nav-msg-file-ico" aria-hidden="true">' + escapeHtml(typeLabel) + '</span>'
                    + '<span class="nav-msg-file-meta"><strong>' + escapeHtml(fname) + '</strong>'
                    + '<span>' + escapeHtml(fmtBytes(fsize)) + (previewKind !== 'other' ? ' · Tocca per aprire' : '') + '</span></span></button>'
                    + '</div>';
            }
            if (m.body && kind !== 'file') html += '<span class="nav-msg-cap">' + formatBodyHtml(m.body) + '</span>';
            else if (m.body && kind === 'file' && m.attachment && m.body !== m.attachment.name) {
                html += '<span class="nav-msg-cap">' + formatBodyHtml(m.body) + '</span>';
            }
            return html;
        }

        function attachmentUrl(id) {
            if (attCache.has(id)) return attCache.get(id);
            const p = fetch('/api/auth/messages/attachment/' + encodeURIComponent(id), { headers: authHeader() })
                .then((res) => (res.status === 200 ? res.blob() : null))
                .then((blob) => (blob && blob.size ? URL.createObjectURL(blob) : ''))
                .catch(() => '');
            attCache.set(id, p);
            return p;
        }

        const fileTicketCache = new Map();

        function guessFileMime(name, mime) {
            const m = String(mime || '').toLowerCase().trim();
            if (m && m !== 'application/octet-stream') return m;
            const n = String(name || '').toLowerCase();
            if (n.endsWith('.pdf')) return 'application/pdf';
            if (n.endsWith('.png')) return 'image/png';
            if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
            if (n.endsWith('.gif')) return 'image/gif';
            if (n.endsWith('.webp')) return 'image/webp';
            if (n.endsWith('.mp4')) return 'video/mp4';
            if (n.endsWith('.webm')) return 'video/webm';
            if (n.endsWith('.mov')) return 'video/quicktime';
            if (n.endsWith('.mp3')) return 'audio/mpeg';
            if (n.endsWith('.wav')) return 'audio/wav';
            if (n.endsWith('.txt') || n.endsWith('.log') || n.endsWith('.csv')) return 'text/plain';
            if (n.endsWith('.json')) return 'application/json';
            if (n.endsWith('.doc') || n.endsWith('.docx')) return 'application/msword';
            if (n.endsWith('.xls') || n.endsWith('.xlsx')) return 'application/vnd.ms-excel';
            if (n.endsWith('.ppt') || n.endsWith('.pptx')) return 'application/vnd.ms-powerpoint';
            if (n.endsWith('.zip') || n.endsWith('.rar') || n.endsWith('.7z')) return 'application/zip';
            return m || 'application/octet-stream';
        }

        function filePreviewKind(mime, name) {
            const m = guessFileMime(name, mime);
            if (m.startsWith('image/')) return 'image';
            if (m.startsWith('video/')) return 'video';
            if (m.startsWith('audio/')) return 'audio';
            if (m === 'application/pdf' || /\.pdf$/i.test(String(name || ''))) return 'pdf';
            if (m.startsWith('text/') || m === 'application/json') return 'text';
            return 'other';
        }

        function fileTypeBadge(mime, name) {
            const m = guessFileMime(name, mime);
            const n = String(name || '').toLowerCase();
            if (m.startsWith('image/')) return 'IMG';
            if (m.startsWith('video/')) return 'VID';
            if (m.startsWith('audio/')) return 'AUD';
            if (m === 'application/pdf' || n.endsWith('.pdf')) return 'PDF';
            if (n.endsWith('.doc') || n.endsWith('.docx') || m.includes('word')) return 'DOC';
            if (n.endsWith('.xls') || n.endsWith('.xlsx') || m.includes('excel') || m.includes('spreadsheet')) return 'XLS';
            if (n.endsWith('.ppt') || n.endsWith('.pptx') || m.includes('powerpoint') || m.includes('presentation')) return 'PPT';
            if (n.endsWith('.zip') || n.endsWith('.rar') || n.endsWith('.7z')) return 'ZIP';
            if (m.startsWith('text/') || n.endsWith('.txt') || n.endsWith('.csv')) return 'TXT';
            const ext = (n.match(/\.([a-z0-9]{1,5})$/i) || [])[1];
            return ext ? ext.toUpperCase() : 'FILE';
        }

        function getFileTicket(attId) {
            if (fileTicketCache.has(attId)) return fileTicketCache.get(attId);
            const p = requestFileTicket(attId).catch((err) => {
                fileTicketCache.delete(attId);
                throw err;
            });
            fileTicketCache.set(attId, p);
            return p;
        }

        let _pdfJsPromise = null;
        function ensurePdfJs() {
            if (global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
            if (_pdfJsPromise) return _pdfJsPromise;
            _pdfJsPromise = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'vendor/pdfjs/pdf.min.js';
                s.async = true;
                s.onload = () => {
                    try {
                        if (!global.pdfjsLib) throw new Error('pdf.js non caricato');
                        global.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
                        resolve(global.pdfjsLib);
                    } catch (err) {
                        _pdfJsPromise = null;
                        reject(err);
                    }
                };
                s.onerror = () => {
                    _pdfJsPromise = null;
                    reject(new Error('pdf.js non disponibile'));
                };
                document.head.appendChild(s);
            });
            return _pdfJsPromise;
        }

        /** Renderizza solo le pagine PDF (canvas), senza chrome del viewer del browser. */
        async function renderPdfInto(container, url, opts) {
            if (!container || !url) throw new Error('PDF non valido');
            const maxPages = (opts && opts.maxPages) || 1;
            const layoutW = Math.max(160, Math.floor((opts && opts.maxWidth) || container.clientWidth || 280));
            const dpr = Math.min(2.5, window.devicePixelRatio || 1);
            const pdfjs = await ensurePdfJs();
            const pdf = await pdfjs.getDocument({ url: url, withCredentials: false }).promise;
            const total = Math.min(pdf.numPages || 1, maxPages);
            const wrap = document.createElement('div');
            wrap.className = 'nav-msg-pdf-pages';
            for (let i = 1; i <= total; i++) {
                const page = await pdf.getPage(i);
                const base = page.getViewport({ scale: 1 });
                const cssScale = Math.max(0.4, layoutW / base.width);
                const viewport = page.getViewport({ scale: cssScale * dpr });
                const canvas = document.createElement('canvas');
                canvas.className = 'nav-msg-pdf-page';
                canvas.width = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);
                canvas.style.width = Math.floor(viewport.width / dpr) + 'px';
                canvas.style.height = Math.floor(viewport.height / dpr) + 'px';
                const ctx = canvas.getContext('2d', { alpha: false });
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                wrap.appendChild(canvas);
            }
            container.innerHTML = '';
            container.appendChild(wrap);
            return pdf;
        }

        function hydrateMedia(root) {
            if (!root) return;
            root.querySelectorAll('.nav-msg-media[data-att]').forEach((elm) => {
                const id = elm.getAttribute('data-att');
                const kind = elm.getAttribute('data-kind');
                attachmentUrl(id).then((url) => {
                    if (!url || !elm.isConnected) return;
                    if (kind === 'video') {
                        elm.innerHTML = '<video controls playsinline preload="metadata" src="' + url + '"></video>';
                    } else {
                        elm.innerHTML = '<img src="' + url + '" alt="Foto" data-full="' + url + '">';
                    }
                });
            });
            hydrateFilePreviews(root);
        }

        function hydrateFilePreviews(root) {
            if (!root) return;
            root.querySelectorAll('.nav-msg-file-preview[data-file-preview]').forEach((elm) => {
                const id = elm.getAttribute('data-file-preview');
                const name = elm.getAttribute('data-file-name') || 'Documento';
                const mimeHint = elm.getAttribute('data-file-mime') || '';
                if (!id) return;
                getFileTicket(id).then((data) => {
                    if (!elm.isConnected) return;
                    const mime = guessFileMime(data.name || name, data.mime || mimeHint);
                    const kind = filePreviewKind(mime, data.name || name);
                    const viewUrl = data.viewUrl
                        || ('/api/auth/messages/attachment/' + encodeURIComponent(id) + '?ticket=' + encodeURIComponent(data.ticket || ''));
                    elm.classList.remove('is-loading');
                    elm.removeAttribute('hidden');
                    if (kind === 'image') {
                        elm.innerHTML = '<img src="' + escapeAttr(viewUrl) + '" alt="' + escapeAttr(name) + '" loading="lazy">';
                    } else if (kind === 'video') {
                        elm.innerHTML = '<video controls playsinline preload="metadata" src="' + escapeAttr(viewUrl) + '"></video>';
                    } else if (kind === 'audio') {
                        elm.innerHTML = '<audio controls preload="metadata" src="' + escapeAttr(viewUrl) + '" style="width:100%;padding:0.55rem"></audio>';
                    } else if (kind === 'pdf') {
                        elm.innerHTML = '<div class="nav-msg-pdf-pages" style="min-height:88px"></div>';
                        renderPdfInto(elm, viewUrl, { maxPages: 1, maxWidth: 278 }).catch(() => {
                            if (!elm.isConnected) return;
                            elm.innerHTML = '<div class="nav-msg-file-preview-fallback">Anteprima PDF non disponibile.<br>Tocca per aprire.</div>';
                        });
                    } else if (kind === 'text') {
                        elm.innerHTML = '<iframe title="' + escapeAttr(name) + '" src="' + escapeAttr(viewUrl) + '"></iframe>';
                    } else {
                        elm.innerHTML = '<div class="nav-msg-file-preview-fallback">Anteprima non disponibile in chat.<br>Tocca per aprire o scaricare.</div>';
                    }
                    elm.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openFilePreview(id, name);
                    };
                }).catch(() => {
                    if (!elm.isConnected) return;
                    elm.classList.remove('is-loading');
                    elm.innerHTML = '<div class="nav-msg-file-preview-fallback">Anteprima non disponibile.<br>Tocca la scheda per riprovare.</div>';
                });
            });
        }

        function fileToDataUrl(file, kind) {
            if (kind === 'video' || file.type === 'image/gif') {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({ data: reader.result, width: 0, height: 0 });
                    reader.onerror = () => reject(new Error('Impossibile leggere il file.'));
                    reader.readAsDataURL(file);
                });
            }
            return new Promise((resolve, reject) => {
                const img = new Image();
                const src = URL.createObjectURL(file);
                img.onload = () => {
                    URL.revokeObjectURL(src);
                    const max = 1280;
                    let w = img.naturalWidth, h = img.naturalHeight;
                    if (!w || !h) { reject(new Error('Immagine non valida.')); return; }
                    if (Math.max(w, h) > max) {
                        const s = max / Math.max(w, h);
                        w = Math.round(w * s); h = Math.round(h * s);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, w, h);
                    const keepPng = file.type === 'image/png' || file.type === 'image/webp';
                    resolve({
                        data: keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.82),
                        width: w,
                        height: h,
                    });
                };
                img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('Impossibile leggere l\'immagine.')); };
                img.src = src;
            });
        }

        function setPending(file, kind) {
            if (kind === 'video' && file.size > 8 * 1024 * 1024) {
                setStatus(statusEl, 'Video troppo grande (massimo 8 MB).', true);
                return;
            }
            if (file.type === 'image/gif' && file.size > 2 * 1024 * 1024) {
                setStatus(statusEl, 'GIF troppo grande (massimo 2 MB).', true);
                return;
            }
            clearPending();
            const localUrl = (kind === 'file' && !(file.type || '').startsWith('image/'))
                ? ''
                : URL.createObjectURL(file);
            pendingMedia = { file, kind, url: kind === 'file' && !(file.type || '').startsWith('image/') ? '' : localUrl };
            const showThumb = kind === 'image' || (kind === 'file' && (file.type || '').startsWith('image/'));
            previewThumb.src = showThumb ? localUrl : '';
            previewThumb.style.display = showThumb ? '' : 'none';
            previewName.textContent = file.name || (kind === 'video' ? 'Video' : (kind === 'file' ? 'Documento' : 'Foto'));
            if (kind === 'video') {
                previewKind.textContent = 'Video · verrà inviato con il messaggio';
            } else if (kind === 'file') {
                const badge = fileTypeBadge(file.type, file.name);
                previewKind.textContent = badge + ' · ' + fmtBytes(file.size) + ' · verrà inviato con il messaggio';
            } else {
                previewKind.textContent = 'Foto · didascalia opzionale';
            }
            previewEl.classList.add('visible');
            composeSetPlaceholder(kind === 'file' ? 'Messaggio (opzionale)' : 'Didascalia (opzionale)');
            textEl.focus();
        }

        async function uploadDocumentFile(file) {
            const token = (typeof getAuthToken === 'function')
                ? getAuthToken()
                : (localStorage.getItem('authToken') || '');
            const res = await fetch('/api/auth/messages/upload', {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer ' + token,
                    'Content-Type': 'application/octet-stream',
                    'X-File-Name': encodeURIComponent(file.name || 'documento'),
                    'X-File-Mime': file.type || 'application/octet-stream',
                },
                body: file,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Upload non riuscito.');
            if (!data.attachmentId) throw new Error('Upload non riuscito.');
            return data;
        }

        function getRecentEmojis() {
            try {
                const raw = JSON.parse(localStorage.getItem(EMOJI_RECENT_KEY) || '[]');
                if (!Array.isArray(raw)) return [];
                const allowed = Array.isArray(emojiPackFiles) ? new Set(emojiPackFiles) : null;
                return raw
                    .map((x) => String(x || '').trim())
                    .filter((x) => PACK_STICKER_RE.test(x) && (!allowed || allowed.has(x)))
                    .slice(0, EMOJI_RECENT_MAX);
            } catch {
                return [];
            }
        }

        function pushRecentEmoji(name) {
            const s = String(name || '').trim();
            if (!PACK_STICKER_RE.test(s)) return;
            const next = [s].concat(getRecentEmojis().filter((x) => x !== s)).slice(0, EMOJI_RECENT_MAX);
            try { localStorage.setItem(EMOJI_RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
            if (emojiGrid) emojiGrid.dataset.ready = '';
        }

        function emojiBtnHtml(name, title) {
            return '<button type="button" data-sticker="' + escapeAttr(name) + '" data-emoji-pack="1" title="' + escapeAttr(title || 'Aggiungi al messaggio') + '">'
                + '<img src="' + escapeAttr(packStickerUrl(name)) + '" alt="" loading="lazy" decoding="async">'
                + '</button>';
        }

        /** Inserisce l'emoji pack nel corpo del testo (inline), senza allegato. Il picker resta aperto. */
        function queuePackEmoji(name) {
            if (!peer || !name || adminMode) return;
            insertPackEmojiAtCursor(name);
            // Aggiorna «Ultime usate» dopo il click, così non si distrugge il target a metà evento
            // (altrimenti il panel chiude il picker pensando che il click sia fuori).
            setTimeout(() => {
                if (pickerEl && pickerEl.classList.contains('visible')) fillPickers();
            }, 0);
        }

        async function ensureEmojiPack() {
            if (Array.isArray(emojiPackFiles) && Array.isArray(emojiPackCategories)) return emojiPackFiles;
            try {
                const res = await fetch('/api/auth/messages/emojis', { headers: authHeader() });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Emoji non disponibili.');
                emojiPackFiles = Array.isArray(data.files) ? data.files : [];
                emojiPackCategories = Array.isArray(data.categories) ? data.categories : [];
                if (data.baseUrl) emojiPackBase = String(data.baseUrl);
            } catch {
                emojiPackFiles = [];
                emojiPackCategories = [];
            }
            return emojiPackFiles;
        }

        function fillPickers() {
            if (emojiGrid) {
                if (!Array.isArray(emojiPackFiles) || !Array.isArray(emojiPackCategories)) {
                    emojiGrid.innerHTML = '<div class="nav-msg-picker-empty">Caricamento emoji…</div>';
                    ensureEmojiPack().then(() => fillPickers());
                } else if (!emojiPackFiles.length) {
                    emojiGrid.innerHTML = '<div class="nav-msg-picker-empty">Nessuna emoji nella cartella</div>';
                } else {
                    const recent = getRecentEmojis();
                    const readyKey = emojiPackFiles.length + ':facce-first:' + recent.join(',');
                    if (emojiGrid.dataset.ready !== readyKey) {
                        const cats = emojiPackCategories.slice().sort((a, b) => {
                            const order = ['facce', 'persone', 'gesti', 'cuori', 'animali', 'cibo', 'oggetti', 'simboli', 'altro'];
                            const ia = order.indexOf(a.id);
                            const ib = order.indexOf(b.id);
                            return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
                        });
                        const catBlock = (cat) => {
                            const files = Array.isArray(cat.files) ? cat.files : [];
                            if (!files.length) return '';
                            const label = cat.id === 'facce' ? 'Faccine' : (cat.label || cat.id || '');
                            return '<div class="nav-msg-emoji-cat">'
                                + '<div class="nav-msg-emoji-cat-label">' + escapeHtml(label) + '</div>'
                                + '<div class="nav-msg-picker-grid emojis">'
                                + files.map((name) => emojiBtnHtml(name)).join('')
                                + '</div></div>';
                        };
                        const facce = cats.find((c) => c.id === 'facce');
                        const rest = cats.filter((c) => c.id !== 'facce');
                        let html = '';
                        if (recent.length) {
                            html += '<div class="nav-msg-emoji-recent" aria-label="Ultime usate">'
                                + recent.map((name) => emojiBtnHtml(name, 'Recente')).join('')
                                + '</div>';
                        }
                        if (facce) html += catBlock(facce);
                        html += rest.map(catBlock).join('');
                        emojiGrid.innerHTML = html;
                        emojiGrid.dataset.ready = readyKey;
                    }
                }
            }
            if (stickerGrid) {
                if (!favoriteStickers.length) {
                    stickerGrid.innerHTML = '<div class="nav-msg-picker-empty">Nessun sticker presente</div>';
                } else {
                    stickerGrid.innerHTML = favoriteStickers.map((e) =>
                        stickerButtonHtml(e, ' title="Tieni premuto per rimuovere"')
                    ).join('');
                }
            }
        }

        async function addFavorite(sticker) {
            const res = await fetch('/api/auth/messages/favorites', {
                method: 'POST',
                headers: authHeader(),
                body: JSON.stringify({ sticker }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Preferito non salvato.');
            favoriteStickers = data.stickers || [];
            fillPickers();
        }

        async function removeFavorite(sticker) {
            const res = await fetch('/api/auth/messages/favorites?sticker=' + encodeURIComponent(sticker), {
                method: 'DELETE',
                headers: authHeader(),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Rimozione non riuscita.');
            favoriteStickers = data.stickers || [];
            fillPickers();
        }

        function attKindIcon(kind) {
            if (kind === 'video') return '🎬 ';
            if (kind === 'file') return '📎 ';
            return '📷 ';
        }

        async function requestFileTicket(attId) {
            const res = await fetch('/api/auth/messages/attachment/' + encodeURIComponent(attId) + '/download-ticket', {
                method: 'POST',
                headers: authHeader(),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'File non disponibile.');
            return data;
        }

        /** Download: per i documenti usa ticket (streaming browser, niente blob in RAM). */
        async function saveAttachment(attId, kind) {
            if (kind === 'file') {
                const data = await getFileTicket(attId);
                const a = document.createElement('a');
                a.href = data.url || ('/api/auth/messages/attachment/' + encodeURIComponent(attId) + '?ticket=' + encodeURIComponent(data.ticket || '') + '&download=1');
                a.rel = 'noopener';
                a.download = data.name || '';
                document.body.appendChild(a);
                a.click();
                a.remove();
                return;
            }
            const res = await fetch('/api/auth/messages/attachment/' + encodeURIComponent(attId) + '?download=1', { headers: authHeader() });
            if (!res.ok) throw new Error('Download non riuscito.');
            const blob = await res.blob();
            const cd = res.headers.get('Content-Disposition') || '';
            const m = /filename="([^"]+)"/.exec(cd);
            const name = (m && m[1]) || (kind === 'video' ? 'criptogram-video.mp4' : 'criptogram-foto.jpg');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        }

        function closeFileLight() {
            if (!lightEl) return;
            lightEl.hidden = true;
            lightEl.classList.remove('is-pdf');
            lightEl.innerHTML = '';
            lightEl.onclick = null;
        }

        /** Anteprima documento in lightbox + pulsante Scarica. */
        async function openFilePreview(attId, fileName) {
            if (!lightEl || !attId) return;
            setStatus(statusEl, 'Apertura file…');
            try {
                const data = await getFileTicket(attId);
                const name = data.name || fileName || 'Documento';
                const mime = guessFileMime(name, data.mime);
                const kind = filePreviewKind(mime, name);
                const viewUrl = data.viewUrl || ('/api/auth/messages/attachment/' + encodeURIComponent(attId) + '?ticket=' + encodeURIComponent(data.ticket || ''));
                const dlUrl = data.url || (viewUrl + (viewUrl.includes('?') ? '&' : '?') + 'download=1');
                let media = '';
                if (kind === 'image') {
                    media = '<img src="' + escapeAttr(viewUrl) + '" alt="">';
                } else if (kind === 'video') {
                    media = '<video controls playsinline src="' + escapeAttr(viewUrl) + '"></video>';
                } else if (kind === 'audio') {
                    media = '<audio controls src="' + escapeAttr(viewUrl) + '" style="width:min(420px,92%)"></audio>';
                } else if (kind === 'pdf') {
                    media = '<div class="nav-msg-pdf-scroll" data-pdf-host><div class="nav-msg-light-meta">Caricamento documento…</div></div>';
                } else if (kind === 'text') {
                    media = '<iframe title="' + escapeAttr(name) + '" src="' + escapeAttr(viewUrl) + '"></iframe>';
                } else {
                    media = '<div class="nav-msg-light-meta">Anteprima non disponibile per questo tipo di file.<br><strong>'
                        + escapeHtml(name) + '</strong>'
                        + (data.size ? (' · ' + escapeHtml(fmtBytes(data.size))) : '')
                        + '<br><span style="opacity:0.85">Puoi scaricarlo e aprirlo sul dispositivo.</span>'
                        + '</div>';
                }
                lightEl.classList.toggle('is-pdf', kind === 'pdf');
                lightEl.innerHTML = media
                    + '<div class="nav-msg-light-bar">'
                    + '<div class="nav-msg-light-meta">' + escapeHtml(name) + '</div>'
                    + '<div class="nav-msg-light-actions">'
                    + '<a href="' + escapeAttr(dlUrl) + '" download="' + escapeAttr(name) + '">Scarica</a>'
                    + '<button type="button" class="close-light">Chiudi</button>'
                    + '</div></div>';
                lightEl.hidden = false;
                lightEl.onclick = (e) => {
                    if (e.target === lightEl || e.target.closest('.close-light')) closeFileLight();
                };
                if (kind === 'pdf') {
                    const host = lightEl.querySelector('[data-pdf-host]');
                    const run = () => {
                        if (!host || !host.isConnected) return;
                        const pdfW = Math.max(200, host.clientWidth - 24);
                        renderPdfInto(host, viewUrl, { maxPages: 80, maxWidth: pdfW }).catch(() => {
                            if (!host.isConnected) return;
                            host.innerHTML = '<div class="nav-msg-light-meta">Anteprima PDF non disponibile.<br>Usa Scarica per aprire il file.</div>';
                        });
                    };
                    requestAnimationFrame(run);
                }
                setStatus(statusEl, '');
            } catch (err) {
                setStatus(statusEl, (err && err.message) || 'Apertura non riuscita.', true);
            }
        }

        function renderStorageBox(storage) {
            const box = el('navMsgStorage');
            const label = el('navMsgStorageLabel');
            const bar = el('navMsgStorageBar');
            if (!box || !storage) return;
            box.classList.toggle('over', !!storage.over);
            if (label) {
                label.textContent = (storage.label || '0 B') + ' su 10 GB'
                    + (storage.attachments != null ? ' · ' + storage.attachments + ' allegati' : '')
                    + (storage.messages != null ? ' · ' + storage.messages + ' messaggi' : '');
            }
            if (bar) bar.style.width = Math.min(100, Number(storage.percent) || 0) + '%';
        }

        function fmtBytes(n) {
            const b = Number(n) || 0;
            if (b < 1024) return b + ' B';
            if (b < 1024 * 1024) return (Math.round(b / 102.4) / 10) + ' KB';
            if (b < 1024 * 1024 * 1024) return (Math.round(b / (1024 * 102.4)) / 10) + ' MB';
            return (Math.round(b / (1024 * 1024 * 102.4)) / 10) + ' GB';
        }

        function showAdminFm(on) {
            if (adminMainEl) adminMainEl.hidden = !!on;
            if (adminFmEl) adminFmEl.hidden = !on;
            if (!on) fmExpanded = '';
        }

        function closeFmSort() {
            if (fmSortWrap) fmSortWrap.classList.remove('open');
            if (fmSortMenu) fmSortMenu.hidden = true;
            if (fmSortBtn) fmSortBtn.setAttribute('aria-expanded', 'false');
        }

        function sortedFmChats() {
            const mode = fmSortMode || 'bytes';
            const list = fmChats.slice();
            list.sort((a, b) => {
                if (mode === 'label') return String(a.peerLabel || '').localeCompare(String(b.peerLabel || ''), 'it', { sensitivity: 'base' });
                if (mode === 'messages') return (Number(b.messages) || 0) - (Number(a.messages) || 0);
                if (mode === 'attachments') return (Number(b.attachments) || 0) - (Number(a.attachments) || 0);
                if (mode === 'lastAt') return String(b.lastAt || '').localeCompare(String(a.lastAt || ''));
                return (Number(b.bytes) || 0) - (Number(a.bytes) || 0);
            });
            return list;
        }

        function renderFileManager() {
            if (!fmListEl) return;
            const list = sortedFmChats();
            if (!list.length) {
                fmListEl.innerHTML = '<div class="nav-bell-empty">Nessuna chat con contenuti.</div>';
                return;
            }
            fmListEl.innerHTML = list.map((c) => {
                const open = fmExpanded === c.peerId;
                const files = Array.isArray(c.files) ? c.files : [];
                return '<div class="nav-msg-fm-row" data-fm-peer="' + escapeAttr(c.peerId) + '">'
                    + '<div>'
                    + '<strong>' + escapeHtml(c.peerLabel || c.peerId) + '</strong>'
                    + '<span class="meta">' + (c.type === 'group' ? 'Gruppo' : 'Chat')
                    + ' · ' + (Number(c.messages) || 0) + ' msg · ' + (Number(c.attachments) || 0) + ' allegati'
                    + (c.lastAt ? ' · ' + escapeHtml(fmtListTime(c.lastAt)) : '') + '</span>'
                    + '</div>'
                    + '<span class="bytes">' + escapeHtml(c.label || fmtBytes(c.bytes)) + '</span>'
                    + '<div class="nav-msg-fm-actions">'
                    + '<button type="button" data-fm-toggle="' + escapeAttr(c.peerId) + '">' + (open ? 'Nascondi file' : 'Mostra file') + '</button>'
                    + '<button type="button" data-fm-open="' + escapeAttr(c.peerId) + '">Apri chat</button>'
                    + '<button type="button" class="danger" data-fm-del-chat="' + escapeAttr(c.peerId) + '">Elimina chat</button>'
                    + '</div>'
                    + '<div class="nav-msg-fm-files"' + (open ? '' : ' hidden') + ' data-fm-files="' + escapeAttr(c.peerId) + '">'
                    + (files.length
                        ? files.map((f) =>
                            '<div class="nav-msg-admin-file" data-att="' + escapeAttr(f.id) + '">'
                            + '<span>' + escapeHtml(attKindIcon(f.kind) + (f.name || f.id.slice(0, 8))) + '</span>'
                            + '<span style="color:#7ACCE0">' + escapeHtml(fmtListTime(f.createdAt)) + ' · ' + escapeHtml(fmtBytes(f.bytes)) + '</span>'
                            + '<button type="button" data-fm-del-att="' + escapeAttr(f.id) + '">Elimina</button></div>'
                        ).join('')
                        : '<div class="nav-bell-empty" style="min-height:2rem;padding:0.4rem 0;">Nessun allegato in questa chat.</div>')
                    + '</div></div>';
            }).join('');
        }

        function findFmChat(peerId) {
            return fmChats.find((c) => c.peerId === peerId) || null;
        }

        async function loadFileManager() {
            if (fmListEl) fmListEl.innerHTML = '<div class="nav-bell-empty">Caricamento…</div>';
            showAdminFm(true);
            try {
                const res = await fetch('/api/auth/messages/admin/storage/chats', { headers: authHeader() });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'File manager non disponibile.');
                if (data.storage) renderStorageBox(data.storage);
                fmChats = Array.isArray(data.chats) ? data.chats : [];
                renderFileManager();
            } catch (err) {
                if (fmListEl) fmListEl.innerHTML = '<div class="nav-bell-empty">' + escapeHtml(err.message || 'Errore') + '</div>';
            }
        }

        async function loadAdminOverview() {
            showAdminFm(false);
            const res = await fetch('/api/auth/messages/admin/overview', { headers: authHeader() });
            if (!res.ok) { adminChatsEl.innerHTML = '<div class="nav-bell-empty">Archivio non disponibile.</div>'; return; }
            const data = await res.json();
            renderStorageBox(data.storage);
            const convs = data.conversations || [];
            if (!convs.length) {
                adminChatsEl.innerHTML = '<div class="nav-bell-empty">Nessuna conversazione nel sistema.</div>';
            } else {
                adminChatsEl.innerHTML = convs.map((c) =>
                    '<button type="button" class="nav-msg-conv" data-admin-peer="' + escapeAttr(c.peerId) + '" data-group="' + (c.isGroup ? '1' : '0') + '" data-label="' + escapeAttr(c.peerLabel) + '"'
                    + (c.peerA ? ' data-a="' + escapeAttr(c.peerA) + '" data-b="' + escapeAttr(c.peerB) + '"' : '') + '>'
                    + '<span class="nav-msg-avatar">' + escapeHtml(initials(c.peerLabel)) + '</span>'
                    + '<span class="nav-msg-conv-body"><span class="nav-msg-conv-top"><strong>' + escapeHtml(c.peerLabel) + '</strong>'
                    + '<time>' + escapeHtml(fmtListTime(c.lastAt)) + '</time></span>'
                    + '<span class="nav-msg-conv-last"><span>' + escapeHtml(c.lastBody || '') + '</span></span></span></button>'
                ).join('');
            }
            const st = await fetch('/api/auth/messages/admin/storage', { headers: authHeader() });
            if (st.ok) {
                const s = await st.json();
                renderStorageBox(s);
                adminFilesEl.innerHTML = (s.files || []).length
                    ? (s.files || []).map((f) =>
                        '<div class="nav-msg-admin-file" data-att="' + escapeAttr(f.id) + '">'
                        + '<span>' + escapeHtml(attKindIcon(f.kind) + (f.name || f.id.slice(0, 8))) + '</span>'
                        + '<span style="color:#7ACCE0">' + escapeHtml(fmtListTime(f.createdAt)) + ' · ' + escapeHtml(fmtBytes(f.bytes || f.size || 0)) + '</span>'
                        + '<button type="button" data-del-att="' + escapeAttr(f.id) + '">Elimina</button></div>'
                    ).join('')
                    : '<div class="nav-bell-empty">Nessun allegato.</div>';
            }
        }

        async function openAdminChat(opts) {
            peer = {
                id: opts.isGroup ? opts.groupId : (opts.peerA + ':' + opts.peerB),
                label: opts.label || 'Archivio',
                isGroup: !!opts.isGroup,
                peerA: opts.peerA,
                peerB: opts.peerB,
                admin: true,
            };
            adminMode = true;
            lastRenderedKey = '';
            threadEl.innerHTML = '<div class="nav-bell-empty">Caricamento…</div>';
            showView('chat', peer.label);
            adminMode = true;
            setStatus(statusEl, 'Vista Super Admin: puoi leggere ed eliminare i messaggi.');
            await loadThread(true);
        }

        function fillThemePresets() {
            const box = el('navMsgThemePresets');
            if (!box) return;
            box.innerHTML = THEME_PRESETS.map((p) =>
                '<button type="button" class="nav-msg-swatch' + (chatTheme.preset === p.id ? ' active' : '') + '" data-preset="' + p.id
                + '" style="background:linear-gradient(135deg,' + p.mine + ',' + p.mine2 + ')" title="' + p.id + '"></button>'
            ).join('');
            const mine = el('navMsgColorMine');
            const theirs = el('navMsgColorTheirs');
            if (mine) mine.value = chatTheme.mine || '#00C8FF';
            if (theirs) theirs.value = (chatTheme.theirs && chatTheme.theirs.charAt(0) === '#') ? chatTheme.theirs : '#123A4A';
        }

        // ── Chat ─────────────────────────────────────────────────────────────
        async function openChat(peerId, label, opts) {
            peer = { id: peerId, label: label || '', isGroup: !!(opts && opts.isGroup), isAdmin: !!(opts && opts.isAdmin) };
            lastRenderedKey = '';
            exitSelect();
            threadEl.innerHTML = '<div class="nav-bell-empty">Caricamento…</div>';
            showView('chat', peer.label || 'Chat');
            setStatus(statusEl, '');
            await loadThread(true);
            textEl.focus();
        }

        function scrollThreadToMessage(messageId) {
            if (!messageId || !threadEl) {
                threadEl.scrollTop = threadEl.scrollHeight;
                return false;
            }
            const bubble = threadEl.querySelector('.nav-msg-bubble[data-mid="' + CSS.escape(String(messageId)) + '"]');
            if (!bubble) {
                threadEl.scrollTop = threadEl.scrollHeight;
                return false;
            }
            const top = bubble.getBoundingClientRect().top
                - threadEl.getBoundingClientRect().top
                + threadEl.scrollTop
                - 10;
            threadEl.scrollTop = Math.max(0, top);
            return true;
        }

        async function loadThread(scrollToEnd) {
            if (!peer) return;
            let path;
            if (adminMode && peer.admin) {
                path = peer.isGroup
                    ? '/api/auth/messages/admin/group/' + encodeURIComponent(peer.id)
                    : '/api/auth/messages/admin/with/' + encodeURIComponent(peer.peerA) + '/' + encodeURIComponent(peer.peerB);
            } else {
                path = peer.isGroup
                    ? '/api/auth/messages/group/' + encodeURIComponent(peer.id)
                    : '/api/auth/messages/with/' + encodeURIComponent(peer.id);
            }
            const res = await fetch(path, { headers: authHeader() });
            if (!res.ok) {
                threadEl.innerHTML = '<div class="nav-bell-empty">Chat non disponibile.</div>';
                return;
            }
            const data = await res.json();
            if (!peer) return;
            setBadge(data.unread || 0);
            if (data.theme) applyTheme(data.theme);
            if (data.peer && data.peer.label) {
                peer.label = data.peer.label;
                peer.isGroup = !!data.peer.isGroup;
                peer.isAdmin = !!data.peer.isAdmin;
                titleEl.textContent = peer.label;
                const av = Number(data.peer.avatarVersion) || 0;
                const kind = peer.isGroup ? 'group' : 'user';
                if (headAv.hidden || headAv.getAttribute('data-av-ver') !== String(av) || headAv.getAttribute('data-av-kind') !== kind) {
                    setHeadAvatar(peer.id, peer.label, av, kind);
                }
            }
            const items = data.items || [];
            const firstUnreadId = data.firstUnreadId || '';
            const key = items.map((m) => m.id + ':' + (m.kind || 'text') + ':' + (m.attachment && m.attachment.id || '')).join('|') || 'empty';
            if (key === lastRenderedKey) return;
            lastRenderedKey = key;
            const wasAtBottom = threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight < 40;
            if (!items.length) {
                threadEl.innerHTML = '<div class="nav-bell-empty">Nessun messaggio. Scrivi il primo.</div>';
            } else {
                let lastDay = '';
                threadEl.innerHTML = items.map((m) => {
                    const day = dayLabel(m.createdAt);
                    let html = '';
                    if (day !== lastDay) { html += '<div class="nav-msg-day">' + escapeHtml(day) + '</div>'; lastDay = day; }
                    const kind = m.kind || 'text';
                    const ownerLabel = String(m.senderLabel || '').trim();
                    const showOwner = !!(ownerLabel && (adminMode || (!m.mine && peer.isGroup)));
                    const from = showOwner
                        ? '<span class="nav-msg-from">' + escapeHtml(ownerLabel) + '</span>'
                        : '';
                    const naked = isNakedBubble(m);
                    const nakedCls = naked ? (kind === 'sticker' ? ' sticker naked' : ' naked') : '';
                    const archived = !!(adminMode && (m.deletedForAll || m.hiddenBySender || m.hiddenByRecipient));
                    let archiveTag = '';
                    if (adminMode && m.deletedForAll) {
                        archiveTag = '<span class="nav-msg-archive-tag is-deleted">Eliminato per tutti</span>';
                    } else if (adminMode && (m.hiddenBySender || m.hiddenByRecipient)) {
                        archiveTag = '<span class="nav-msg-archive-tag">Nascosto da un utente</span>';
                    }
                    html += '<div class="nav-msg-bubble' + (m.mine ? ' mine' : '') + nakedCls + (archived ? ' archived' : '') + (selectedMsgs.has(String(m.id)) ? ' selected' : '') + '" data-mid="' + escapeAttr(m.id) + '" data-mine="' + (m.mine ? '1' : '0') + '" data-kind="' + escapeAttr(kind) + '" data-att="' + escapeAttr((m.attachment && m.attachment.id) || '') + '" data-body="' + escapeAttr(m.body || '') + '">'
                        + from
                        + archiveTag
                        + bubbleBody(m)
                        + '<time>' + fmtTime(m.createdAt) + '</time>'
                        + '<button type="button" class="nav-msg-more" data-more="' + escapeAttr(m.id) + '" title="Opzioni" aria-label="Opzioni">&#8943;</button>'
                        + '</div>';
                    return html;
                }).join('');
                hydrateMedia(threadEl);
                if (selecting) {
                    selectedMsgs.forEach((_, id) => {
                        if (!findBubbleById(id)) selectedMsgs.delete(id);
                    });
                    refreshSelectBar();
                }
            }
            if (scrollToEnd) {
                if (firstUnreadId) scrollThreadToMessage(firstUnreadId);
                else threadEl.scrollTop = threadEl.scrollHeight;
            } else if (wasAtBottom) {
                threadEl.scrollTop = threadEl.scrollHeight;
            }
            if (adminMode) {
                setStatus(statusEl, 'Vista Super Admin: puoi leggere ed eliminare i messaggi.');
                composeSetDisabled(true); sendBtn.disabled = true;
                if (attachBtn) attachBtn.disabled = true;
                if (emojiBtn) emojiBtn.disabled = true;
            } else if (data.peer && data.peer.active === false) {
                setStatus(statusEl, 'Questo utente non è più disponibile.', true);
                composeSetDisabled(true); sendBtn.disabled = true;
                if (attachBtn) attachBtn.disabled = false;
                if (emojiBtn) emojiBtn.disabled = false;
            } else {
                composeSetDisabled(false); sendBtn.disabled = false;
                if (attachBtn) attachBtn.disabled = false;
                if (emojiBtn) emojiBtn.disabled = false;
            }
        }

        async function sendTo(recipientIds, payload) {
            const body = Object.assign({}, payload);
            if (peer && peer.isGroup) body.groupId = peer.id;
            else body.recipientIds = recipientIds;
            const res = await fetch('/api/auth/messages', {
                method: 'POST',
                headers: authHeader(),
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Invio non riuscito.');
            return data;
        }

        async function sendCurrent() {
            if (!peer || adminMode) return;
            const text = composeGetRaw().trim();
            if (text.length > 2000) {
                setStatus(statusEl, 'Il messaggio può avere al massimo 2000 caratteri.', true);
                return;
            }
            sendBtn.disabled = true;
            setStatus(statusEl, '');
            try {
                if (pendingMedia) {
                    const kind = pendingMedia.kind;
                    if (kind === 'file') {
                        setStatus(statusEl, 'Caricamento documento…');
                        const up = await uploadDocumentFile(pendingMedia.file);
                        await sendTo([peer.id], {
                            kind: 'file',
                            text,
                            attachmentId: up.attachmentId,
                        });
                    } else {
                        if (kind === 'video' && pendingMedia.file.size > 8 * 1024 * 1024) {
                            throw new Error('Video troppo grande (massimo 8 MB).');
                        }
                        const packed = await fileToDataUrl(pendingMedia.file, kind);
                        await sendTo([peer.id], {
                            kind,
                            text,
                            attachment: { data: packed.data, name: pendingMedia.file.name || '', width: packed.width, height: packed.height },
                        });
                    }
                    clearPending();
                    composeSetPlaceholder('Messaggio');
                } else {
                    if (!text) return;
                    await sendTo([peer.id], { kind: 'text', text });
                }
                composeClear();
                setStatus(statusEl, '');
                lastRenderedKey = '';
                await loadThread(true);
            } catch (err) {
                setStatus(statusEl, err.message || 'Invio non riuscito.', true);
            } finally {
                sendBtn.disabled = false;
                textEl.focus();
            }
        }

        async function sendSticker(sticker) {
            if (!peer || !sticker || adminMode) return;
            try {
                await sendTo([peer.id], { kind: 'sticker', sticker });
                pushRecentEmoji(sticker);
                if (pickerEl && pickerEl.classList.contains('visible')) fillPickers();
                lastRenderedKey = '';
                await loadThread(true);
            } catch (err) {
                setStatus(statusEl, err.message || 'Invio non riuscito.', true);
            }
        }

        // ── Badge ─────────────────────────────────────────────────────────────
        async function refreshBadge() {
            try {
                const res = await fetch('/api/auth/messages', { headers: authHeader() });
                if (res.status === 401) {
                    if (typeof global.forceLogoutToLogin === 'function') global.forceLogoutToLogin();
                    else { try { localStorage.removeItem('authToken'); } catch {} window.location.replace('/login'); }
                    return;
                }
                if (res.status === 403) { const w = el('navMsgWrap'); if (w) w.style.display = 'none'; return; }
                if (!res.ok) return;
                const data = await res.json();
                setBadge(data.unread || 0);
                processIncomingNotifs(data.conversations || []);
            } catch { /* ignore */ }
        }

        function tick() {
            if (panel.hidden) { refreshBadge(); return; }
            if (view === 'chat') loadThread(false);
            else if (view === 'list') loadConversations();
            else refreshBadge();
        }

        // ── Posizione / apertura ─────────────────────────────────────────────
        function position() {
            if (msgFullscreen) return;
            const r = btn.getBoundingClientRect();
            const width = Math.min(400, window.innerWidth - 16);
            let left = r.right - width;
            if (left < 8) left = 8;
            panel.style.top = (r.bottom + 10) + 'px';
            panel.style.left = left + 'px';
            panel.style.right = 'auto';
            panel.style.width = width + 'px';
            panel.style.bottom = 'auto';
            panel.style.height = '';
            panel.style.maxHeight = '';
            panel.style.borderRadius = '';
        }

        function applyMsgFullscreen(on) {
            msgFullscreen = !!on;
            panel.classList.toggle('nav-bell-fullscreen', msgFullscreen);
            if (msgFullscreen) {
                panel.style.top = '0';
                panel.style.left = '0';
                panel.style.right = '0';
                panel.style.bottom = '0';
                panel.style.width = '100%';
                panel.style.height = '100%';
                panel.style.maxHeight = '100%';
                panel.style.borderRadius = '0';
            } else {
                panel.style.borderRadius = '';
                panel.style.height = '';
                panel.style.maxHeight = '';
                position();
            }
            if (fsBtn) {
                fsBtn.textContent = msgFullscreen ? 'Riduci' : 'Schermo intero';
                fsBtn.title = msgFullscreen ? 'Esci da schermo intero' : 'Vedi a schermo intero';
                fsBtn.setAttribute('aria-pressed', msgFullscreen ? 'true' : 'false');
            }
        }
        if (fsBtn) {
            fsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                applyMsgFullscreen(!msgFullscreen);
            });
        }

        function close() {
            closeMenu();
            if (typeof closeConvMenu === 'function') closeConvMenu();
            closeExtras();
            applyMsgFullscreen(false);
            confirmEl.hidden = true;
            panel.hidden = true;
            panel.classList.remove('open');
            btn.classList.remove('open');
        }
        global.closeNavMessages = close;

        // ── Eliminazione messaggi ────────────────────────────────────────────
        const menuEl = el('navMsgMenu');
        const menuAllBtn = el('navMsgMenuAll');
        const confirmEl = el('navMsgConfirm');
        const confirmText = el('navMsgConfirmText');
        let menuTarget = null;

        function closeMenu() {
            menuEl.hidden = true;
            if (menuTarget) {
                const b = (menuTarget.bubble && menuTarget.bubble.isConnected)
                    ? menuTarget.bubble
                    : findBubbleById(menuTarget.id);
                if (b) b.classList.remove('menu-open');
            }
            menuTarget = null;
        }

        function openMenu(bubble, anchorRect) {
            closeMenu();
            if (typeof closeConvMenu === 'function') closeConvMenu();
            const kind = bubble.getAttribute('data-kind') || 'text';
            const att = bubble.getAttribute('data-att') || '';
            const body = bubble.getAttribute('data-body') || '';
            menuTarget = {
                id: String(bubble.getAttribute('data-mid') || ''),
                mine: bubble.getAttribute('data-mine') === '1',
                kind,
                att,
                body,
                bubble,
            };
            menuAllBtn.hidden = !menuTarget.mine || adminMode;
            menuAllBtn.style.display = (!menuTarget.mine || adminMode) ? 'none' : '';
            const meBtn = menuEl.querySelector('[data-scope="me"]');
            if (meBtn) {
                meBtn.hidden = !!adminMode;
                meBtn.style.display = adminMode ? 'none' : '';
            }
            const selectBtn = menuEl.querySelector('[data-act="select"]');
            if (selectBtn) {
                selectBtn.hidden = !!adminMode;
                selectBtn.style.display = adminMode ? 'none' : '';
            }
            const saveBtn = el('navMsgMenuSave');
            const favBtn = el('navMsgMenuFav');
            const adminDelBtn = el('navMsgMenuAdminDel');
            const canSave = (kind === 'image' || kind === 'video' || kind === 'file') && !!att;
            if (saveBtn) {
                saveBtn.hidden = !canSave;
                saveBtn.style.display = canSave ? '' : 'none';
                saveBtn.textContent = kind === 'video' ? 'Salva video' : (kind === 'file' ? 'Salva documento' : 'Salva foto');
            }
            const canFav = kind === 'sticker' && !!body && !adminMode;
            if (favBtn) {
                const already = favoriteStickers.indexOf(body) >= 0;
                favBtn.hidden = !canFav;
                favBtn.style.display = canFav ? '' : 'none';
                favBtn.textContent = already ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti';
                favBtn.setAttribute('data-fav-mode', already ? 'remove' : 'add');
            }
            if (adminDelBtn) {
                adminDelBtn.hidden = !(isSuperadmin && adminMode);
                adminDelBtn.style.display = (isSuperadmin && adminMode) ? '' : 'none';
            }
            bubble.classList.add('menu-open');
            menuEl.hidden = false;
            const mw = menuEl.offsetWidth || 180;
            const mh = menuEl.offsetHeight || 80;
            let left = anchorRect.right - mw;
            let top = anchorRect.bottom + 4;
            if (left < 8) left = 8;
            if (left + mw > window.innerWidth - 8) left = window.innerWidth - 8 - mw;
            if (top + mh > window.innerHeight - 8) top = anchorRect.top - mh - 4;
            menuEl.style.left = left + 'px';
            menuEl.style.top = top + 'px';
        }

        function askConfirm(message) {
            confirmText.textContent = message;
            confirmEl.hidden = false;
            return new Promise((resolve) => {
                const ok = el('navMsgConfirmOk');
                const cancel = el('navMsgConfirmCancel');
                function done(v) {
                    confirmEl.hidden = true;
                    ok.onclick = null; cancel.onclick = null;
                    resolve(v);
                }
                ok.onclick = () => done(true);
                cancel.onclick = () => done(false);
            });
        }

        async function deleteMessage(id, scope) {
            const res = await fetch('/api/auth/messages/' + encodeURIComponent(id) + '?scope=' + scope, {
                method: 'DELETE',
                headers: authHeader(),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Eliminazione non riuscita.');
            setBadge(data.unread || 0);
            lastRenderedKey = '';
            await loadThread(false);
        }

        threadEl.addEventListener('click', (e) => {
            if (selecting) {
                const bubble = e.target.closest('.nav-msg-bubble');
                if (!bubble) return;
                e.stopPropagation();
                toggleSelect(bubble);
                return;
            }
            const fileBtn = e.target.closest('[data-file-att]');
            if (fileBtn) {
                e.stopPropagation();
                const fid = fileBtn.getAttribute('data-file-att');
                const fname = fileBtn.getAttribute('data-file-name') || '';
                if (!fid) return;
                openFilePreview(fid, fname);
                return;
            }
            const more = e.target.closest('[data-more]');
            if (!more) return;
            e.stopPropagation();
            const bubble = more.closest('.nav-msg-bubble');
            if (!bubble) return;
            if (!menuEl.hidden && menuTarget && menuTarget.id === bubble.getAttribute('data-mid')) { closeMenu(); return; }
            openMenu(bubble, more.getBoundingClientRect());
        });
        threadEl.addEventListener('contextmenu', (e) => {
            const bubble = e.target.closest('.nav-msg-bubble');
            if (!bubble) return;
            e.preventDefault();
            if (selecting) { toggleSelect(bubble); return; }
            openMenu(bubble, { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY });
        });
        menuEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!menuTarget) return;
            const act = e.target.closest('[data-act]');
            if (act) {
                const action = act.getAttribute('data-act');
                const target = menuTarget;
                closeMenu();
                if (action === 'select') {
                    const bubble = (target.bubble && target.bubble.isConnected)
                        ? target.bubble
                        : findBubbleById(target.id);
                    enterSelect(bubble);
                    return;
                }
                if (action === 'save') {
                    try {
                        await saveAttachment(target.att, target.kind);
                        setStatus(statusEl, target.kind === 'video' ? 'Video salvato.' : (target.kind === 'file' ? 'Download documento avviato.' : 'Foto salvata.'));
                    } catch (err) {
                        setStatus(statusEl, err.message || 'Salvataggio non riuscito.', true);
                    }
                    return;
                }
                if (action === 'fav') {
                    try {
                        const mode = act.getAttribute('data-fav-mode');
                        if (mode === 'remove') await removeFavorite(target.body);
                        else await addFavorite(target.body);
                        setStatus(statusEl, mode === 'remove' ? 'Rimosso dai preferiti.' : 'Aggiunto ai preferiti.');
                    } catch (err) {
                        setStatus(statusEl, err.message || 'Operazione non riuscita.', true);
                    }
                    return;
                }
                if (action === 'admin-del') {
                    const ok = await askConfirm('Eliminare definitivamente questo messaggio dall\'archivio?');
                    if (!ok) return;
                    try {
                        const res = await fetch('/api/auth/messages/admin/message/' + encodeURIComponent(target.id), {
                            method: 'DELETE', headers: authHeader(),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(data.error || 'Eliminazione non riuscita.');
                        lastRenderedKey = '';
                        await loadThread(false);
                    } catch (err) {
                        setStatus(statusEl, err.message || 'Eliminazione non riuscita.', true);
                    }
                    return;
                }
            }
            const b = e.target.closest('[data-scope]');
            if (!b) return;
            const target = menuTarget;
            const scope = b.getAttribute('data-scope');
            closeMenu();
            const ok = await askConfirm(scope === 'all'
                ? 'Eliminare questo messaggio per tutti? Sparirà anche al destinatario.'
                : 'Eliminare questo messaggio solo per te? L\'altra persona continuerà a vederlo.');
            if (!ok) return;
            try {
                await deleteMessage(target.id, scope);
            } catch (err) {
                setStatus(statusEl, err.message || 'Eliminazione non riuscita.', true);
            }
        });
        threadEl.addEventListener('scroll', closeMenu);
        confirmEl.addEventListener('click', (e) => e.stopPropagation());

        // ── Eventi ───────────────────────────────────────────────────────────
        async function bulkDelete(scope) {
            const ids = [...selectedMsgs.keys()];
            if (!ids.length) return;
            const res = await fetch('/api/auth/messages/bulk-delete', {
                method: 'POST',
                headers: authHeader(),
                body: JSON.stringify({ ids, scope }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Eliminazione non riuscita.');
            setBadge(data.unread || 0);
            exitSelect();
            lastRenderedKey = '';
            await loadThread(false);
        }

        if (el('navMsgSelectCancel')) el('navMsgSelectCancel').addEventListener('click', (e) => { e.stopPropagation(); exitSelect(); });
        if (el('navMsgSelectMe')) el('navMsgSelectMe').addEventListener('click', async (e) => {
            e.stopPropagation();
            try { await bulkDelete('me'); } catch (err) { setStatus(statusEl, err.message || 'Eliminazione non riuscita.', true); }
        });
        if (el('navMsgSelectAll')) el('navMsgSelectAll').addEventListener('click', async (e) => {
            e.stopPropagation();
            try { await bulkDelete('all'); } catch (err) { setStatus(statusEl, err.message || 'Eliminazione non riuscita.', true); }
        });

        const convMenuEl = el('navMsgConvMenu');
        const convDeleteBtn = el('navMsgConvDelete');
        let convMenuTarget = null;

        function closeConvMenu() {
            if (convMenuEl) convMenuEl.hidden = true;
            convMenuTarget = null;
        }

        function openConvMenu(row, clientX, clientY, opts) {
            if (!convMenuEl || !row) return;
            closeMenu();
            const admin = !!(opts && opts.admin);
            if (admin) {
                const isGroup = row.getAttribute('data-group') === '1';
                convMenuTarget = {
                    admin: true,
                    id: row.getAttribute('data-admin-peer'),
                    label: row.getAttribute('data-label') || '',
                    isGroup,
                    peerA: row.getAttribute('data-a') || '',
                    peerB: row.getAttribute('data-b') || '',
                };
            } else {
                convMenuTarget = {
                    admin: false,
                    id: row.getAttribute('data-peer'),
                    label: row.getAttribute('data-label') || '',
                    isGroup: row.getAttribute('data-group') === '1',
                };
            }
            if (convDeleteBtn) {
                if (admin) {
                    convDeleteBtn.textContent = convMenuTarget.isGroup
                        ? 'Elimina gruppo (definitivo)'
                        : 'Elimina chat (definitivo)';
                } else {
                    convDeleteBtn.textContent = convMenuTarget.isGroup ? 'Elimina gruppo' : 'Elimina chat';
                }
            }
            convMenuEl.hidden = false;
            const mw = convMenuEl.offsetWidth || 180;
            const mh = convMenuEl.offsetHeight || 44;
            let left = clientX;
            let top = clientY;
            if (left + mw > window.innerWidth - 8) left = window.innerWidth - 8 - mw;
            if (left < 8) left = 8;
            if (top + mh > window.innerHeight - 8) top = window.innerHeight - 8 - mh;
            if (top < 8) top = 8;
            convMenuEl.style.left = left + 'px';
            convMenuEl.style.top = top + 'px';
        }

        async function deleteConversationFromList(target) {
            if (!target || !target.id) return;
            if (target.admin) {
                const ok = await askConfirm(target.isGroup
                    ? 'Eliminare definitivamente questo gruppo e tutti i messaggi per tutti gli utenti?'
                    : 'Eliminare definitivamente questa chat e tutti i messaggi per entrambi gli utenti?');
                if (!ok) return;
                try {
                    let res;
                    if (target.isGroup) {
                        res = await fetch('/api/auth/messages/admin/group/' + encodeURIComponent(target.id), {
                            method: 'DELETE',
                            headers: authHeader(),
                        });
                    } else {
                        if (!target.peerA || !target.peerB) throw new Error('Chat non valida.');
                        res = await fetch(
                            '/api/auth/messages/admin/direct/'
                            + encodeURIComponent(target.peerA) + '/'
                            + encodeURIComponent(target.peerB),
                            { method: 'DELETE', headers: authHeader() }
                        );
                    }
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.error || 'Eliminazione non riuscita.');
                    if (view === 'chat' && peer && peer.admin && (
                        (target.isGroup && peer.id === target.id)
                        || (!target.isGroup && peer.peerA === target.peerA && peer.peerB === target.peerB)
                    )) {
                        showView('admin', 'Archivio Criptogram');
                    }
                    if (data.storage) renderStorageBox(data.storage);
                    await loadAdminOverview();
                    setStatus(statusEl, target.isGroup ? 'Gruppo eliminato dall\'archivio.' : 'Chat eliminata dall\'archivio.');
                } catch (err) {
                    setStatus(statusEl, err.message || 'Eliminazione non riuscita.', true);
                }
                return;
            }
            const ok = await askConfirm(target.isGroup
                ? 'Eliminare questo gruppo dalla tua lista? Uscirai dal gruppo.'
                : 'Eliminare questa chat? I messaggi spariranno solo per te.');
            if (!ok) return;
            try {
                let res;
                if (target.isGroup) {
                    res = await fetch('/api/auth/messages/groups/' + encodeURIComponent(target.id) + '/leave', {
                        method: 'POST',
                        headers: authHeader(),
                    });
                } else {
                    res = await fetch('/api/auth/messages/with/' + encodeURIComponent(target.id), {
                        method: 'DELETE',
                        headers: authHeader(),
                    });
                }
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Eliminazione non riuscita.');
                if (data.unread != null) setBadge(data.unread);
                else await refreshBadge();
                if (view === 'chat' && peer && peer.id === target.id) showView('list');
                await loadConversations();
            } catch (err) {
                setStatus(statusEl, err.message || 'Eliminazione non riuscita.', true);
            }
        }

        convsEl.addEventListener('click', (e) => {
            closeConvMenu();
            const row = e.target.closest('[data-peer]');
            if (!row) return;
            openChat(row.getAttribute('data-peer'), row.getAttribute('data-label'), {
                isGroup: row.getAttribute('data-group') === '1',
            });
        });
        convsEl.addEventListener('contextmenu', (e) => {
            const row = e.target.closest('.nav-msg-conv[data-peer]');
            if (!row) return;
            e.preventDefault();
            e.stopPropagation();
            openConvMenu(row, e.clientX, e.clientY);
        });
        if (convMenuEl) {
            convMenuEl.addEventListener('click', async (e) => {
                e.stopPropagation();
                const act = e.target.closest('[data-conv-act]');
                if (!act || !convMenuTarget) return;
                const target = convMenuTarget;
                closeConvMenu();
                if (act.getAttribute('data-conv-act') === 'delete') {
                    await deleteConversationFromList(target);
                }
            });
        }
        newBtn.addEventListener('click', async () => {
            selected = new Set();
            creatingGroup = false;
            searchEl.value = '';
            setStatus(newStatus, '');
            showView('new', 'Nuova chat');
            setCreatingGroup(false);
            await loadDirectory();
            searchEl.focus();
        });
        backBtn.addEventListener('click', async () => {
            if (view === 'new' && creatingGroup) {
                setCreatingGroup(false);
                return;
            }
            if (view === 'chat' && peer && peer.admin) {
                peer = null;
                adminMode = false;
                showView('admin', 'Archivio Criptogram');
                await loadAdminOverview();
                return;
            }
            showView('list');
            await loadConversations();
        });
        searchEl.addEventListener('input', renderPeople);
        if (newGroupBtn) {
            newGroupBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                setCreatingGroup(!creatingGroup);
            });
        }
        peopleEl.addEventListener('click', (e) => {
            const row = e.target.closest('.nav-msg-person[data-uid]');
            if (!row) return;
            const uid = row.getAttribute('data-uid');
            const label = row.getAttribute('data-label') || '';
            if (creatingGroup) {
                if (selected.has(uid)) selected.delete(uid);
                else selected.add(uid);
                row.classList.toggle('picked', selected.has(uid));
                row.classList.remove('pick-anim');
                void row.offsetWidth;
                row.classList.add('pick-anim');
                updateGroupPickBar();
                setStatus(newStatus, '');
                return;
            }
            openChat(uid, label);
        });

        el('navMsgCreateGroup').addEventListener('click', (e) => {
            e.stopPropagation();
            if (!creatingGroup) { setCreatingGroup(true); return; }
            if (selected.size < 1) { setStatus(newStatus, 'Seleziona almeno un partecipante.', true); return; }
            pendingGroupImage = '';
            el('navMsgGroupName').value = '';
            el('navMsgGroupFormStatus').textContent = selected.size + ' partecipanti + tu';
            el('navMsgGroupFormStatus').className = 'nav-msg-status';
            el('navMsgGroupAvPreview').classList.remove('has-img');
            el('navMsgGroupAvPreview').innerHTML = 'GR';
            el('navMsgGroupForm').hidden = false;
            el('navMsgGroupName').focus();
        });
        el('navMsgGroupAvBtn').addEventListener('click', () => el('navMsgGroupAvFile').click());
        el('navMsgGroupAvFile').addEventListener('change', async () => {
            const f = el('navMsgGroupAvFile').files && el('navMsgGroupAvFile').files[0];
            el('navMsgGroupAvFile').value = '';
            if (!f) return;
            try {
                const packed = await fileToDataUrl(f, 'image');
                pendingGroupImage = packed.data;
                el('navMsgGroupAvPreview').innerHTML = '<img src="' + packed.data + '" alt="">';
                el('navMsgGroupAvPreview').classList.add('has-img');
            } catch (err) {
                el('navMsgGroupFormStatus').textContent = err.message || 'Immagine non valida.';
            }
        });
        el('navMsgGroupCancel').addEventListener('click', () => { el('navMsgGroupForm').hidden = true; });
        el('navMsgGroupOk').addEventListener('click', async () => {
            const name = el('navMsgGroupName').value.trim();
            el('navMsgGroupOk').disabled = true;
            try {
                const res = await fetch('/api/auth/messages/groups', {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ name, memberIds: [...selected], image: pendingGroupImage || undefined }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Creazione non riuscita.');
                el('navMsgGroupForm').hidden = true;
                selected = new Set();
                creatingGroup = false;
                pendingGroupImage = '';
                await openChat(data.group.groupId, data.group.peerLabel, { isGroup: true, isAdmin: true });
            } catch (err) {
                el('navMsgGroupFormStatus').textContent = err.message || 'Creazione non riuscita.';
                el('navMsgGroupFormStatus').className = 'nav-msg-status err';
            } finally {
                el('navMsgGroupOk').disabled = false;
            }
        });
        el('navMsgGroupForm').addEventListener('click', (e) => {
            if (e.target.id === 'navMsgGroupForm') el('navMsgGroupForm').hidden = true;
            e.stopPropagation();
        });

        function renderGroupAddList(g) {
            const box = el('navMsgGroupAddList');
            if (!box) return;
            if (!addingMembersOpen || !g || !g.isAdmin) {
                box.hidden = true;
                box.innerHTML = '';
                return;
            }
            const inGroup = new Set((g.members || []).map((m) => m.id));
            const candidates = directory.filter((u) => !inGroup.has(u.id));
            if (!candidates.length) {
                box.hidden = false;
                box.innerHTML = '<div class="nav-bell-empty" style="padding:0.7rem">Nessun altro utente da aggiungere.</div>';
                return;
            }
            box.hidden = false;
            box.innerHTML = candidates.map((u) => {
                const picked = addMemberPick.has(u.id);
                return '<button type="button" class="nav-msg-person' + (picked ? ' picked' : '') + '" data-add-uid="' + escapeAttr(u.id) + '" data-label="' + escapeAttr(u.label) + '">'
                    + avatarHtml(u.id, u.avatarVersion, initials(u.label))
                    + '<span>' + escapeHtml(u.label) + '</span>'
                    + '<span class="nav-msg-person-mark" aria-hidden="true"></span>'
                    + '</button>';
            }).join('')
            + '<div class="nav-msg-add-confirm">'
            + '<button type="button" class="nav-msg-continue" id="navMsgGroupAddConfirm"' + (addMemberPick.size ? '' : ' disabled') + '>Aggiungi'
            + (addMemberPick.size ? ' (' + addMemberPick.size + ')' : '') + '</button></div>';
            hydrateAvatars(box);
        }

        async function loadGroupInfo() {
            if (!peer || !peer.isGroup) return;
            const res = await fetch('/api/auth/messages/groups/' + encodeURIComponent(peer.id), { headers: authHeader() });
            if (!res.ok) return;
            const g = await res.json();
            groupInfoCache = g;
            peer.isAdmin = !!g.isAdmin;
            el('navMsgGroupInfoTitle').textContent = g.name;
            el('navMsgGroupInfoName').value = g.name;
            el('navMsgGroupInfoName').disabled = !g.isAdmin;
            el('navMsgGroupInfoSave').style.display = g.isAdmin ? '' : 'none';
            el('navMsgGroupInfoAvBtn').style.display = g.isAdmin ? '' : 'none';
            const addBtn = el('navMsgGroupAddBtn');
            if (addBtn) {
                addBtn.hidden = !g.isAdmin;
                addBtn.textContent = addingMembersOpen ? 'Nascondi elenco' : 'Aggiungi partecipanti';
            }
            const av = el('navMsgGroupInfoAv');
            av.textContent = initials(g.name);
            av.classList.remove('has-img');
            av.setAttribute('data-av-kind', 'group');
            av.setAttribute('data-av-id', g.id);
            av.setAttribute('data-av-ver', String(g.avatarVersion || 0));
            hydrateAvatars(av.parentElement);
            el('navMsgGroupMembers').innerHTML = (g.members || []).map((m) => {
                const actions = [];
                if (g.isAdmin && !m.me) {
                    actions.push(
                        '<button type="button" data-role="' + (m.role === 'admin' ? '0' : '1') + '" data-uid="' + escapeAttr(m.id) + '">'
                        + (m.role === 'admin' ? 'Togli amministratore' : 'Rendi amministratore') + '</button>'
                    );
                    actions.push(
                        '<button type="button" class="danger" data-remove="' + escapeAttr(m.id) + '">Rimuovi</button>'
                    );
                }
                return '<div class="nav-msg-member" data-uid="' + escapeAttr(m.id) + '">'
                    + avatarHtml(m.id, m.avatarVersion, initials(m.label))
                    + '<span class="nav-msg-member-name">' + escapeHtml(m.label) + (m.me ? ' (tu)' : '') + '</span>'
                    + (m.role === 'admin' ? '<span class="nav-msg-role">Amministratore</span>' : '')
                    + (actions.length ? '<span class="nav-msg-member-actions">' + actions.join('') + '</span>' : '')
                    + '</div>';
            }).join('');
            hydrateAvatars(el('navMsgGroupMembers'));
            if (g.isAdmin && (!directory.length)) await loadDirectory();
            renderGroupAddList(g);
            el('navMsgGroupInfoStatus').textContent = '';
            el('navMsgGroupInfoStatus').className = 'nav-msg-status';
            el('navMsgGroupInfo').hidden = false;
        }

        async function leaveCurrentGroup() {
            if (!peer || !peer.isGroup) return;
            const alone = !!(groupInfoCache && (groupInfoCache.members || []).length <= 1);
            const ok = await askConfirm(alone
                ? 'Sei l\'unico partecipante. Uscendo il gruppo verrà eliminato. Continuare?'
                : 'Uscire dal gruppo? Non riceverai più i messaggi di questa chat.');
            if (!ok) return;
            try {
                const res = await fetch('/api/auth/messages/groups/' + encodeURIComponent(peer.id) + '/leave', {
                    method: 'POST',
                    headers: authHeader(),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Uscita non riuscita.');
                el('navMsgGroupInfo').hidden = true;
                addingMembersOpen = false;
                addMemberPick = new Set();
                groupInfoCache = null;
                showView('list');
                await loadConversations();
            } catch (err) {
                el('navMsgGroupInfoStatus').textContent = err.message || 'Uscita non riuscita.';
                el('navMsgGroupInfoStatus').className = 'nav-msg-status err';
            }
        }

        titleEl.addEventListener('click', () => {
            if (view === 'chat' && peer && peer.isGroup) {
                addingMembersOpen = false;
                addMemberPick = new Set();
                loadGroupInfo();
            }
        });
        titleEl.style.cursor = 'pointer';
        el('navMsgGroupInfoClose').addEventListener('click', () => {
            el('navMsgGroupInfo').hidden = true;
            addingMembersOpen = false;
            addMemberPick = new Set();
        });
        el('navMsgGroupInfo').addEventListener('click', (e) => {
            if (e.target.id === 'navMsgGroupInfo') {
                el('navMsgGroupInfo').hidden = true;
                addingMembersOpen = false;
                addMemberPick = new Set();
            }
            e.stopPropagation();
        });
        if (el('navMsgGroupAddBtn')) {
            el('navMsgGroupAddBtn').addEventListener('click', async () => {
                if (!peer || !peer.isGroup) return;
                addingMembersOpen = !addingMembersOpen;
                addMemberPick = new Set();
                if (addingMembersOpen && !directory.length) await loadDirectory();
                el('navMsgGroupAddBtn').textContent = addingMembersOpen ? 'Nascondi elenco' : 'Aggiungi partecipanti';
                renderGroupAddList(groupInfoCache);
            });
        }
        if (el('navMsgGroupLeave')) {
            el('navMsgGroupLeave').addEventListener('click', (e) => {
                e.stopPropagation();
                leaveCurrentGroup();
            });
        }
        if (el('navMsgGroupAddList')) {
            el('navMsgGroupAddList').addEventListener('click', async (e) => {
                const confirm = e.target.closest('#navMsgGroupAddConfirm');
                if (confirm) {
                    if (!addMemberPick.size || !peer) return;
                    confirm.disabled = true;
                    try {
                        const res = await fetch('/api/auth/messages/groups/' + encodeURIComponent(peer.id) + '/members', {
                            method: 'POST',
                            headers: authHeader(),
                            body: JSON.stringify({ memberIds: [...addMemberPick] }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(data.error || 'Aggiunta non riuscita.');
                        addMemberPick = new Set();
                        addingMembersOpen = false;
                        await loadGroupInfo();
                    } catch (err) {
                        el('navMsgGroupInfoStatus').textContent = err.message || 'Aggiunta non riuscita.';
                        el('navMsgGroupInfoStatus').className = 'nav-msg-status err';
                        confirm.disabled = false;
                    }
                    return;
                }
                const row = e.target.closest('[data-add-uid]');
                if (!row) return;
                const uid = row.getAttribute('data-add-uid');
                if (addMemberPick.has(uid)) addMemberPick.delete(uid);
                else addMemberPick.add(uid);
                row.classList.toggle('picked', addMemberPick.has(uid));
                row.classList.remove('pick-anim');
                void row.offsetWidth;
                row.classList.add('pick-anim');
                renderGroupAddList(groupInfoCache);
            });
        }
        el('navMsgGroupInfoSave').addEventListener('click', async () => {
            const name = el('navMsgGroupInfoName').value.trim();
            try {
                const res = await fetch('/api/auth/messages/groups/' + encodeURIComponent(peer.id), {
                    method: 'PATCH',
                    headers: authHeader(),
                    body: JSON.stringify({ name }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Salvataggio non riuscito.');
                peer.label = data.name;
                titleEl.textContent = data.name;
                el('navMsgGroupInfo').hidden = true;
            } catch (err) {
                el('navMsgGroupInfoStatus').textContent = err.message;
                el('navMsgGroupInfoStatus').className = 'nav-msg-status err';
            }
        });
        el('navMsgGroupInfoAvBtn').addEventListener('click', () => el('navMsgGroupInfoAvFile').click());
        el('navMsgGroupInfoAvFile').addEventListener('change', async () => {
            const f = el('navMsgGroupInfoAvFile').files && el('navMsgGroupInfoAvFile').files[0];
            el('navMsgGroupInfoAvFile').value = '';
            if (!f || !peer) return;
            try {
                const packed = await fileToDataUrl(f, 'image');
                const res = await fetch('/api/auth/messages/groups/' + encodeURIComponent(peer.id) + '/avatar', {
                    method: 'PUT',
                    headers: authHeader(),
                    body: JSON.stringify({ image: packed.data }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Immagine non salvata.');
                setHeadAvatar(peer.id, peer.label, data.avatarVersion || 0, 'group');
                await loadGroupInfo();
            } catch (err) {
                el('navMsgGroupInfoStatus').textContent = err.message;
                el('navMsgGroupInfoStatus').className = 'nav-msg-status err';
            }
        });
        el('navMsgGroupMembers').addEventListener('click', async (e) => {
            if (!peer) return;
            const rem = e.target.closest('[data-remove]');
            if (rem) {
                const uid = rem.getAttribute('data-remove');
                const leaving = !!(groupInfoCache && (groupInfoCache.members || []).some((m) => m.id === uid && m.me));
                if (leaving) {
                    await leaveCurrentGroup();
                    return;
                }
                const ok = await askConfirm('Rimuovere questo partecipante dal gruppo?');
                if (!ok) return;
                try {
                    const res = await fetch('/api/auth/messages/groups/' + encodeURIComponent(peer.id) + '/members/' + encodeURIComponent(uid), {
                        method: 'DELETE',
                        headers: authHeader(),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.error || 'Rimozione non riuscita.');
                    await loadGroupInfo();
                } catch (err) {
                    el('navMsgGroupInfoStatus').textContent = err.message;
                    el('navMsgGroupInfoStatus').className = 'nav-msg-status err';
                }
                return;
            }
            const b = e.target.closest('[data-role]');
            if (!b) return;
            try {
                const res = await fetch('/api/auth/messages/groups/' + encodeURIComponent(peer.id) + '/admins', {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ userId: b.getAttribute('data-uid'), admin: b.getAttribute('data-role') === '1' }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Operazione non riuscita.');
                await loadGroupInfo();
            } catch (err) {
                el('navMsgGroupInfoStatus').textContent = err.message;
                el('navMsgGroupInfoStatus').className = 'nav-msg-status err';
            }
        });
        sendBtn.addEventListener('click', sendCurrent);
        textEl.addEventListener('input', () => {
            composeSyncEmpty();
            const raw = composeGetRaw();
            if (raw.length > 2000) {
                setStatus(statusEl, 'Limite 2000 caratteri.', true);
            }
            autosize(textEl);
        });
        textEl.addEventListener('paste', (e) => {
            e.preventDefault();
            const plain = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
            document.execCommand('insertText', false, plain.replace(/\r\n/g, '\n'));
            composeSyncEmpty();
            autosize(textEl);
        });
        textEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrent(); }
        });

        attachBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            pickerEl.classList.remove('visible');
            attachMenu.hidden = !attachMenu.hidden;
        });
        attachMenu.addEventListener('click', (e) => {
            const b = e.target.closest('[data-att]');
            if (!b) return;
            attachMenu.hidden = true;
            const which = b.getAttribute('data-att');
            if (which === 'video') fileVideo.click();
            else if (which === 'file') fileDoc.click();
            else fileImage.click();
        });
        fileImage.addEventListener('change', () => {
            const f = fileImage.files && fileImage.files[0];
            fileImage.value = '';
            if (f) setPending(f, 'image');
        });
        fileVideo.addEventListener('change', () => {
            const f = fileVideo.files && fileVideo.files[0];
            fileVideo.value = '';
            if (f) setPending(f, 'video');
        });
        if (fileDoc) {
            fileDoc.addEventListener('change', () => {
                const f = fileDoc.files && fileDoc.files[0];
                fileDoc.value = '';
                if (f) setPending(f, 'file');
            });
        }
        el('navMsgPreviewClear').addEventListener('click', () => {
            clearPending();
            composeSetPlaceholder('Messaggio');
        });
        emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            attachMenu.hidden = true;
            fillPickers();
            pickerEl.classList.toggle('visible');
        });
        pickerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const tab = e.target.closest('[data-tab]');
            if (tab) {
                const which = tab.getAttribute('data-tab');
                pickerEl.querySelectorAll('.nav-msg-picker-tabs button').forEach((b) => b.classList.toggle('active', b === tab));
                emojiGrid.hidden = which !== 'emoji';
                stickerGrid.hidden = which !== 'sticker';
                if (which === 'sticker') fillPickers();
                return;
            }
            const st = e.target.closest('[data-sticker]');
            if (st) {
                const name = st.getAttribute('data-sticker');
                const fromEmojiPack = st.getAttribute('data-emoji-pack') === '1'
                    || (st.closest('#navMsgEmojiGrid') && emojiGrid && !emojiGrid.hidden);
                if (fromEmojiPack) {
                    queuePackEmoji(name);
                } else {
                    pickerEl.classList.remove('visible');
                    sendSticker(name);
                }
            }
        });
        if (stickerGrid) {
            stickerGrid.addEventListener('contextmenu', async (e) => {
                const st = e.target.closest('[data-sticker]');
                if (!st) return;
                e.preventDefault();
                try {
                    await removeFavorite(st.getAttribute('data-sticker'));
                    setStatus(statusEl, 'Rimosso dai preferiti.');
                } catch (err) {
                    setStatus(statusEl, err.message || 'Rimozione non riuscita.', true);
                }
            });
        }
        if (emojiGrid) {
            emojiGrid.addEventListener('contextmenu', async (e) => {
                const st = e.target.closest('[data-sticker]');
                if (!st) return;
                e.preventDefault();
                try {
                    await addFavorite(st.getAttribute('data-sticker'));
                    setStatus(statusEl, 'Aggiunto ai preferiti (scheda Sticker).');
                } catch (err) {
                    setStatus(statusEl, err.message || 'Preferito non salvato.', true);
                }
            });
        }
        if (adminBtn) {
            adminBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                showView('admin', 'Archivio Criptogram');
                await loadAdminOverview();
            });
        }
        if (storageBox) {
            storageBox.addEventListener('click', async (e) => {
                e.stopPropagation();
                await loadFileManager();
            });
        }
        if (el('navMsgFmBack')) {
            el('navMsgFmBack').addEventListener('click', async () => {
                showAdminFm(false);
                await loadAdminOverview();
            });
        }
        if (fmSortBtn && fmSortMenu) {
            fmSortBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const open = fmSortMenu.hidden;
                if (open) {
                    fmSortMenu.hidden = false;
                    if (fmSortWrap) fmSortWrap.classList.add('open');
                    fmSortBtn.setAttribute('aria-expanded', 'true');
                } else {
                    closeFmSort();
                }
            });
            fmSortMenu.addEventListener('click', (e) => {
                const opt = e.target.closest('[data-sort]');
                if (!opt) return;
                fmSortMode = opt.getAttribute('data-sort') || 'bytes';
                if (fmSortLabel) fmSortLabel.textContent = opt.textContent.trim();
                fmSortMenu.querySelectorAll('[data-sort]').forEach((btn) => {
                    btn.classList.toggle('active', btn === opt);
                });
                closeFmSort();
                renderFileManager();
            });
        }
        if (fmListEl) {
            fmListEl.addEventListener('click', async (e) => {
                const toggle = e.target.closest('[data-fm-toggle]');
                if (toggle) {
                    const id = toggle.getAttribute('data-fm-toggle');
                    fmExpanded = fmExpanded === id ? '' : id;
                    renderFileManager();
                    return;
                }
                const openBtn = e.target.closest('[data-fm-open]');
                if (openBtn) {
                    const c = findFmChat(openBtn.getAttribute('data-fm-open'));
                    if (!c) return;
                    if (c.type === 'group') {
                        openAdminChat({ isGroup: true, groupId: c.groupId || c.peerId, label: c.peerLabel });
                    } else {
                        openAdminChat({ isGroup: false, peerA: c.peerA, peerB: c.peerB, label: c.peerLabel });
                    }
                    return;
                }
                const delChat = e.target.closest('[data-fm-del-chat]');
                if (delChat) {
                    const c = findFmChat(delChat.getAttribute('data-fm-del-chat'));
                    if (!c) return;
                    const ok = await askConfirm(c.type === 'group'
                        ? 'Eliminare definitivamente questo gruppo e tutti i contenuti?'
                        : 'Eliminare definitivamente questa chat e tutti i contenuti?');
                    if (!ok) return;
                    try {
                        let res;
                        if (c.type === 'group') {
                            res = await fetch('/api/auth/messages/admin/group/' + encodeURIComponent(c.groupId || c.peerId), {
                                method: 'DELETE', headers: authHeader(),
                            });
                        } else {
                            res = await fetch(
                                '/api/auth/messages/admin/direct/'
                                + encodeURIComponent(c.peerA) + '/'
                                + encodeURIComponent(c.peerB),
                                { method: 'DELETE', headers: authHeader() }
                            );
                        }
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(data.error || 'Eliminazione non riuscita.');
                        if (data.storage) renderStorageBox(data.storage);
                        setStatus(statusEl, 'Chat eliminata dal file manager.');
                        await loadFileManager();
                    } catch (err) {
                        setStatus(statusEl, err.message || 'Eliminazione non riuscita.', true);
                    }
                    return;
                }
                const delAtt = e.target.closest('[data-fm-del-att]');
                if (delAtt) {
                    const ok = await askConfirm('Eliminare definitivamente questo allegato?');
                    if (!ok) return;
                    try {
                        const res = await fetch('/api/auth/messages/admin/attachment/' + encodeURIComponent(delAtt.getAttribute('data-fm-del-att')), {
                            method: 'DELETE', headers: authHeader(),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(data.error || 'Eliminazione non riuscita.');
                        if (data.storage) renderStorageBox(data.storage);
                        setStatus(statusEl, 'Allegato eliminato.');
                        await loadFileManager();
                    } catch (err) {
                        setStatus(statusEl, err.message || 'Eliminazione non riuscita.', true);
                    }
                }
            });
        }
        if (adminChatsEl) {
            adminChatsEl.addEventListener('click', (e) => {
                closeConvMenu();
                const row = e.target.closest('[data-admin-peer]');
                if (!row) return;
                if (row.getAttribute('data-group') === '1') {
                    openAdminChat({ isGroup: true, groupId: row.getAttribute('data-admin-peer'), label: row.getAttribute('data-label') });
                } else {
                    openAdminChat({
                        isGroup: false,
                        peerA: row.getAttribute('data-a'),
                        peerB: row.getAttribute('data-b'),
                        label: row.getAttribute('data-label'),
                    });
                }
            });
            adminChatsEl.addEventListener('contextmenu', (e) => {
                const row = e.target.closest('.nav-msg-conv[data-admin-peer]');
                if (!row) return;
                e.preventDefault();
                e.stopPropagation();
                openConvMenu(row, e.clientX, e.clientY, { admin: true });
            });
        }
        if (adminFilesEl) {
            adminFilesEl.addEventListener('click', async (e) => {
                const b = e.target.closest('[data-del-att]');
                if (!b) return;
                const ok = await askConfirm('Eliminare questo allegato dal database? I messaggi collegati resteranno senza media.');
                if (!ok) return;
                try {
                    const res = await fetch('/api/auth/messages/admin/attachment/' + encodeURIComponent(b.getAttribute('data-del-att')), {
                        method: 'DELETE', headers: authHeader(),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.error || 'Eliminazione non riuscita.');
                    renderStorageBox(data.storage);
                    await loadAdminOverview();
                } catch (err) {
                    setStatus(statusEl, err.message || 'Eliminazione non riuscita.', true);
                }
            });
        }
        el('navMsgViewAdmin') && el('navMsgViewAdmin').querySelectorAll('[data-admin-tab]').forEach((tab) => {
            tab.addEventListener('click', () => {
                const which = tab.getAttribute('data-admin-tab');
                el('navMsgViewAdmin').querySelectorAll('[data-admin-tab]').forEach((b) => b.classList.toggle('active', b === tab));
                adminChatsEl.hidden = which !== 'chats';
                adminFilesEl.hidden = which !== 'files';
            });
        });
        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fillThemePresets();
            themePanel.hidden = !themePanel.hidden;
        });
        el('navMsgThemePresets').addEventListener('click', (e) => {
            const sw = e.target.closest('[data-preset]');
            if (!sw) return;
            const p = THEME_PRESETS.find((x) => x.id === sw.getAttribute('data-preset'));
            if (!p) return;
            chooseTheme({ preset: p.id, ...p }, { immediate: true });
        });
        el('navMsgColorMine').addEventListener('input', () => {
            chooseTheme({
                preset: 'custom',
                mine: el('navMsgColorMine').value,
                mine2: el('navMsgColorMine').value,
                theirs: el('navMsgColorTheirs').value,
            });
        });
        el('navMsgColorTheirs').addEventListener('input', () => {
            chooseTheme({
                preset: 'custom',
                mine: el('navMsgColorMine').value,
                mine2: el('navMsgColorMine').value,
                theirs: el('navMsgColorTheirs').value,
            });
        });
        themePanel.addEventListener('click', (e) => {
            if (e.target === themePanel) themePanel.hidden = true;
            e.stopPropagation();
        });
        threadEl.addEventListener('click', (e) => {
            const img = e.target.closest('.nav-msg-media img');
            if (img && img.src) {
                e.stopPropagation();
                lightEl.innerHTML = '<img src="' + img.src + '" alt="">';
                lightEl.hidden = false;
            }
        });
        lightEl.addEventListener('click', (e) => {
            if (e.target === lightEl || e.target.closest('.close-light')) closeFileLight();
        });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const willOpen = panel.hidden || !panel.classList.contains('open');
            if (!willOpen) { close(); return; }
            ensureDesktopNotifPermission();
            if (typeof closeNavBell === 'function') closeNavBell();
            applyMsgFullscreen(false);
            panel.hidden = false;
            panel.classList.add('open');
            btn.classList.add('open');
            position();
            if (view === 'chat' && peer) loadThread(true);
            else if (view === 'admin') loadAdminOverview();
            else { showView('list'); loadConversations(); }
            if (location.hash === '#criptogram-archivio' && isSuperadmin) {
                showView('admin', 'Archivio Criptogram');
                loadAdminOverview();
                try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
            }
        });
        // Se il Super Admin arriva da una notifica spazio
        if (location.hash === '#criptogram-archivio') {
            setTimeout(async () => {
                try {
                    const res = await fetch('/api/auth/messages', { headers: authHeader() });
                    if (!res.ok) return;
                    const data = await res.json();
                    isSuperadmin = !!data.isSuperadmin;
                    if (!isSuperadmin) return;
                    if (typeof closeNavBell === 'function') closeNavBell();
                    applyMsgFullscreen(false);
                    panel.hidden = false;
                    panel.classList.add('open');
                    btn.classList.add('open');
                    position();
                    showView('admin', 'Archivio Criptogram');
                    await loadAdminOverview();
                    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
                } catch { /* ignore */ }
            }, 400);
        }
        panel.addEventListener('click', (e) => {
            const av = e.target.closest('.nav-msg-avatar');
            if (av && av.querySelector('img')) {
                e.preventDefault();
                e.stopPropagation();
                openAvatarLightbox(av.querySelector('img').src);
            }
        }, true);
        panel.addEventListener('click', (e) => {
            e.stopPropagation();
            closeMenu();
            closeConvMenu();
            if (!e.target.closest('#navMsgAttachMenu, #navMsgAttachBtn')) attachMenu.hidden = true;
            if (!e.target.closest('#navMsgPicker, #navMsgEmojiBtn')) pickerEl.classList.remove('visible');
            if (!e.target.closest('#navMsgFmSort')) closeFmSort();
        });
        // Con il mouse sulla chat: lo scroll non deve mai propagarsi al portale.
        panel.addEventListener('wheel', (e) => {
            if (panel.hidden || !panel.classList.contains('open')) return;
            let node = e.target;
            while (node && node !== panel) {
                if (node.nodeType === 1) {
                    const style = window.getComputedStyle(node);
                    const oy = style.overflowY;
                    const canY = (oy === 'auto' || oy === 'scroll' || oy === 'overlay')
                        && node.scrollHeight > node.clientHeight + 1;
                    if (canY) {
                        const delta = e.deltaY;
                        const top = node.scrollTop <= 0;
                        const bottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
                        if ((delta < 0 && top) || (delta > 0 && bottom)) e.preventDefault();
                        return;
                    }
                }
                node = node.parentNode;
            }
            e.preventDefault();
        }, { passive: false });
        document.addEventListener('click', (e) => {
            if (msgFullscreen) return;
            if (e.target.closest('#navMsgWrap, #navMsgPanel, #navMsgMenu, #navMsgConvMenu, #navAvatarLight')) return;
            close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || panel.hidden) return;
            if (!menuEl.hidden) { closeMenu(); return; }
            if (convMenuEl && !convMenuEl.hidden) { closeConvMenu(); return; }
            if (!confirmEl.hidden) { confirmEl.hidden = true; return; }
            if (selecting) { exitSelect(); return; }
            if (lightEl && !lightEl.hidden) { lightEl.hidden = true; lightEl.innerHTML = ''; return; }
            if (themePanel && !themePanel.hidden) { themePanel.hidden = true; return; }
            const gf = el('navMsgGroupForm'); if (gf && !gf.hidden) { gf.hidden = true; return; }
            const gi = el('navMsgGroupInfo'); if (gi && !gi.hidden) { gi.hidden = true; return; }
            if (pickerEl && pickerEl.classList.contains('visible')) { pickerEl.classList.remove('visible'); return; }
            if (attachMenu && !attachMenu.hidden) { attachMenu.hidden = true; return; }
            if (fmSortMenu && !fmSortMenu.hidden) { closeFmSort(); return; }
            if (msgFullscreen) { applyMsgFullscreen(false); e.preventDefault(); return; }
            if (view !== 'list') { showView('list'); loadConversations(); return; }
            close();
        });
        window.addEventListener('resize', () => { if (!panel.hidden && !msgFullscreen) position(); });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') tick();
        });

        refreshBadge();
        pollTimer = setInterval(tick, 4000);
    }
})(window);