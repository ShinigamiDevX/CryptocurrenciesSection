(function () {
    const MANIFEST_URL = '/corsi/manifest.json';
    const MD_BASE = '/corsi/';
    const API = '/api/auth/corsi';
    const SITE_TITLE = 'Corsi';
    const SITE_DESCRIPTION = 'Area formazione e materiali didattici per i Reparti.';
    const IS_MANAGE_PAGE = document.body.dataset.corsiPage === 'manage';
    const READ_ONLY_URL = '/corsi';
    const MANAGE_URL = '/corsi-gestione';

    let manifest = null;
    let cache = Object.create(null);
    let currentUser = null;
    let canEdit = false;

    function authHeaders() {
        const token = (typeof getAuthToken === 'function')
            ? getAuthToken()
            : (sessionStorage.getItem('elevatedAuthToken') || localStorage.getItem('authToken'));
        return {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
        };
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

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function stripFrontMatter(raw) {
        if (!raw.startsWith('---')) return { meta: {}, body: raw };
        const end = raw.indexOf('\n---', 3);
        if (end === -1) return { meta: {}, body: raw };
        const fm = raw.slice(3, end).trim();
        const body = raw.slice(end + 4).replace(/^\s*\n/, '');
        const meta = {};
        fm.split('\n').forEach((line) => {
            const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
            if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '');
        });
        return { meta, body };
    }

    function currentRoute() {
        if (IS_MANAGE_PAGE) {
            const h = (location.hash || '').replace(/^#/, '');
            return h || 'index';
        }
        const h = (location.hash || '#home').replace(/^#/, '');
        return h || 'home';
    }

    function parseRoute(raw) {
        const [pathPart, query = ''] = String(raw || (IS_MANAGE_PAGE ? 'index' : 'home')).split('?');
        const segs = pathPart.split('/').filter(Boolean);
        const qs = new URLSearchParams(query);
        return { segs, qs, pathPart };
    }

    function legacyManageRedirectUrl(raw) {
        const { segs, qs } = parseRoute(raw);
        if (segs[0] !== 'manage') return null;
        const action = segs[1] || '';
        let hash = '';
        if (action === 'view' && segs[2]) hash = 'view/' + segs[2];
        else if (action === 'edit' && segs[2]) hash = 'edit/' + segs[2];
        else if (action === 'new') hash = 'new' + (qs.toString() ? '?' + qs.toString() : '');
        else if (action) hash = 'edit/' + action;
        return MANAGE_URL + (hash ? '#' + hash : '');
    }

    function goReadOnly(id) {
        window.location.href = id ? (READ_ONLY_URL + '#' + encodeURIComponent(id)) : READ_ONLY_URL;
    }

    function navNodes() {
        return Array.isArray(manifest?.nav) ? manifest.nav : [];
    }

    function level1Sections() {
        return contentNodes(navNodes()).filter((n) => n.type === 'course' || n.type === 'page' || n.type === 'section');
    }

    function contentNodes(nodes) {
        return (nodes || []).filter((n) => n && n.type !== 'divider');
    }

    function walk(nodes, fn) {
        for (const n of nodes || []) {
            if (fn(n) === true) return true;
            if (n.type !== 'divider' && n.children?.length && walk(n.children, fn)) return true;
        }
        return false;
    }

    function findNodeById(id) {
        let found = null;
        walk(navNodes(), (n) => {
            if (n.id === id) { found = n; return true; }
            return false;
        });
        return found;
    }

    function contentHref(id, manageMode) {
        if (manageMode) return `#view/${id}`;
        return `#${id}`;
    }

    function setActiveNav(route) {
        const { segs } = parseRoute(route);
        let active = segs[0] || 'home';
        if (IS_MANAGE_PAGE) {
            if (segs[0] === 'view' && segs[1]) active = segs[1];
            else active = '';
        }
        document.querySelectorAll('.cs50-nav a[data-route]').forEach((a) => {
            a.classList.toggle('active', active && a.getAttribute('data-route') === active);
        });
    }

    function renderMarkdown(md) {
        if (typeof marked !== 'undefined' && marked.parse) return marked.parse(md, { breaks: false });
        return '<pre>' + escapeHtml(md) + '</pre>';
    }

    async function loadMarkdown(file) {
        if (cache[file]) return cache[file];
        const res = await fetch(MD_BASE + encodeURIComponent(file) + '?t=' + Date.now());
        if (!res.ok) throw new Error('Impossibile caricare ' + file);
        const parsed = stripFrontMatter(await res.text());
        cache[file] = parsed;
        return parsed;
    }

    function invalidateCache() { cache = Object.create(null); }

    async function reloadManifest() {
        const res = await fetch(MANIFEST_URL + '?t=' + Date.now());
        if (!res.ok) throw new Error();
        manifest = await res.json();
        if (!Array.isArray(manifest.nav)) {
            manifest.nav = [
                ...(manifest.pages || []).map((p) => ({ ...p, type: 'page', children: [] })),
                ...(manifest.posts || []).map((p) => ({ ...p, type: 'course', children: [] })),
            ];
        }
        buildSidebar(IS_MANAGE_PAGE);
    }

    function slugify(title) {
        return String(title || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]+/g, '')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 64);
    }

    const NAV_EXPAND_KEY = 'corsiNavExpand';
    const TREE_EXPAND_KEY = 'corsiTreeExpand';

    function loadExpandState(key) {
        try { return JSON.parse(sessionStorage.getItem(key) || '{}'); }
        catch (_) { return {}; }
    }

    function saveExpandState(key, state) {
        sessionStorage.setItem(key, JSON.stringify(state));
    }

    function loadNavExpandState() { return loadExpandState(NAV_EXPAND_KEY); }
    function saveNavExpandState(state) { saveExpandState(NAV_EXPAND_KEY, state); }
    function loadTreeExpandState() { return loadExpandState(TREE_EXPAND_KEY); }
    function saveTreeExpandState(state) { saveExpandState(TREE_EXPAND_KEY, state); }

    function isNodeOpen(id, expandState, forceOpen) {
        if (forceOpen && forceOpen.has(id)) return true;
        if (Object.prototype.hasOwnProperty.call(expandState, id)) return !!expandState[id];
        return true;
    }

    function ancestorIdsOf(targetId) {
        const path = [];
        function dfs(nodes, trail) {
            for (const n of contentNodes(nodes)) {
                if (n.id === targetId) {
                    path.push(...trail);
                    return true;
                }
                if (contentNodes(n.children).length && dfs(n.children, trail.concat(n.id))) return true;
            }
            return false;
        }
        dfs(navNodes(), []);
        return path;
    }

    function activeContentId(route) {
        const { segs } = parseRoute(route);
        if (IS_MANAGE_PAGE) {
            if (segs[0] === 'view' && segs[1]) return segs[1];
            return null;
        }
        if (segs[0] && segs[0] !== 'home') return segs[0];
        return null;
    }

    function wireNavToggles(nav) {
        nav.querySelectorAll('.cs50-toggle').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const li = btn.closest('.cs50-item');
                if (!li) return;
                const id = li.getAttribute('data-nav-id');
                const open = li.classList.toggle('is-open');
                li.classList.toggle('is-collapsed', !open);
                btn.textContent = open ? '−' : '+';
                btn.setAttribute('aria-expanded', open ? 'true' : 'false');
                btn.setAttribute('aria-label', open ? 'Comprimi' : 'Espandi');
                const state = loadNavExpandState();
                state[id] = open;
                saveNavExpandState(state);
            });
        });
    }

    async function apiJson(url, options) {
        const res = await fetch(url, options);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Operazione non riuscita.');
        return data;
    }

    function excerptFromBody(body) {
        const excerpt = body.split(/\n\n+/).find((p) => p.trim() && !p.trim().startsWith('#')) || '';
        return excerpt.slice(0, 420) + (excerpt.length > 420 ? '…' : '');
    }

    function renderNavTree(nodes, depth, manageMode, expandState, forceOpen) {
        const items = contentNodes(nodes);
        if (!items.length) return '';
        return items.map((n) => {
            const kidsList = contentNodes(n.children);
            const hasKids = kidsList.length > 0;
            const open = hasKids && isNodeOpen(n.id, expandState, forceOpen);
            const kids = hasKids
                ? `<div class="cs50-subwrap"><ul class="cs50-sub depth-${depth + 1}">${renderNavTree(n.children, depth + 1, manageMode, expandState, forceOpen)}</ul></div>`
                : '';
            const toggle = hasKids
                ? `<button type="button" class="cs50-toggle" aria-expanded="${open ? 'true' : 'false'}" aria-label="${open ? 'Comprimi' : 'Espandi'}">${open ? '−' : '+'}</button>`
                : '<span class="cs50-toggle-spacer" aria-hidden="true"></span>';
            const openClass = hasKids ? (open ? ' is-open' : ' is-collapsed') : '';
            return `
                <li class="cs50-item depth-${depth} type-${escapeHtml(n.type)}${hasKids ? ' has-children' : ''}${openClass}" data-nav-id="${escapeHtml(n.id)}">
                    <div class="cs50-row">
                        ${toggle}
                        <a class="cs50-link" href="${contentHref(n.id, manageMode)}" data-route="${escapeHtml(n.id)}">${escapeHtml(n.title)}</a>
                    </div>
                    ${kids}
                </li>
            `;
        }).join('');
    }

    function buildSidebar(manageMode) {
        const nav = document.getElementById('sidebarNav');
        nav.className = 'sidebar-nav cs50-nav';
        const expandState = loadNavExpandState();
        const forceOpen = new Set();
        const activeId = activeContentId(currentRoute());
        if (activeId) ancestorIdsOf(activeId).forEach((id) => forceOpen.add(id));
        // Home rimossa: il titolo «Corsi» in alto punta già a #home
        nav.innerHTML = `
            <ul class="cs50-root">
                ${renderNavTree(navNodes(), 0, !!manageMode, expandState, forceOpen)}
            </ul>
        `;
        wireNavToggles(nav);
        const titleEl = document.getElementById('siteTitle');
        if (titleEl) titleEl.textContent = SITE_TITLE;
        if (!IS_MANAGE_PAGE) {
            const descEl = document.getElementById('siteDescription');
            if (descEl) descEl.textContent = SITE_DESCRIPTION;
            document.title = SITE_TITLE + ' — CryptocurrenciesSection';
        } else {
            document.title = 'Gestione contenuti — Corsi';
        }
        setActiveNav(currentRoute());
    }

    function levelLabel(depth) {
        if (depth <= 0) return 'Sezione';
        if (depth === 1) return 'Sottosezione';
        return `Sottosezione liv. ${depth}`;
    }

    async function renderSectionCard(section, { manageMode, depth = 0 }) {
        const titleTag = depth <= 0 ? 'h1' : (depth === 1 ? 'h2' : 'h3');
        const titleClass = depth <= 0 ? 'post-title' : 'post-title nest-title';
        const badge = `<div class="level-badge">${escapeHtml(levelLabel(depth))}</div>`;
        const cardClass = `post manage-card depth-${depth}`;
        try {
            const { meta, body } = await loadMarkdown(section.file || `${section.id}.md`);
            const title = meta.title || section.title;
            const excerptHtml = renderMarkdown(excerptFromBody(body));
            const actions = manageMode ? `
                <p class="doc-actions">
                    <a href="#edit/${escapeHtml(section.id)}">Modifica</a>
                    · <a href="#new?parent=${escapeHtml(section.id)}">Aggiungi sottosezione</a>
                    · <a href="#" class="link-del" data-del="${escapeHtml(section.id)}">Elimina</a>
                </p>` : '';
            return `
                <article class="${cardClass}">
                    ${badge}
                    <${titleTag} class="${titleClass}">
                        <a href="${contentHref(section.id, manageMode)}">${escapeHtml(title)}</a>
                    </${titleTag}>
                    ${actions}
                    <div class="manage-collapsible"><div class="collapsible-inner"><div class="post-excerpt">${excerptHtml}</div></div></div>
                </article>
            `;
        } catch (_) {
            return `
                <article class="${cardClass}">
                    ${badge}
                    <${titleTag} class="${titleClass}">
                        <a href="${contentHref(section.id, manageMode)}">${escapeHtml(section.title)}</a>
                    </${titleTag}>
                    <div class="manage-collapsible"><div class="collapsible-inner"><p class="corsi-error">Contenuto non disponibile.</p></div></div>
                </article>
            `;
        }
    }

    async function renderTreeNode(node, depth, expandState, manageMode) {
        const kids = contentNodes(node.children);
        const hasKids = kids.length > 0;
        const open = isNodeOpen(node.id, expandState);
        const card = await renderSectionCard(node, { manageMode: !!manageMode, depth });
        const toggle = `<button type="button" class="manage-toggle" aria-expanded="${open ? 'true' : 'false'}" aria-label="${open ? 'Comprimi' : 'Espandi'}">${open ? '−' : '+'}</button>`;
        let nested = '';
        if (hasKids) {
            const parts = [];
            for (const k of kids) parts.push(await renderTreeNode(k, depth + 1, expandState, manageMode));
            nested = `<div class="manage-nest depth-${depth + 1}"><div class="collapsible-inner">${parts.join('')}</div></div>`;
        }
        return `
            <div class="manage-level depth-${depth} is-collapsible${open ? ' is-open' : ' is-collapsed'}" data-tree-id="${escapeHtml(node.id)}">
                <div class="manage-level-row">
                    ${toggle}
                    <div class="manage-level-body">${card}</div>
                </div>
                ${nested}
            </div>
        `;
    }

    function wireTreeToggles(rootEl) {
        rootEl.querySelectorAll('.manage-toggle').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const level = btn.closest('.manage-level');
                if (!level) return;
                const id = level.getAttribute('data-tree-id');
                const open = level.classList.toggle('is-open');
                level.classList.toggle('is-collapsed', !open);
                btn.textContent = open ? '−' : '+';
                btn.setAttribute('aria-expanded', open ? 'true' : 'false');
                btn.setAttribute('aria-label', open ? 'Comprimi' : 'Espandi');
                const state = loadTreeExpandState();
                state[id] = open;
                saveTreeExpandState(state);
            });
        });
    }

    function wireDeleteLinks(rootEl) {
        rootEl.querySelectorAll('[data-del]').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const id = a.getAttribute('data-del');
                showConfirm('Eliminare questa sezione e tutte le sottosezioni?', async () => {
                    try {
                        const data = await apiJson(API + '/items/' + encodeURIComponent(id), {
                            method: 'DELETE', headers: authHeaders(),
                        });
                        manifest = data.manifest;
                        invalidateCache();
                        buildSidebar(true);
                        goReadOnly();
                    } catch (err) { alert(err.message); }
                });
            });
        });
    }

    async function renderHome() {
        const root = document.getElementById('contentRoot');
        root.className = 'posts';
        const roots = contentNodes(navNodes());
        if (!roots.length) {
            root.innerHTML = '<div class="page"><h1 class="page-title">Corsi</h1><p>Nessuna sezione disponibile.</p></div>';
            return;
        }
        const expandState = loadTreeExpandState();
        const blocks = [];
        for (const section of roots) {
            blocks.push(await renderTreeNode(section, 0, expandState, false));
        }
        root.innerHTML = `<div class="posts-list manage-hierarchy">${blocks.join('')}</div>`;
        wireTreeToggles(root);
        renderChartsIn(root);
    }

    async function renderDoc(entry, { manageMode }) {
        const root = document.getElementById('contentRoot');
        root.className = 'post';
        try {
            const { meta, body } = await loadMarkdown(entry.file || `${entry.id}.md`);
            const title = meta.title || entry.title;
            const open = isNodeOpen(entry.id, loadTreeExpandState());
            let html = `
                <div class="manage-level is-collapsible${open ? ' is-open' : ' is-collapsed'}" data-tree-id="${escapeHtml(entry.id)}">
                    <div class="manage-level-row">
                        <button type="button" class="manage-toggle" aria-expanded="${open ? 'true' : 'false'}" aria-label="${open ? 'Comprimi' : 'Espandi'}">${open ? '−' : '+'}</button>
                        <div class="manage-level-body">
                            <h1 class="post-title">${escapeHtml(title)}</h1>
            `;
            if (manageMode) {
                html += `<p class="doc-actions">
                    <a href="#edit/${escapeHtml(entry.id)}">Modifica</a>
                    · <a href="#new?parent=${escapeHtml(entry.id)}">Aggiungi sottosezione</a>
                    · <a href="#" class="link-del" data-del="${escapeHtml(entry.id)}">Elimina</a>
                </p>`;
            }
            const kids = (entry.children || []).filter((c) => c.type !== 'divider');
            html += `<div class="manage-collapsible"><div class="collapsible-inner">`;
            if (kids.length) {
                html += `<div class="section-toc"><strong>Sottosezioni</strong><ul>${
                    kids.map((c) => `<li><a href="${contentHref(c.id, manageMode)}">${escapeHtml(c.title)}</a></li>`).join('')
                }</ul></div>`;
            }
            html += `${renderMarkdown(body)}</div></div></div></div></div>`;
            root.innerHTML = html;
            wireTreeToggles(root);
            renderChartsIn(root);
            if (manageMode) wireDeleteLinks(root);
        } catch (_) {
            root.innerHTML = `<h1 class="page-title">Errore</h1><p class="corsi-error">Impossibile caricare il contenuto richiesto.</p>`;
        }
    }

    function parentOptionsHtml(selected, excludeId) {
        const opts = ['<option value="">— Radice sidebar (sezione di livello 1) —</option>'];
        function add(nodes, prefix) {
            (nodes || []).forEach((n) => {
                if (n.type === 'divider') return;
                if (n.id === excludeId) return;
                opts.push(`<option value="${escapeHtml(n.id)}"${selected === n.id ? ' selected' : ''}>${escapeHtml(prefix + n.title)}</option>`);
                if (n.children?.length) add(n.children, prefix + '— ');
            });
        }
        add(navNodes(), '');
        return opts.join('');
    }

    async function renderManageIndex() {
        const root = document.getElementById('contentRoot');
        root.className = 'posts';
        const roots = contentNodes(navNodes());
        const expandState = loadTreeExpandState();
        const blocks = [];
        for (const section of roots) {
            blocks.push(await renderTreeNode(section, 0, expandState, true));
        }
        root.innerHTML = `
            <div class="page" style="margin-bottom:1.5rem;">
                <h1 class="page-title">Gestione contenuti</h1>
                <p>Struttura gerarchica delle sezioni. Usa +/− per espandere o comprimere. Dopo il salvataggio tornerai ai corsi in sola lettura.</p>
                <div class="editor-actions" style="margin-top:0.75rem;">
                    <a class="btn-sm btn-primary" href="#new" style="display:inline-block;padding:0.45rem 0.9rem;border:1px solid #000;background:#000;color:#fff;border-radius:3px;text-decoration:none;">Nuova sezione</a>
                </div>
            </div>
            <div class="posts-list manage-hierarchy">${blocks.join('') || '<p>Nessuna sezione. Crea la prima.</p>'}</div>
        `;
        wireDeleteLinks(root);
        wireTreeToggles(root);
        renderChartsIn(root);
    }

    async function renderManage(route) {
        if (!canEdit) { window.location.replace(READ_ONLY_URL); return; }
        const { segs, qs } = parseRoute(route === 'index' ? '' : route);
        const action = segs[0] || '';

        if (!action || action === 'index') {
            await renderManageIndex();
            return;
        }

        if (action === 'view' && segs[1]) {
            const node = findNodeById(segs[1]);
            if (!node) {
                document.getElementById('contentRoot').innerHTML =
                    `<div class="page"><h1 class="page-title">Non trovato</h1><p><a href="${MANAGE_URL}">Torna alla gestione</a></p></div>`;
                return;
            }
            await renderDoc(node, { manageMode: true });
            return;
        }

        if (action === 'new') {
            const parentId = qs.get('parent') || '';
            document.getElementById('contentRoot').className = 'page';
            document.getElementById('contentRoot').innerHTML = editorHtml({
                mode: 'create',
                id: '',
                title: '',
                date: new Date().toISOString().slice(0, 10),
                type: parentId ? 'section' : 'course',
                parentId,
                content: '# Nuova sezione\n\nScrivi qui il contenuto in Markdown.\n',
            });
            wireEditor('create');
            return;
        }

        if (action === 'edit' && segs[1]) {
            try {
                const item = await apiJson(API + '/items/' + encodeURIComponent(segs[1]), { headers: authHeaders() });
                document.getElementById('contentRoot').className = 'page';
                document.getElementById('contentRoot').innerHTML = editorHtml({
                    mode: 'edit',
                    id: item.id,
                    title: item.title,
                    date: item.date || '',
                    type: item.type || item.kind || 'course',
                    parentId: item.parentId || '',
                    content: item.content,
                });
                wireEditor('edit', item.id);
            } catch (err) {
                document.getElementById('contentRoot').innerHTML =
                    `<h1 class="page-title">Errore</h1><p class="corsi-error">${escapeHtml(err.message)}</p><p><a href="${MANAGE_URL}">Torna alla gestione</a></p>`;
            }
            return;
        }

        // compat: #<id> → edit
        if (action && action !== 'view' && action !== 'edit' && action !== 'new') {
            window.location.hash = 'edit/' + action;
        }
    }

    function editorHtml(state) {
        // «Aggiungi sottosezione»: padre e tipo sono automatici, non modificabili
        const lockedParent = state.mode === 'create' && state.parentId ? findNodeById(state.parentId) : null;
        const childLevel = lockedParent ? levelLabel(ancestorIdsOf(lockedParent.id).length + 1) : '';
        const heading = state.mode !== 'create'
            ? 'Modifica sezione'
            : (lockedParent ? 'Nuova sottosezione' : 'Nuova sezione');
        const typeParentFields = lockedParent ? `
                <input type="hidden" id="edType" value="section">
                <input type="hidden" id="edParent" value="${escapeHtml(lockedParent.id)}">
                <p class="editor-parent-info">Verrà aggiunta come <strong>${escapeHtml(childLevel)}</strong> di «<strong>${escapeHtml(lockedParent.title)}</strong>».</p>
        ` : `
                <label for="edType">Tipo</label>
                <select id="edType">
                    <option value="course"${state.type === 'course' || state.type === 'page' ? ' selected' : ''}>Sezione di livello 1</option>
                    <option value="section"${state.type === 'section' ? ' selected' : ''}>Sottosezione</option>
                </select>

                <label for="edParent">Posizione in sidebar (padre)</label>
                <select id="edParent">${parentOptionsHtml(state.parentId || '', state.mode === 'edit' ? state.id : '')}</select>
                <p class="editor-hint">Lascia vuoto per una sezione di livello 1; scegli un padre per le sottosezioni.</p>
        `;
        return `
            <h1 class="page-title">${heading}</h1>
            <p><a href="${MANAGE_URL}">← Torna alla gestione</a></p>
            <form id="editorForm" class="editor-form">
                <input type="hidden" id="edId" value="${escapeHtml(state.id)}">

                <label for="edTitle">Titolo</label>
                <input type="text" id="edTitle" maxlength="120" value="${escapeHtml(state.title)}" required>
                <p class="editor-hint">L’identificativo URL viene creato automaticamente dal titolo (spazi → underscore).</p>
                ${typeParentFields}

                <label for="edContent">Contenuto Markdown</label>
                <div class="editor-toolbar" id="edToolbar">
                    <button type="button" data-md="bold" title="Grassetto"><b>G</b></button>
                    <button type="button" data-md="italic" title="Corsivo"><i>C</i></button>
                    <button type="button" data-md="underline" title="Sottolineato"><u>S</u></button>
                    <input type="color" id="edColor" value="#ac4142" title="Colore testo: scegli il colore e viene applicato alla selezione">
                    <button type="button" data-md="color" title="Applica il colore scelto alla selezione">A<span class="tb-color-bar" id="edColorBar"></span></button>
                    <span class="tb-sep"></span>
                    <button type="button" data-md="image" title="Carica e inserisci un'immagine">🖼 Immagine</button>
                    <button type="button" data-md="chart" title="Inserisci un grafico">📊 Grafico</button>
                    <button type="button" data-md="table" title="Inserisci una tabella">▦ Tabella</button>
                    <input type="file" id="edImageFile" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none;">
                </div>
                <textarea id="edContent" required>${escapeHtml(state.content)}</textarea>
                <p class="editor-hint">Seleziona il testo e usa i pulsanti per formattarlo. «Grafico» e «Tabella» inseriscono un modello da compilare; usa «Anteprima» per vedere il risultato.</p>

                <div class="editor-actions">
                    <button type="submit" class="btn-primary">Salva modifiche</button>
                    <button type="button" id="btnPreview">Anteprima</button>
                    ${state.mode === 'edit' ? '<button type="button" class="btn-danger" id="btnDelete">Elimina</button>' : ''}
                </div>
                <p id="editorMsg" class="editor-hint"></p>
            </form>
            <div id="previewBox" class="editor-preview" style="display:none;">
                <h2>Anteprima</h2>
                <div id="previewBody"></div>
            </div>
        `;
    }

    // ── Toolbar editor ─────────────────────────────────────────────────────────
    const CHART_TEMPLATE = [
        '```chart',
        '{',
        '  "type": "bar",',
        '  "title": "Titolo del grafico",',
        '  "labels": ["Gennaio", "Febbraio", "Marzo"],',
        '  "datasets": [',
        '    { "label": "Serie 1", "data": [10, 25, 18] }',
        '  ]',
        '}',
        '```',
    ].join('\n');

    const TABLE_TEMPLATE = [
        '| Colonna 1 | Colonna 2 | Colonna 3 |',
        '| --- | --- | --- |',
        '| Valore 1 | Valore 2 | Valore 3 |',
        '| Valore 4 | Valore 5 | Valore 6 |',
    ].join('\n');

    function wrapSelection(ta, before, after, placeholder) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const sel = ta.value.slice(start, end) || placeholder;
        ta.setRangeText(before + sel + after, start, end);
        ta.focus();
        ta.setSelectionRange(start + before.length, start + before.length + sel.length);
    }

    function insertBlock(ta, text) {
        const start = ta.selectionStart;
        const needsNl = start > 0 && ta.value[start - 1] !== '\n';
        const block = (needsNl ? '\n\n' : '') + text + '\n';
        ta.setRangeText(block, start, ta.selectionEnd, 'end');
        ta.focus();
    }

    function setEditorMsg(text, isError) {
        const msg = document.getElementById('editorMsg');
        if (!msg) return;
        msg.textContent = text || '';
        msg.className = 'editor-hint' + (isError ? ' corsi-error' : '');
    }

    async function uploadImage(file) {
        const res = await fetch(API + '/upload?name=' + encodeURIComponent(file.name), {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + ((typeof getAuthToken === 'function')
                    ? getAuthToken()
                    : (sessionStorage.getItem('elevatedAuthToken') || localStorage.getItem('authToken'))),
                'Content-Type': file.type || 'application/octet-stream',
            },
            body: file,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Caricamento non riuscito.');
        return data.url;
    }

    function wireToolbar() {
        const toolbar = document.getElementById('edToolbar');
        const ta = document.getElementById('edContent');
        if (!toolbar || !ta) return;
        const colorInput = document.getElementById('edColor');
        const colorBar = document.getElementById('edColorBar');
        const fileInput = document.getElementById('edImageFile');
        const syncColorBar = () => { if (colorBar) colorBar.style.background = colorInput.value; };
        syncColorBar();
        colorInput.addEventListener('input', syncColorBar);

        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            fileInput.value = '';
            if (!file) return;
            if (file.size > 10 * 1024 * 1024) { setEditorMsg('Immagine troppo grande (max 10 MB).', true); return; }
            setEditorMsg('Caricamento immagine...');
            try {
                const url = await uploadImage(file);
                const alt = file.name.replace(/\.[^.]*$/, '').replace(/[\[\]]/g, '');
                insertBlock(ta, `![${alt}](${url})`);
                setEditorMsg('Immagine inserita.');
            } catch (err) {
                setEditorMsg(err.message, true);
            }
        });

        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-md]');
            if (!btn) return;
            e.preventDefault();
            const action = btn.dataset.md;
            if (action === 'bold') wrapSelection(ta, '**', '**', 'testo in grassetto');
            else if (action === 'italic') wrapSelection(ta, '*', '*', 'testo in corsivo');
            else if (action === 'underline') wrapSelection(ta, '<u>', '</u>', 'testo sottolineato');
            else if (action === 'color') wrapSelection(ta, `<span style="color:${colorInput.value}">`, '</span>', 'testo colorato');
            else if (action === 'image') fileInput.click();
            else if (action === 'chart') insertBlock(ta, CHART_TEMPLATE);
            else if (action === 'table') insertBlock(ta, TABLE_TEMPLATE);
        });
    }

    // ── Grafici nei contenuti (blocchi ```chart con JSON) ─────────────────────
    const CHART_PALETTE = ['#268bd2', '#ac4142', '#90a959', '#f4bf75', '#aa759f', '#75b5aa', '#d28445', '#6a9fb5'];
    const CHART_TYPES = new Set(['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea']);

    function renderChartsIn(rootEl) {
        if (!rootEl) return;
        rootEl.querySelectorAll('pre > code.language-chart').forEach((code) => {
            const pre = code.parentElement;
            if (typeof Chart === 'undefined') {
                pre.outerHTML = '<p class="corsi-error">Libreria grafici non disponibile.</p>';
                return;
            }
            let cfg;
            try { cfg = JSON.parse(code.textContent); }
            catch (_) {
                pre.outerHTML = '<p class="corsi-error">Grafico non valido: controlla la sintassi JSON del blocco chart.</p>';
                return;
            }
            const wrap = document.createElement('div');
            wrap.className = 'chart-block';
            const canvas = document.createElement('canvas');
            wrap.appendChild(canvas);
            pre.replaceWith(wrap);
            try {
                const type = CHART_TYPES.has(cfg.type) ? cfg.type : 'bar';
                const circular = type === 'pie' || type === 'doughnut' || type === 'polarArea';
                const datasets = (Array.isArray(cfg.datasets) ? cfg.datasets : []).map((d, i) => ({
                    label: d.label || `Serie ${i + 1}`,
                    data: Array.isArray(d.data) ? d.data : [],
                    backgroundColor: d.backgroundColor || (circular
                        ? (d.data || []).map((_, j) => CHART_PALETTE[j % CHART_PALETTE.length])
                        : CHART_PALETTE[i % CHART_PALETTE.length] + (type === 'line' || type === 'radar' ? '33' : '')),
                    borderColor: d.borderColor || (circular ? '#fff' : CHART_PALETTE[i % CHART_PALETTE.length]),
                    borderWidth: d.borderWidth ?? (type === 'line' || type === 'radar' ? 2 : 1),
                    fill: d.fill,
                    tension: d.tension ?? 0.25,
                }));
                new Chart(canvas, {
                    type,
                    data: { labels: Array.isArray(cfg.labels) ? cfg.labels : [], datasets },
                    options: {
                        responsive: true,
                        plugins: {
                            title: { display: !!cfg.title, text: cfg.title || '' },
                            legend: { display: cfg.legend !== false },
                        },
                    },
                });
            } catch (err) {
                wrap.outerHTML = '<p class="corsi-error">Impossibile disegnare il grafico: ' + escapeHtml(err.message) + '</p>';
            }
        });
    }

    function wireEditor(mode, existingId) {
        const idInput = document.getElementById('edId');
        const titleInput = document.getElementById('edTitle');
        wireToolbar();
        if (mode === 'create') {
            const syncId = () => { idInput.value = slugify(titleInput.value); };
            titleInput.addEventListener('input', syncId);
            syncId();
        }
        document.getElementById('btnPreview').addEventListener('click', () => {
            const previewBody = document.getElementById('previewBody');
            previewBody.innerHTML = renderMarkdown(document.getElementById('edContent').value);
            renderChartsIn(previewBody);
            document.getElementById('previewBox').style.display = 'block';
        });
        const del = document.getElementById('btnDelete');
        if (del) {
            del.addEventListener('click', () => {
                showConfirm('Eliminare definitivamente questa sezione e le sue sottosezioni?', async () => {
                    try {
                        await apiJson(API + '/items/' + encodeURIComponent(existingId), {
                            method: 'DELETE', headers: authHeaders(),
                        });
                        invalidateCache();
                        goReadOnly();
                    } catch (err) {
                        const msg = document.getElementById('editorMsg');
                        msg.textContent = err.message;
                        msg.className = 'editor-hint corsi-error';
                    }
                });
            });
        }
        document.getElementById('editorForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = document.getElementById('editorMsg');
            msg.textContent = 'Salvataggio...';
            msg.className = 'editor-hint';
            const parentVal = document.getElementById('edParent').value || null;
            let type = document.getElementById('edType').value;
            if (parentVal) type = 'section';
            else if (type === 'section') type = 'course';
            const title = titleInput.value.trim();
            if (mode === 'create') idInput.value = slugify(title);
            const payload = {
                id: idInput.value.trim().toLowerCase(),
                title,
                type,
                content: document.getElementById('edContent').value,
                parentId: parentVal,
            };
            if (mode === 'create' && !payload.id) {
                msg.textContent = 'Il titolo deve contenere almeno una lettera o un numero.';
                msg.className = 'editor-hint corsi-error';
                return;
            }
            try {
                if (mode === 'create') {
                    await apiJson(API + '/items', {
                        method: 'POST', headers: authHeaders(), body: JSON.stringify(payload),
                    });
                } else {
                    await apiJson(API + '/items/' + encodeURIComponent(existingId), {
                        method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload),
                    });
                }
                invalidateCache();
                goReadOnly(mode === 'create' ? payload.id : existingId);
            } catch (err) {
                msg.textContent = err.message;
                msg.className = 'editor-hint corsi-error';
            }
        });
    }

    async function route() {
        const r = currentRoute();

        if (!IS_MANAGE_PAGE) {
            const legacy = legacyManageRedirectUrl(r);
            if (legacy) {
                window.location.replace(legacy);
                return;
            }
        }

        buildSidebar(IS_MANAGE_PAGE);
        setActiveNav(r);

        if (IS_MANAGE_PAGE) {
            await renderManage(r);
            return;
        }

        const { segs } = parseRoute(r);
        if (!segs.length || segs[0] === 'home') {
            await renderHome();
            return;
        }
        const node = findNodeById(segs[0]);
        if (!node || node.type === 'divider') {
            document.getElementById('contentRoot').innerHTML =
                '<div class="page"><h1 class="page-title">Non trovato</h1><p>Il contenuto richiesto non esiste. <a href="#home">Torna alla home</a>.</p></div>';
            return;
        }
        await renderDoc(node, { manageMode: false });
    }

    async function initAuth() {
        const token = (typeof getAuthToken === 'function')
            ? getAuthToken()
            : (sessionStorage.getItem('elevatedAuthToken') || localStorage.getItem('authToken'));
        if (!token) { window.location.replace('/login'); return false; }
        try {
            const res = await fetch('/api/auth/verify', {
                headers: { Authorization: 'Bearer ' + token },
            });
            if (!res.ok) throw new Error();
            const user = await res.json();
            const cards = Array.isArray(user.cards) ? user.cards : [];
            if (!cards.includes('corsi')) { window.location.replace('/portal'); return false; }
            currentUser = user;
            canEdit = !!user.canManageCorsi || !!user.docente || user.role === 'superadmin';
            if (IS_MANAGE_PAGE && !canEdit) {
                window.location.replace(READ_ONLY_URL);
                return false;
            }
            const btn = document.getElementById('btnManage');
            const btnStorico = document.getElementById('btnStorico');
            if (btn) btn.style.display = canEdit ? 'inline' : 'none';
            if (btnStorico) btnStorico.style.display = canEdit ? 'inline' : 'none';
            document.getElementById('authOverlay').style.display = 'none';
            return true;
        } catch (_) {
            if (typeof clearAuth === 'function') clearAuth();
            else localStorage.removeItem('authToken');
            window.location.replace('/login');
            return false;
        }
    }

    async function boot() {
        const titleEl = document.getElementById('siteTitle');
        const descEl = document.getElementById('siteDescription');
        if (titleEl) titleEl.textContent = SITE_TITLE;
        if (descEl && !IS_MANAGE_PAGE) descEl.textContent = SITE_DESCRIPTION;

        if (!(await initAuth())) return;
        try {
            await reloadManifest();
        } catch (_) {
            document.getElementById('contentRoot').innerHTML =
                '<p class="corsi-error">Impossibile caricare l\'elenco dei corsi.</p>';
            return;
        }
        window.addEventListener('hashchange', () => { route(); });
        await route();
    }

    boot();
})();
