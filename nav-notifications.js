/**
 * Campanella notifiche condivisa (tutti gli utenti autenticati).
 * Richiede nel DOM: #navBellWrap, #navBellBtn, #navBellBadge, #navBellPanel, #navBellList
 * Opzionale: #navBellMarkAll
 */
(function (global) {
    function authHeader() {
        return {
            Authorization: 'Bearer ' + localStorage.getItem('authToken'),
            'Content-Type': 'application/json',
        };
    }

    function positionNavBellPanel() {
        const btn = document.getElementById('navBellBtn');
        const panel = document.getElementById('navBellPanel');
        if (!btn || !panel) return;
        const r = btn.getBoundingClientRect();
        const width = Math.min(360, window.innerWidth - 16);
        let left = r.right - width;
        if (left < 8) left = 8;
        panel.style.top = r.bottom + 10 + 'px';
        panel.style.left = left + 'px';
        panel.style.right = 'auto';
        panel.style.width = width + 'px';
    }

    function closeNavBell() {
        const panel = document.getElementById('navBellPanel');
        const btn = document.getElementById('navBellBtn');
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
                const unreadCls = n.read ? '' : ' unread';
                return `<a class="nav-bell-item${unreadCls}" href="${href}" data-nid="${n.id}">
                    <strong>${escapeHtml(n.title)}</strong>
                    <span>${escapeHtml(n.body || '')}</span>
                    <time>${when}</time>
                </a>`;
            })
            .join('');

        list.querySelectorAll('.nav-bell-item[data-nid]').forEach((el) => {
            el.addEventListener('click', () => {
                const id = el.getAttribute('data-nid');
                if (id) markRead(id);
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

    async function markRead(id) {
        try {
            const res = await fetch('/api/auth/notifications/' + encodeURIComponent(id) + '/read', {
                method: 'POST',
                headers: authHeader(),
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

    function initNavBell() {
        const wrap = document.getElementById('navBellWrap');
        const btn = document.getElementById('navBellBtn');
        const panel = document.getElementById('navBellPanel');
        if (!btn || !panel) return;

        if (wrap) wrap.style.display = '';
        if (panel.parentElement !== document.body) document.body.appendChild(panel);
        panel.hidden = true;
        panel.classList.remove('open');

        // Link "Segna tutte" nell'header del pannello
        const head = panel.querySelector('.nav-bell-panel-head');
        if (head && !document.getElementById('navBellMarkAll')) {
            const a = document.createElement('a');
            a.id = 'navBellMarkAll';
            a.href = '#';
            a.textContent = 'Segna tutte';
            a.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                markAllRead();
            });
            head.appendChild(a);
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = panel.hidden || !panel.classList.contains('open');
            if (willOpen) {
                positionNavBellPanel();
                panel.hidden = false;
                panel.classList.add('open');
                btn.classList.add('open');
                refreshNavBell();
            } else {
                closeNavBell();
            }
        });
        document.addEventListener('click', () => closeNavBell());
        panel.addEventListener('click', (e) => e.stopPropagation());
        window.addEventListener('resize', () => {
            if (!panel.hidden) positionNavBellPanel();
        });

        refreshNavBell();
        setInterval(refreshNavBell, 45000);
    }

    global.initNavBell = initNavBell;
    global.refreshNavBell = refreshNavBell;
    global.closeNavBell = closeNavBell;
})(window);
