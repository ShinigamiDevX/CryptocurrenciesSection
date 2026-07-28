/**
 * Campanella notifiche condivisa (tutti gli utenti autenticati).
 * Richiede nel DOM: #navBellWrap, #navBellBtn, #navBellBadge, #navBellPanel, #navBellList
 * Opzionale: #navBellMarkAll, #navBellFullscreen
 */
(function (global) {
    let _fullscreen = false;

    function authHeader() {
        return {
            Authorization: 'Bearer ' + localStorage.getItem('authToken'),
            'Content-Type': 'application/json',
        };
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

    function renderItems(items) {
        const list = document.getElementById('navBellList');
        if (!list) return;
        if (!items.length) {
            list.innerHTML = '<div class="nav-bell-empty">Nessuna notifica.</div>';
            return;
        }
        list.innerHTML = items
            .map((n) => {
                const when = new Date(n.createdAt).toLocaleString('it-IT', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                });
                const href = n.link || '#';
                const unread = !n.read;
                const unreadCls = unread ? ' unread' : '';
                const markBtn = unread
                    ? `<button type="button" class="nav-bell-mark-one" data-mark="${n.id}">Segna come letto</button>`
                    : '';
                return `<div class="nav-bell-item${unreadCls}" data-nid="${n.id}">
                    <a class="nav-bell-item-body" href="${escapeAttr(href)}" data-nid="${n.id}">
                        <strong>${escapeHtml(n.title)}</strong>
                        <span>${escapeHtml(n.body || '')}</span>
                        <time>${when}</time>
                    </a>
                    ${markBtn}
                </div>`;
            })
            .join('');

        list.querySelectorAll('.nav-bell-mark-one').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.getAttribute('data-mark');
                if (!id) return;
                btn.disabled = true;
                await markRead(id);
                const item = btn.closest('.nav-bell-item');
                if (item) {
                    item.classList.remove('unread');
                    btn.remove();
                }
            });
        });

        list.querySelectorAll('.nav-bell-item-body[data-nid]').forEach((el) => {
            el.addEventListener('click', async (e) => {
                const id = el.getAttribute('data-nid');
                if (!id) return;
                const href = el.getAttribute('href') || '#';
                const hasLink = href && href !== '#';
                const item = el.closest('.nav-bell-item');

                if (item && item.classList.contains('unread')) {
                    item.classList.remove('unread');
                    const mark = item.querySelector('.nav-bell-mark-one');
                    if (mark) mark.remove();
                    e.preventDefault();
                    await markRead(id);
                    if (hasLink) {
                        if (href.startsWith('/') || href.startsWith(window.location.origin)) {
                            window.location.href = href;
                        } else {
                            window.open(href, '_blank', 'noopener');
                        }
                    }
                    return;
                }

                if (!hasLink) e.preventDefault();
            });
        });
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

    async function markRead(id) {
        try {
            const res = await fetch('/api/auth/notifications/' + encodeURIComponent(id) + '/read', {
                method: 'POST',
                headers: authHeader(),
                keepalive: true,
            });
            if (res.ok) {
                const data = await res.json();
                setUnreadBadge(data.unread || 0);
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
            setUnreadBadge(data.unread || 0);
            renderItems(data.items || []);
        } catch { /* silenzioso */ }
    }

    function ensureHeadActions(panel) {
        const head = panel.querySelector('.nav-bell-panel-head');
        if (!head) return;

        let actions = head.querySelector('.nav-bell-head-actions');
        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'nav-bell-head-actions';
            // sposta eventuali link già presenti
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
    }

    function initNavBell() {
        const wrap = document.getElementById('navBellWrap');
        const btn = document.getElementById('navBellBtn');
        const panel = document.getElementById('navBellPanel');
        if (!btn || !panel) return;

        if (wrap) wrap.style.display = '';
        if (panel.parentElement !== document.body) document.body.appendChild(panel);
        panel.hidden = true;
        panel.classList.remove('open', 'nav-bell-fullscreen');
        _fullscreen = false;

        ensureHeadActions(panel);

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = panel.hidden || !panel.classList.contains('open');
            if (willOpen) {
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
            if (_fullscreen) return; // in schermo intero non chiudere al click esterno
            closeNavBell();
        });
        panel.addEventListener('click', (e) => e.stopPropagation());

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (panel.hidden) return;
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
    }

    global.initNavBell = initNavBell;
    global.refreshNavBell = refreshNavBell;
    global.closeNavBell = closeNavBell;
})(window);
