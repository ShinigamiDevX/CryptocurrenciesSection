(function () {
    const STORAGE_KEY = 'globalSidebarCollapsed';

    function createLink(href, card, icon, label, sub, opts) {
        const a = document.createElement('a');
        a.className = 'global-side-link';
        a.href = href;
        a.setAttribute('data-card', card);
        if (opts && opts.external) {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        }
        if (opts && opts.sso) {
            a.setAttribute('data-sso-tool', opts.sso);
        }
        if (opts && opts.placeholder) {
            a.setAttribute('data-placeholder', opts.placeholder);
        }

        a.innerHTML = [
            '<span class="global-side-icon"><img src="/icons/line/' + icon + '.svg" alt=""></span>',
            '<span class="global-side-label">',
            '  <span>' + label + '</span>',
            '  <span class="global-side-sub">' + sub + '</span>',
            '</span>'
        ].join('');
        return a;
    }

    function ensureGlobalSidebar(user) {
        const hasUser = !!user;
        if (!hasUser) return null;

        let sidebar = document.getElementById('globalSidebar');
        if (!sidebar) {
            sidebar = document.createElement('aside');
            sidebar.id = 'globalSidebar';
            sidebar.className = 'global-sidebar';
            sidebar.innerHTML = [
                '<div class="global-sidebar-head">',
                '  <div class="global-sidebar-title">Strumenti</div>',
                '  <button id="globalSidebarToggle" class="global-sidebar-toggle" type="button" aria-label="Collapse sidebar">⟨⟩</button>',
                '</div>',
                '<nav id="globalSidebarNav" class="global-sidebar-nav"></nav>'
            ].join('');
            document.body.appendChild(sidebar);
        }

        const nav = sidebar.querySelector('#globalSidebarNav');
        nav.innerHTML = '';
        nav.appendChild(createLink('/portal', 'dashboard', 'home', 'Dashboard', 'Panoramica'));
        nav.appendChild(createLink('#', 'blockchain', 'link', 'Tracciamento', 'Blockchain', { placeholder: 'Tracciamento Blockchain: in arrivo.' }));
        nav.appendChild(createLink('#', 'osint', 'search-alt', 'OSINT', 'Intelligence', { placeholder: 'OSINT & Intelligence: in arrivo.' }));
        nav.appendChild(createLink('http://192.168.1.73:3000/login?callbackUrl=http%3A%2F%2F192.168.1.73%3A3000%2Fdashboard%2Frequests', 'chainholder', 'folder-lock', 'Chainholder', 'Docs & archivio', { external: true, sso: 'chainholder' }));
        nav.appendChild(createLink('/corsi', 'corsi', 'graduation-cap', 'Corsi', 'Formazione'));
        nav.appendChild(createLink('https://192.168.4.80:3444', 'cluster', 'layer-group', 'Cluster', 'Reactor', { external: true }));
        nav.appendChild(createLink('#', 'ai', 'robot', 'AI', 'Assistente', { placeholder: 'AI: in arrivo.' }));
        nav.appendChild(createLink('/analisi-report', 'analisi-report', 'analytics', 'Analisi', 'Report'));
        nav.appendChild(createLink('https://192.168.4.80:5173', 'cryptomonitor', 'desktop', 'CryptoMonitor', 'Monitoraggio', { external: true, sso: 'cryptomonitor' }));
        nav.appendChild(createLink('https://192.168.4.80:5174', 'materiali', 'books', 'Materiali', 'Archivio', { external: true }));
        nav.appendChild(createLink('/profilo', 'profilo', 'user-circle', 'Profilo', 'Il mio account'));

        const isSuper = user.role === 'superadmin';
        const isAdmin = user.role === 'admin' || isSuper;
        const isStrumento = user.accountType === 'strumento';
        if (isAdmin && !isStrumento) nav.appendChild(createLink('/gestione-utenti', 'gestione-utenti', 'users-alt', 'Gestione', 'Utenti'));

        // Apply card-level visibility rules similar to the portal allowlist.
        const allowed = new Set(Array.isArray(user.cards) ? user.cards : []);
        nav.querySelectorAll('.global-side-link[data-card]').forEach(function (link) {
            const id = link.getAttribute('data-card');
            if (id === 'dashboard' || id === 'profilo') return;
            if (id === 'gestione-utenti') {
                link.style.display = (isAdmin && !isStrumento) ? '' : 'none';
                return;
            }
            if (isStrumento) {
                link.style.display = allowed.has(id) ? '' : 'none';
                return;
            }
            link.style.display = isSuper || allowed.has(id) ? '' : 'none';
        });

        if (typeof bindPortalSsoLinks === 'function') bindPortalSsoLinks(nav);

        const collapsed = localStorage.getItem(STORAGE_KEY) === '1';
        sidebar.classList.toggle('global-sidebar--collapsed', collapsed);
        document.body.classList.add('has-global-sidebar');
        document.body.classList.toggle('global-sidebar-collapsed', collapsed);

        const toggle = sidebar.querySelector('#globalSidebarToggle');
        if (toggle && !toggle.dataset.wired) {
            toggle.dataset.wired = '1';
            toggle.addEventListener('click', function () {
                const next = !sidebar.classList.contains('global-sidebar--collapsed');
                sidebar.classList.toggle('global-sidebar--collapsed', next);
                document.body.classList.toggle('global-sidebar-collapsed', next);
                localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
            });
        }

        nav.querySelectorAll('.global-side-link[data-placeholder]').forEach(function (a) {
            if (a.dataset.wired) return;
            a.dataset.wired = '1';
            a.addEventListener('click', function (e) {
                e.preventDefault();
                const msg = a.getAttribute('data-placeholder');
                if (msg) {
                    const target = document.getElementById('portalRealtimeStatus');
                    if (target) target.textContent = msg;
                }
            });
        });

        return sidebar;
    }

    window.initGlobalSidebar = ensureGlobalSidebar;
})();

