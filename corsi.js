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

    function authHeaders(extra) {
        if (typeof authHeader === 'function') return authHeader(extra);
        const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        return Object.assign({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, extra || {});
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

    function uniqueContentId(title) {
        const used = new Set();
        walk(navNodes(), (n) => {
            if (n && n.id) used.add(n.id);
            return false;
        });
        const base = slugify(title) || 'sezione';
        let id = base;
        let n = 2;
        while (used.has(id)) {
            id = (base + '_' + n).slice(0, 64);
            n += 1;
        }
        return id;
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
            return `
                <article class="${cardClass}">
                    ${badge}
                    <${titleTag} class="${titleClass}">
                        <a href="${contentHref(section.id, manageMode)}">${escapeHtml(title)}</a>
                    </${titleTag}>
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

    function wireManageTreeActions(rootEl) {
        if (!rootEl) return;
        rootEl.querySelectorAll('[data-add-child]').forEach((btn) => {
            if (btn.dataset.wired) return;
            btn.dataset.wired = '1';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                addSubsectionInline(btn.getAttribute('data-add-child'), btn);
            });
        });
        rootEl.querySelectorAll('[data-del]').forEach((btn) => {
            if (btn.dataset.wired) return;
            btn.dataset.wired = '1';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.getAttribute('data-del');
                const node = findNodeById(id);
                const label = node && node.title ? '«' + node.title + '»' : 'questa sezione';
                showConfirm(
                    'Eliminare ' + label + '? Verranno eliminate anche tutte le sottosezioni al suo interno.',
                    () => deleteSectionInline(id)
                );
            });
        });
    }

    function editTreeSelector(id) {
        return '.inline-edit-tree [data-edit-id="' + String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]';
    }

    async function addSubsectionInline(parentId, btn) {
        if (!parentId) return;
        if (btn) btn.disabled = true;
        setEditorMsg('Creazione sottosezione...');
        try {
            const title = 'Nuova sottosezione';
            const id = uniqueContentId(title);
            const data = await apiJson(API + '/items', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    id,
                    title,
                    type: 'section',
                    date: todayIsoDate(),
                    content: '<p></p>\n',
                    parentId,
                }),
            });
            if (data && data.manifest) manifest = data.manifest;
            invalidateCache();
            buildSidebar(true);
            const newNode = findNodeById(id);
            if (!newNode) {
                await renderManageIndex();
                highlightAndScrollEdit(id);
                return;
            }
            const parentArt = document.querySelector(editTreeSelector(parentId));
            const depth = ancestorIdsOf(id).length;
            const html = await renderEditableTree(newNode, depth);
            if (parentArt) {
                let kidsWrap = [...parentArt.children].find((el) => el.classList.contains('inline-doc-children'));
                if (!kidsWrap) {
                    kidsWrap = document.createElement('div');
                    kidsWrap.className = 'inline-doc-children';
                    parentArt.appendChild(kidsWrap);
                }
                kidsWrap.insertAdjacentHTML('beforeend', html);
                const art = kidsWrap.lastElementChild;
                if (art && art.getAttribute('data-edit-id') === id) {
                    await hydrateEditableArticle(art);
                    wireManageTreeActions(art);
                    highlightAndScrollEdit(id);
                    const titleEl = directEditChild(art, 'data-edit-title');
                    if (titleEl) {
                        titleEl.focus();
                        const range = document.createRange();
                        range.selectNodeContents(titleEl);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            } else {
                await renderManageIndex();
                highlightAndScrollEdit(id);
            }
            setEditorMsg('Sottosezione aggiunta in fondo al livello. Modificala qui e premi Salva.');
        } catch (err) {
            setEditorMsg(err.message, true);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function deleteSectionInline(id) {
        try {
            const data = await apiJson(API + '/items/' + encodeURIComponent(id), {
                method: 'DELETE', headers: authHeaders(),
            });
            if (data && data.manifest) manifest = data.manifest;
            invalidateCache();
            buildSidebar(true);
            const art = document.querySelector(editTreeSelector(id));
            if (art) {
                const wrap = art.parentElement;
                art.remove();
                if (wrap && wrap.classList.contains('inline-doc-children') && !wrap.querySelector('[data-edit-id]')) {
                    wrap.remove();
                }
            } else {
                await renderManageIndex();
            }
            const { segs } = parseRoute(currentRoute());
            if (segs[0] === 'view' && segs[1] === id && window.location.hash) {
                window.location.hash = '';
            }
            setEditorMsg('Sezione eliminata, comprese le sottosezioni interne.');
        } catch (err) {
            alert(err.message);
        }
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

    function toolbarHtml() {
        return `
            <div class="editor-toolbar" id="edToolbar">
                <button type="button" data-cmd="bold" title="Grassetto"><b>G</b></button>
                <button type="button" data-cmd="italic" title="Corsivo"><i>C</i></button>
                <button type="button" data-cmd="underline" title="Sottolineato"><u>S</u></button>
                <input type="color" id="edColor" value="#ff0000" title="Colore testo">
                <button type="button" data-cmd="foreColor" title="Applica colore">A<span class="tb-color-bar" id="edColorBar"></span></button>
                <span class="tb-sep"></span>
                <button type="button" data-cmd="insertUnorderedList" title="Elenco puntato">• Elenco</button>
                <button type="button" data-cmd="insertOrderedList" title="Elenco numerato">1. Elenco</button>
                <span class="tb-sep"></span>
                <button type="button" data-cmd="image" title="Carica e inserisci un'immagine">🖼 Immagine</button>
                <button type="button" data-cmd="chart" title="Inserisci un grafico">📊 Grafico</button>
                <button type="button" data-cmd="table" title="Inserisci una tabella">▦ Tabella</button>
                <span class="tb-table-tools" id="edTableTools" hidden>
                    <span class="tb-sep"></span>
                    <button type="button" data-cmd="tableAddRow" title="Aggiungi riga sotto">+ Riga</button>
                    <button type="button" data-cmd="tableDelRow" title="Elimina riga">− Riga</button>
                    <button type="button" data-cmd="tableAddCol" title="Aggiungi colonna a destra">+ Col</button>
                    <button type="button" data-cmd="tableDelCol" title="Elimina colonna">− Col</button>
                </span>
                <input type="file" id="edImageFile" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none;">
            </div>
        `;
    }

    function inlineEditChromeHtml() {
        return `
            <p class="inline-edit-hint">Clicca su titolo o testo per modificare. «Salva» (o Ctrl+S) salva tutte le sezioni e sottosezioni.</p>
            <div class="inline-edit-bar">
                ${toolbarHtml()}
                <div class="inline-edit-actions">
                    <button type="button" class="btn-primary" id="btnInlineSave">Salva</button>
                    <span id="editorMsg" class="editor-hint"></span>
                </div>
            </div>
        `;
    }

    async function renderEditableTree(node, depth) {
        const titleTag = depth <= 0 ? 'h1' : (depth === 1 ? 'h2' : 'h3');
        const kids = contentNodes(node.children);
        let childrenHtml = '';
        if (kids.length) {
            const parts = [];
            for (const k of kids) parts.push(await renderEditableTree(k, depth + 1));
            childrenHtml = `<div class="inline-doc-children">${parts.join('')}</div>`;
        }
        return `
            <article class="inline-doc depth-${depth}" data-edit-id="${escapeHtml(node.id)}" data-edit-type="${escapeHtml(node.type || 'section')}">
                <div class="inline-doc-head">
                    <${titleTag} class="post-title inline-edit-title" contenteditable="true" spellcheck="true" data-edit-title></${titleTag}>
                    <div class="inline-doc-actions">
                        <button type="button" class="btn-sm" data-add-child="${escapeHtml(node.id)}">Aggiungi sottosezione</button>
                        <button type="button" class="btn-sm btn-danger" data-del="${escapeHtml(node.id)}">Elimina</button>
                    </div>
                </div>
                <div class="wysiwyg-surface inline-wysiwyg" contenteditable="true" role="textbox" aria-multiline="true" data-edit-body></div>
                ${childrenHtml}
            </article>
        `;
    }

    async function hydrateEditableArticle(art) {
        const id = art.getAttribute('data-edit-id');
        const node = findNodeById(id);
        const titleEl = directEditChild(art, 'data-edit-title');
        const bodyEl = directEditChild(art, 'data-edit-body');
        if (!titleEl || !bodyEl) return;
        if (!node) {
            titleEl.textContent = id || 'Sezione';
            bodyEl.innerHTML = '<p class="corsi-error">Contenuto non disponibile.</p>';
            return;
        }
        try {
            const { meta, body } = await loadMarkdown(node.file || `${node.id}.md`);
            titleEl.textContent = meta.title || node.title || id;
            bodyEl.innerHTML = markdownToEditorHtml(body);
            bodyEl.querySelectorAll('.chart-edit-block').forEach(paintChartBlock);
        } catch (_) {
            titleEl.textContent = node.title || id;
            bodyEl.innerHTML = '<p class="corsi-error">Contenuto non disponibile.</p>';
        }
        prepareEditableTables(art);
    }

    async function hydrateEditableTree(rootEl) {
        const articles = [...rootEl.querySelectorAll('[data-edit-id]')];
        for (const art of articles) await hydrateEditableArticle(art);
        if (articles[0]) articles[0].classList.add('is-active');
    }

    function getActiveEditArticle() {
        const sel = window.getSelection();
        let node = sel && sel.anchorNode;
        if (node && node.nodeType === 3) node = node.parentElement;
        const fromSel = node && node.closest ? node.closest('[data-edit-id]') : null;
        if (fromSel) return fromSel;
        return document.querySelector('.inline-doc.is-active[data-edit-id]')
            || document.querySelector('[data-edit-id]');
    }

    function getActiveEditSurface() {
        const art = getActiveEditArticle();
        if (art) {
            const body = directEditChild(art, 'data-edit-body');
            if (body) return body;
        }
        return document.getElementById('edWysiwyg');
    }

    function wireEditFocusTracking(rootEl) {
        rootEl.addEventListener('focusin', (e) => {
            const art = e.target.closest && e.target.closest('[data-edit-id]');
            if (!art) return;
            rootEl.querySelectorAll('.inline-doc.is-active').forEach((el) => el.classList.remove('is-active'));
            art.classList.add('is-active');
        });
    }

    function ensureChartEditDelegation() {
        const root = document.getElementById('contentRoot');
        if (!root || root.dataset.chartWired) return;
        root.dataset.chartWired = '1';
        root.addEventListener('click', (e) => {
            const btn = e.target.closest && e.target.closest('.chart-edit-btn');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            const block = btn.closest('.chart-edit-block');
            if (!block) return;
            let current = CHART_DEFAULT;
            try {
                current = JSON.parse(block.getAttribute('data-chart') || '{}');
            } catch (_) { /* keep default */ }
            openChartBuilder(current, (cfg) => {
                block.setAttribute('data-chart', JSON.stringify(cfg, null, 2));
                paintChartBlock(block);
                setEditorMsg('Grafico aggiornato.');
            }, { title: 'Modifica grafico', okLabel: 'Aggiorna' });
        });
    }

    async function renderDoc(entry, { manageMode }) {
        const root = document.getElementById('contentRoot');
        root.className = 'post';
        try {
            const { meta, body } = await loadMarkdown(entry.file || `${entry.id}.md`);
            const title = meta.title || entry.title;
            const open = isNodeOpen(entry.id, loadTreeExpandState());
            const entryDepth = ancestorIdsOf(entry.id).length;
            const kids = contentNodes(entry.children);

            if (manageMode) {
                root.innerHTML = `
                    ${inlineEditChromeHtml()}
                    <div class="inline-edit-tree">${await renderEditableTree(entry, entryDepth)}</div>
                `;
                await hydrateEditableTree(root);
                wireToolbar();
                wireInlineTreeSave();
                wireEditFocusTracking(root);
                wireManageTreeActions(root);
                return;
            }

            let html = `
                <div class="manage-level is-collapsible${open ? ' is-open' : ' is-collapsed'}" data-tree-id="${escapeHtml(entry.id)}">
                    <div class="manage-level-row">
                        <button type="button" class="manage-toggle" aria-expanded="${open ? 'true' : 'false'}" aria-label="${open ? 'Comprimi' : 'Espandi'}">${open ? '−' : '+'}</button>
                        <div class="manage-level-body">
                            <h1 class="post-title">${escapeHtml(title)}</h1>
            `;
            html += `<div class="manage-collapsible"><div class="collapsible-inner">`;
            html += `${renderMarkdown(body)}`;
            if (kids.length) {
                const expandState = loadTreeExpandState();
                const nested = [];
                for (const k of kids) {
                    nested.push(await renderTreeNode(k, entryDepth + 1, expandState, false));
                }
                html += `<div class="posts-list manage-hierarchy section-children">${nested.join('')}</div>`;
            }
            html += `</div></div></div></div></div>`;
            root.innerHTML = html;
            wireTreeToggles(root);
            renderChartsIn(root);
        } catch (_) {
            root.innerHTML = `<h1 class="page-title">Errore</h1><p class="corsi-error">Impossibile caricare il contenuto richiesto.</p>`;
        }
    }

    function directEditChild(art, attr) {
        if (!art) return null;
        return art.querySelector(`:scope > [${attr}], :scope > .inline-doc-head [${attr}]`);
    }

    function todayIsoDate() {
        return new Date().toISOString().slice(0, 10);
    }

    function collectEditableArticles() {
        return [...document.querySelectorAll('.inline-edit-tree [data-edit-id], [data-edit-id]')];
    }

    function payloadFromEditableArticle(art) {
        const id = art.getAttribute('data-edit-id');
        const entry = findNodeById(id);
        const titleEl = directEditChild(art, 'data-edit-title');
        const bodyEl = directEditChild(art, 'data-edit-body');
        const title = (titleEl?.textContent || '').trim();
        const content = editorHtmlToStored(bodyEl);
        const type = (entry && entry.type) || art.getAttribute('data-edit-type') || 'section';
        const date = (entry && entry.date) || todayIsoDate();
        return {
            id,
            entry,
            title,
            bodyEl,
            payload: {
                id,
                title,
                type,
                date,
                content,
            },
        };
    }

    async function saveAllEditableArticles() {
        const seen = new Set();
        const articles = collectEditableArticles().filter((art) => {
            const id = art.getAttribute('data-edit-id');
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
        if (!articles.length) {
            setEditorMsg('Nessuna sezione da salvare.', true);
            return;
        }

        const prepared = articles.map(payloadFromEditableArticle);
        for (const item of prepared) {
            if (!item.title) {
                setEditorMsg('Ogni sezione deve avere un titolo. Controlla: ' + (item.id || 'senza id'), true);
                item.bodyEl?.closest('[data-edit-id]')?.querySelector('[data-edit-title]')?.focus();
                return;
            }
        }

        const btn = document.getElementById('btnInlineSave');
        if (btn) btn.disabled = true;
        setEditorMsg('Salvataggio di ' + prepared.length + ' sezioni...');
        try {
            const data = await apiJson(API + '/bulk', {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ items: prepared.map((item) => item.payload) }),
            });
            invalidateCache();
            if (data && data.manifest) manifest = data.manifest;
            prepared.forEach((item) => {
                if (item.entry) item.entry.title = item.title;
            });
            buildSidebar(true);
            setActiveNav(currentRoute());
            setEditorMsg('Salvato tutto (' + (data.count || prepared.length) + ' sezioni).');
        } catch (err) {
            setEditorMsg(err.message, true);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function wireInlineTreeSave() {
        const btn = document.getElementById('btnInlineSave');
        if (!btn) return;
        btn.onclick = (e) => {
            e.preventDefault();
            saveAllEditableArticles();
        };
        if (window._corsiInlineSaveKey) {
            document.removeEventListener('keydown', window._corsiInlineSaveKey);
        }
        window._corsiInlineSaveKey = function onKey(e) {
            if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
            if (!document.querySelector('[data-edit-body]')) {
                document.removeEventListener('keydown', window._corsiInlineSaveKey);
                window._corsiInlineSaveKey = null;
                return;
            }
            e.preventDefault();
            saveAllEditableArticles();
        };
        document.addEventListener('keydown', window._corsiInlineSaveKey);
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
        const blocks = [];
        for (const section of roots) {
            blocks.push(await renderEditableTree(section, 0));
        }
        root.innerHTML = `
            <div class="page" style="margin-bottom:1rem;">
                <h1 class="page-title">Gestione contenuti</h1>
                <div class="editor-actions" style="margin:0.5rem 0 0.75rem;">
                    <a class="btn-sm btn-primary" href="#new" style="display:inline-block;padding:0.45rem 0.9rem;border:1px solid #000;background:#000;color:#fff;border-radius:3px;text-decoration:none;">Nuova sezione</a>
                </div>
            </div>
            ${inlineEditChromeHtml()}
            <div class="inline-edit-tree">${blocks.join('') || '<p>Nessuna sezione. Crea la prima.</p>'}</div>
        `;
        await hydrateEditableTree(root);
        wireToolbar();
        wireInlineTreeSave();
        wireEditFocusTracking(root);
        wireManageTreeActions(root);
    }

    async function renderManage(route) {
        if (!canEdit) { window.location.replace(READ_ONLY_URL); return; }
        const { segs, qs } = parseRoute(route === 'index' ? '' : route);
        const action = segs[0] || '';

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
                content: 'Scrivi qui il contenuto della sezione.\n',
            });
            wireEditor('create', null, 'Scrivi qui il contenuto della sezione.\n');
            return;
        }

        if (action === 'edit' && segs[1]) {
            window.location.hash = 'view/' + segs[1];
            return;
        }

        const focusId = (action === 'view' && segs[1])
            ? segs[1]
            : (action && action !== 'index' && action !== 'view' && action !== 'edit' && action !== 'new' ? action : null);

        const treeReady = document.querySelector('.inline-edit-tree [data-edit-id]');
        if (treeReady) {
            highlightAndScrollEdit(focusId);
            return;
        }

        await renderManageIndex();
        highlightAndScrollEdit(focusId);
    }

    function highlightAndScrollEdit(id) {
        const root = document.getElementById('contentRoot');
        if (!root) return;
        root.querySelectorAll('.inline-doc.is-active').forEach((el) => el.classList.remove('is-active'));
        if (!id) return;
        const art = [...root.querySelectorAll('[data-edit-id]')].find((el) => el.getAttribute('data-edit-id') === id);
        if (!art) return;
        art.classList.add('is-active');
        art.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
            <form id="editorForm" class="editor-form editor-form--wysiwyg">
                <input type="hidden" id="edId" value="${escapeHtml(state.id)}">
                <input type="hidden" id="edContent" value="">

                <div class="editor-meta">
                    <label for="edTitle">Titolo</label>
                    <input type="text" id="edTitle" maxlength="120" value="${escapeHtml(state.title)}" required>
                    <p class="editor-hint">L’identificativo URL viene creato automaticamente dal titolo (spazi → underscore).</p>
                    ${typeParentFields}
                </div>

                <label class="editor-content-label">Contenuto</label>
                <div class="wysiwyg-shell">
                    ${toolbarHtml()}
                    <div id="edWysiwyg" class="wysiwyg-surface post" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Scrivi qui come in un documento Word…"></div>
                </div>
                <p class="editor-hint">Modifica direttamente il testo formattato. Il risultato è quello che vedranno gli studenti.</p>

                <div class="editor-actions">
                    <button type="submit" class="btn-primary">Salva modifiche</button>
                    ${state.mode === 'edit' ? '<button type="button" class="btn-danger" id="btnDelete">Elimina</button>' : ''}
                </div>
                <p id="editorMsg" class="editor-hint"></p>
            </form>
        `;
    }

    // ── Toolbar / WYSIWYG ──────────────────────────────────────────────────────
    const CHART_DEFAULT = {
        type: 'bar',
        title: 'Titolo del grafico',
        labels: ['Gennaio', 'Febbraio', 'Marzo'],
        datasets: [{ label: 'Serie 1', data: [10, 25, 18] }],
    };
    const CHART_PALETTE = ['#268bd2', '#ac4142', '#90a959', '#f4bf75', '#aa759f', '#75b5aa', '#d28445', '#6a9fb5'];
    const CHART_TYPES = new Set(['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea']);
    const CHART_TYPE_OPTIONS = [
        { value: 'bar', label: 'Barre' },
        { value: 'line', label: 'Linee' },
        { value: 'pie', label: 'Torta' },
        { value: 'doughnut', label: 'Ciambella' },
        { value: 'radar', label: 'Radar' },
        { value: 'polarArea', label: 'Area polare' },
    ];

    function normalizeHexColor(value, fallback) {
        const raw = String(value || '').trim();
        if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
        if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
            return ('#' + raw[1] + raw[1] + raw[2] + raw[2] + raw[3] + raw[3]).toLowerCase();
        }
        if (/^#[0-9a-fA-F]{8}$/.test(raw)) return ('#' + raw.slice(1, 7)).toLowerCase();
        return fallback;
    }

    function defaultSeriesColor(i) {
        return CHART_PALETTE[i % CHART_PALETTE.length];
    }

    function isCircularChartType(type) {
        return type === 'pie' || type === 'doughnut' || type === 'polarArea';
    }

    function withAlpha(hex, alpha) {
        const c = normalizeHexColor(hex, '#268bd2');
        return c + alpha;
    }

    function normalizeChartConfig(cfg) {
        const src = cfg && typeof cfg === 'object' ? cfg : {};
        const type = CHART_TYPES.has(src.type) ? src.type : 'bar';
        const labels = Array.isArray(src.labels) && src.labels.length
            ? src.labels.map(String)
            : [...CHART_DEFAULT.labels];
        const datasets = (Array.isArray(src.datasets) && src.datasets.length ? src.datasets : CHART_DEFAULT.datasets)
            .map((d, i) => {
                const fallback = defaultSeriesColor(i);
                let color = fallback;
                if (d && d.color) color = normalizeHexColor(d.color, fallback);
                else if (d && typeof d.borderColor === 'string') color = normalizeHexColor(d.borderColor, fallback);
                else if (d && typeof d.backgroundColor === 'string') color = normalizeHexColor(d.backgroundColor, fallback);
                return {
                    label: (d && d.label) ? String(d.label) : `Serie ${i + 1}`,
                    data: Array.isArray(d && d.data) ? d.data.map((n) => Number(n) || 0) : [],
                    color,
                };
            });
        datasets.forEach((d) => {
            while (d.data.length < labels.length) d.data.push(0);
            if (d.data.length > labels.length) d.data = d.data.slice(0, labels.length);
        });
        let categoryColors = Array.isArray(src.categoryColors) ? src.categoryColors.map((c, j) => normalizeHexColor(c, defaultSeriesColor(j))) : null;
        if (!categoryColors || categoryColors.length !== labels.length) {
            const fromFirst = src.datasets && src.datasets[0] && Array.isArray(src.datasets[0].backgroundColor)
                ? src.datasets[0].backgroundColor
                : null;
            categoryColors = labels.map((_, j) => normalizeHexColor(
                (categoryColors && categoryColors[j]) || (fromFirst && fromFirst[j]) || defaultSeriesColor(j),
                defaultSeriesColor(j),
            ));
        }
        return {
            type,
            title: src.title != null ? String(src.title) : '',
            labels,
            datasets,
            categoryColors,
            legend: src.legend !== false,
        };
    }

    function styleChartDatasets(type, cfg) {
        const circular = isCircularChartType(type);
        const categoryColors = Array.isArray(cfg.categoryColors) ? cfg.categoryColors : [];
        return (Array.isArray(cfg.datasets) ? cfg.datasets : []).map((d, i) => {
            const color = normalizeHexColor(d.color, defaultSeriesColor(i));
            const styled = {
                label: d.label || `Serie ${i + 1}`,
                data: Array.isArray(d.data) ? d.data : [],
                color,
                borderWidth: d.borderWidth ?? (type === 'line' || type === 'radar' ? 2 : 1),
                tension: d.tension ?? 0.25,
            };
            if (circular) {
                styled.backgroundColor = styled.data.map((_, j) => normalizeHexColor(categoryColors[j], defaultSeriesColor(j)));
                styled.borderColor = '#ffffff';
                styled.borderWidth = 1;
            } else {
                styled.backgroundColor = type === 'line' || type === 'radar' ? withAlpha(color, '33') : color;
                styled.borderColor = color;
                if (type === 'radar') styled.fill = true;
            }
            return styled;
        });
    }

    function destroyChartPreview() {
        const modal = document.getElementById('chartModal');
        if (!modal || !modal._previewChart) return;
        try { modal._previewChart.destroy(); } catch (_) { /* ignore */ }
        modal._previewChart = null;
    }

    function readChartDataGrid(modal) {
        const table = modal.querySelector('#chartDataTable');
        if (!table) return { labels: [], datasets: [], categoryColors: [] };
        const labels = [...table.querySelectorAll('thead .chart-cat-label')]
            .map((inp) => (inp.value || '').trim() || 'Categoria');
        const categoryColors = [...table.querySelectorAll('thead .chart-cat-color')]
            .map((inp, j) => normalizeHexColor(inp.value, defaultSeriesColor(j)));
        const datasets = [...table.querySelectorAll('tbody tr')].map((tr, i) => {
            const name = (tr.querySelector('.chart-series-name')?.value || '').trim() || `Serie ${i + 1}`;
            const color = normalizeHexColor(tr.querySelector('.chart-series-color')?.value, defaultSeriesColor(i));
            const data = [...tr.querySelectorAll('.chart-cell-value')].map((inp) => {
                const n = Number(String(inp.value || '0').replace(',', '.'));
                return Number.isFinite(n) ? n : 0;
            });
            return { label: name, data, color };
        });
        return { labels, datasets, categoryColors };
    }

    function refreshChartPreview(modal) {
        if (!modal || typeof Chart === 'undefined') return;
        const canvas = modal.querySelector('#chartPreviewCanvas');
        if (!canvas) return;
        const type = modal.querySelector('#chartType')?.value || 'bar';
        const title = (modal.querySelector('#chartTitle')?.value || '').trim();
        const grid = readChartDataGrid(modal);
        const cfg = { labels: grid.labels, datasets: grid.datasets, categoryColors: grid.categoryColors };
        destroyChartPreview();
        modal._previewChart = new Chart(canvas, {
            type: CHART_TYPES.has(type) ? type : 'bar',
            data: { labels: grid.labels, datasets: styleChartDatasets(type, cfg) },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: { display: !!title, text: title },
                    legend: { display: true },
                },
            },
        });
    }

    function updateChartModalKind(modal) {
        const type = modal.querySelector('#chartType')?.value || 'bar';
        modal.dataset.chartKind = isCircularChartType(type) ? 'circular' : 'series';
    }

    function buildChartDataTableHtml(cfg) {
        const labels = cfg.labels.length ? cfg.labels : ['Categoria 1'];
        const datasets = cfg.datasets.length ? cfg.datasets : [{ label: 'Serie 1', data: labels.map(() => 0), color: defaultSeriesColor(0) }];
        const categoryColors = cfg.categoryColors || labels.map((_, j) => defaultSeriesColor(j));
        const headCells = labels.map((lab, i) => `
            <th>
                <div class="chart-cat-cell">
                    <input type="color" class="chart-cat-color" value="${escapeHtml(normalizeHexColor(categoryColors[i], defaultSeriesColor(i)))}" title="Colore categoria" aria-label="Colore categoria ${i + 1}">
                    <input type="text" class="chart-cat-label" value="${escapeHtml(lab)}" aria-label="Categoria ${i + 1}">
                    <button type="button" class="chart-cat-remove" title="Rimuovi categoria" data-cat="${i}" ${labels.length <= 1 ? 'disabled' : ''}>×</button>
                </div>
            </th>
        `).join('');
        const bodyRows = datasets.map((d, ri) => {
            const cells = labels.map((_, ci) => `
                <td><input type="number" class="chart-cell-value" step="any" value="${escapeHtml(String(d.data[ci] ?? 0))}" aria-label="Valore"></td>
            `).join('');
            return `
                <tr>
                    <th scope="row">
                        <div class="chart-series-cell">
                            <input type="color" class="chart-series-color" value="${escapeHtml(normalizeHexColor(d.color, defaultSeriesColor(ri)))}" title="Colore serie" aria-label="Colore serie">
                            <input type="text" class="chart-series-name" value="${escapeHtml(d.label)}" aria-label="Nome serie">
                            <button type="button" class="chart-series-remove" title="Rimuovi serie" ${datasets.length <= 1 ? 'disabled' : ''}>×</button>
                        </div>
                    </th>
                    ${cells}
                </tr>
            `;
        }).join('');
        return `
            <table id="chartDataTable" class="chart-data-table">
                <thead>
                    <tr>
                        <th class="chart-corner">
                            <span class="chart-corner-series">Colore + serie</span>
                            <span class="chart-corner-circular">Categorie (colore fetta)</span>
                        </th>
                        ${headCells}
                    </tr>
                </thead>
                <tbody>${bodyRows}</tbody>
            </table>
        `;
    }

    function syncChartGridFromState(modal) {
        const wrap = modal.querySelector('#chartDataWrap');
        if (!wrap || !modal._chartGrid) return;
        wrap.innerHTML = buildChartDataTableHtml(modal._chartGrid);
        updateChartModalKind(modal);
        refreshChartPreview(modal);
    }

    function ensureChartModal() {
        let modal = document.getElementById('chartModal');
        if (modal && modal.dataset.chartUi !== 'colors-1') {
            destroyChartPreview();
            modal.remove();
            modal = null;
        }
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'chartModal';
        modal.className = 'corsi-modal chart-modal';
        modal.dataset.chartUi = 'colors-1';
        modal.style.display = 'none';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'chartModalTitle');
        modal.innerHTML = `
            <div class="corsi-modal-box chart-modal-box">
                <h2 id="chartModalTitle" class="chart-modal-title">Inserisci grafico</h2>
                <p class="chart-modal-help">Compila la tabella come in un foglio. Usa i quadratini colore per le serie (barre/linee) o per le categorie (torta/ciambella).</p>
                <div class="chart-modal-grid">
                    <label class="chart-modal-field">
                        <span>Titolo</span>
                        <input type="text" id="chartTitle" maxlength="120" placeholder="Es. Vendite trimestrali">
                    </label>
                    <label class="chart-modal-field">
                        <span>Tipo di grafico</span>
                        <select id="chartType">
                            ${CHART_TYPE_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
                        </select>
                    </label>
                    <div class="chart-modal-field chart-modal-field--full">
                        <div class="chart-series-head">
                            <span>Dati</span>
                            <div class="chart-grid-actions">
                                <button type="button" class="btn-sm" id="chartAddCategory">+ Categoria</button>
                                <button type="button" class="btn-sm" id="chartAddSeries">+ Serie</button>
                            </div>
                        </div>
                        <div id="chartDataWrap" class="chart-data-wrap"></div>
                    </div>
                    <div class="chart-modal-field chart-modal-field--full">
                        <span>Anteprima</span>
                        <div class="chart-preview-box"><canvas id="chartPreviewCanvas"></canvas></div>
                    </div>
                    <p id="chartModalError" class="chart-modal-error" hidden></p>
                </div>
                <div class="corsi-modal-actions">
                    <button type="button" id="chartModalCancel">Annulla</button>
                    <button type="button" id="chartModalOk">Inserisci</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const schedulePreview = () => {
            clearTimeout(modal._previewTimer);
            modal._previewTimer = setTimeout(() => refreshChartPreview(modal), 120);
        };

        const commitGridEdits = () => {
            if (!modal._chartGrid) return;
            const read = readChartDataGrid(modal);
            modal._chartGrid.labels = read.labels;
            modal._chartGrid.datasets = read.datasets;
            modal._chartGrid.categoryColors = read.categoryColors;
        };

        modal.querySelector('#chartAddCategory').addEventListener('click', () => {
            commitGridEdits();
            const g = modal._chartGrid;
            if (!Array.isArray(g.categoryColors)) g.categoryColors = g.labels.map((_, j) => defaultSeriesColor(j));
            g.labels.push(`Categoria ${g.labels.length + 1}`);
            g.categoryColors.push(defaultSeriesColor(g.labels.length - 1));
            g.datasets.forEach((d) => d.data.push(0));
            syncChartGridFromState(modal);
        });
        modal.querySelector('#chartAddSeries').addEventListener('click', () => {
            commitGridEdits();
            const g = modal._chartGrid;
            g.datasets.push({
                label: `Serie ${g.datasets.length + 1}`,
                data: g.labels.map(() => 0),
                color: defaultSeriesColor(g.datasets.length),
            });
            syncChartGridFromState(modal);
        });
        modal.querySelector('#chartDataWrap').addEventListener('click', (e) => {
            const catBtn = e.target.closest('.chart-cat-remove');
            const serBtn = e.target.closest('.chart-series-remove');
            if (catBtn) {
                commitGridEdits();
                const idx = Number(catBtn.getAttribute('data-cat'));
                const g = modal._chartGrid;
                if (g.labels.length <= 1) return;
                g.labels.splice(idx, 1);
                if (Array.isArray(g.categoryColors)) g.categoryColors.splice(idx, 1);
                g.datasets.forEach((d) => d.data.splice(idx, 1));
                syncChartGridFromState(modal);
                return;
            }
            if (serBtn) {
                commitGridEdits();
                const row = serBtn.closest('tr');
                const rows = [...modal.querySelectorAll('#chartDataTable tbody tr')];
                const idx = rows.indexOf(row);
                if (idx < 0 || modal._chartGrid.datasets.length <= 1) return;
                modal._chartGrid.datasets.splice(idx, 1);
                syncChartGridFromState(modal);
            }
        });
        modal.querySelector('#chartDataWrap').addEventListener('input', () => {
            commitGridEdits();
            schedulePreview();
        });
        modal.querySelector('#chartTitle').addEventListener('input', schedulePreview);
        modal.querySelector('#chartType').addEventListener('change', () => {
            updateChartModalKind(modal);
            schedulePreview();
        });
        modal.querySelector('#chartModalCancel').addEventListener('click', () => closeChartModal());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeChartModal();
        });
        return modal;
    }

    function closeChartModal() {
        const modal = document.getElementById('chartModal');
        if (!modal) return;
        destroyChartPreview();
        modal.style.display = 'none';
        modal._onApply = null;
        modal._chartGrid = null;
    }

    function openChartBuilder(initialCfg, onApply, opts) {
        const modal = ensureChartModal();
        const cfg = normalizeChartConfig(initialCfg || CHART_DEFAULT);
        const titleEl = modal.querySelector('#chartModalTitle');
        const okBtn = modal.querySelector('#chartModalOk');
        const errEl = modal.querySelector('#chartModalError');
        titleEl.textContent = (opts && opts.title) || 'Inserisci grafico';
        okBtn.textContent = (opts && opts.okLabel) || 'Inserisci';
        errEl.hidden = true;
        errEl.textContent = '';

        modal.querySelector('#chartTitle').value = cfg.title || '';
        modal.querySelector('#chartType').value = cfg.type;
        modal._chartGrid = {
            labels: [...cfg.labels],
            datasets: cfg.datasets.map((d) => ({ label: d.label, data: [...d.data], color: d.color })),
            categoryColors: [...(cfg.categoryColors || cfg.labels.map((_, j) => defaultSeriesColor(j)))],
        };
        syncChartGridFromState(modal);

        modal._onApply = onApply;
        okBtn.onclick = () => {
            commitAndApply();
        };

        function commitAndApply() {
            const title = (modal.querySelector('#chartTitle').value || '').trim();
            const type = modal.querySelector('#chartType').value;
            const { labels, datasets, categoryColors } = readChartDataGrid(modal);
            if (!labels.length) {
                errEl.hidden = false;
                errEl.textContent = 'Aggiungi almeno una categoria.';
                return;
            }
            if (!datasets.length) {
                errEl.hidden = false;
                errEl.textContent = 'Aggiungi almeno una serie di dati.';
                return;
            }
            const next = normalizeChartConfig({ type, title, labels, datasets, categoryColors });
            const apply = modal._onApply;
            closeChartModal();
            if (typeof apply === 'function') apply(next);
        }

        modal.style.display = 'flex';
        modal.querySelector('#chartTitle').focus();
    }

    function insertChartBlockAtCursor(cfg) {
        const surface = getActiveEditSurface();
        const block = buildChartEditBlock(JSON.stringify(normalizeChartConfig(cfg), null, 2));
        const sel = window.getSelection();
        if (sel && sel.rangeCount && surface) {
            const range = sel.getRangeAt(0);
            if (surface.contains(range.commonAncestorContainer)) {
                range.deleteContents();
                range.insertNode(block);
                const spacer = document.createElement('p');
                spacer.innerHTML = '<br>';
                block.after(spacer);
            } else {
                surface.appendChild(block);
            }
        } else if (surface) {
            surface.appendChild(block);
        }
        paintChartBlock(block);
        setEditorMsg('Grafico inserito.');
    }

    const TABLE_HTML = [
        '<table class="corsi-table" style="width:100%;table-layout:fixed">',
        '<colgroup><col style="width:33%"><col style="width:33%"><col style="width:34%"></colgroup>',
        '<thead><tr><th>Colonna 1</th><th>Colonna 2</th><th>Colonna 3</th></tr></thead>',
        '<tbody><tr><td>Valore 1</td><td>Valore 2</td><td>Valore 3</td></tr>',
        '<tr><td>Valore 4</td><td>Valore 5</td><td>Valore 6</td></tr></tbody></table>',
        '<p></p>',
    ].join('');


    let _turndown = null;
    function getTurndown() {
        if (_turndown) return _turndown;
        if (typeof TurndownService === 'undefined') return null;
        _turndown = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            bulletListMarker: '-',
        });
        _turndown.addRule('underline', {
            filter: ['u'],
            replacement: (content) => `<u>${content}</u>`,
        });
        _turndown.addRule('coloredSpan', {
            filter: (node) => node.nodeName === 'SPAN' && node.getAttribute('style') && /color\s*:/i.test(node.getAttribute('style')),
            replacement: (content, node) => {
                const m = String(node.getAttribute('style') || '').match(/color\s*:\s*([^;]+)/i);
                const color = m ? m[1].trim() : '';
                return color ? `<span style="color:${color}">${content}</span>` : content;
            },
        });
        _turndown.addRule('fontColor', {
            filter: (node) => node.nodeName === 'FONT' && node.getAttribute('color'),
            replacement: (content, node) => `<span style="color:${node.getAttribute('color')}">${content}</span>`,
        });
        _turndown.addRule('chartBlock', {
            filter: (node) => node.nodeName === 'DIV' && node.classList && node.classList.contains('chart-edit-block'),
            replacement: (_content, node) => {
                let raw = node.getAttribute('data-chart') || '{}';
                try { raw = JSON.stringify(JSON.parse(raw), null, 2); } catch (_) { /* keep */ }
                return `\n\n\`\`\`chart\n${raw}\n\`\`\`\n\n`;
            },
        });
        // Conserva tabelle in HTML (larghezze/altezze colonne e righe)
        _turndown.addRule('htmlTable', {
            filter: ['table'],
            replacement: (_content, node) => '\n\n' + serializeTableHtml(node) + '\n\n',
        });
        return _turndown;
    }

    function serializeTableHtml(table) {
        const clone = table.cloneNode(true);
        clone.querySelectorAll('[data-resize-ghost], .table-resize-guide').forEach((n) => n.remove());
        return clone.outerHTML;
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
            headers: authHeaders({ 'Content-Type': file.type || 'application/octet-stream' }),
            body: file,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Caricamento non riuscito.');
        return data.url;
    }

    function buildChartEditBlock(rawJson) {
        let raw = rawJson;
        try { raw = JSON.stringify(JSON.parse(rawJson), null, 2); } catch (_) { /* keep */ }
        const block = document.createElement('div');
        block.className = 'chart-edit-block';
        block.contentEditable = 'false';
        block.setAttribute('data-chart', raw);
        block.innerHTML = `
            <div class="chart-edit-head">
                <span>📊 Grafico</span>
                <button type="button" class="chart-edit-btn">Modifica dati</button>
            </div>
            <div class="chart-edit-canvas"><canvas></canvas></div>
        `;
        return block;
    }

    function paintChartBlock(block) {
        const canvas = block.querySelector('canvas');
        if (!canvas || typeof Chart === 'undefined') return;
        if (block._chartInstance) {
            try { block._chartInstance.destroy(); } catch (_) { /* ignore */ }
            block._chartInstance = null;
        }
        let cfg;
        try { cfg = JSON.parse(block.getAttribute('data-chart') || '{}'); }
        catch (_) { return; }
        const normalized = normalizeChartConfig(cfg);
        const type = normalized.type;
        block._chartInstance = new Chart(canvas, {
            type,
            data: {
                labels: normalized.labels,
                datasets: styleChartDatasets(type, normalized),
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: { display: !!normalized.title, text: normalized.title || '' },
                    legend: { display: normalized.legend !== false },
                },
            },
        });
    }

    function looksLikeHtml(md) {
        return /<(p|div|table|h[1-6]|ul|ol|li|img|span|blockquote|pre|figure|thead|tbody|tr|td|th)\b/i.test(md || '');
    }

    function markdownToEditorHtml(md) {
        const wrap = document.createElement('div');
        const raw = md || '';
        wrap.innerHTML = looksLikeHtml(raw)
            ? raw
            : (renderMarkdown(raw) || '<p></p>');
        wrap.querySelectorAll('pre > code.language-chart').forEach((code) => {
            const pre = code.parentElement;
            if (!pre) return;
            pre.replaceWith(buildChartEditBlock(code.textContent.trim()));
        });
        return wrap.innerHTML || '<p></p>';
    }

    function fillWysiwyg(md) {
        const surface = getActiveEditSurface() || document.getElementById('edWysiwyg');
        if (!surface) return;
        surface.innerHTML = markdownToEditorHtml(md);
        surface.querySelectorAll('.chart-edit-block').forEach(paintChartBlock);
        prepareEditableTables(surface);
    }

    function editorHtmlToStored(surfaceEl) {
        const surface = surfaceEl || getActiveEditSurface() || document.getElementById('edWysiwyg');
        if (!surface) return '';
        const clone = surface.cloneNode(true);
        clone.querySelectorAll('.chart-edit-block').forEach((el) => {
            let raw = el.getAttribute('data-chart') || '{}';
            try { raw = JSON.stringify(JSON.parse(raw), null, 2); } catch (_) { /* keep */ }
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.className = 'language-chart';
            code.textContent = raw;
            pre.appendChild(code);
            el.replaceWith(pre);
        });
        return (clone.innerHTML || '').trim() + '\n';
    }

    function editorHtmlToMarkdown(surfaceEl) {
        return editorHtmlToStored(surfaceEl);
    }

    function insertHtmlAtCursor(html) {
        const surface = getActiveEditSurface();
        if (!surface) return;
        surface.focus();
        if (document.queryCommandSupported && document.queryCommandSupported('insertHTML')) {
            document.execCommand('insertHTML', false, html);
        } else {
            surface.insertAdjacentHTML('beforeend', html);
        }
        prepareEditableTables(surface);
    }

    function getSelectedTableContext() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        let node = sel.anchorNode;
        if (node && node.nodeType === 3) node = node.parentElement;
        const cell = node && node.closest ? node.closest('td, th') : null;
        if (!cell) return null;
        const row = cell.parentElement;
        const table = cell.closest('table');
        if (!row || !table) return null;
        const rows = [...table.querySelectorAll('tr')];
        const rowIndex = rows.indexOf(row);
        const cellIndex = [...row.children].indexOf(cell);
        return { table, row, cell, rows, rowIndex, cellIndex };
    }

    function ensureTableColgroup(table) {
        const firstRow = table.querySelector('tr');
        if (!firstRow) return null;
        const n = firstRow.children.length;
        let cg = table.querySelector(':scope > colgroup');
        if (!cg) {
            cg = document.createElement('colgroup');
            table.insertBefore(cg, table.firstChild);
        }
        while (cg.children.length < n) cg.appendChild(document.createElement('col'));
        while (cg.children.length > n) cg.removeChild(cg.lastChild);
        table.classList.add('corsi-table');
        if (!table.style.tableLayout) table.style.tableLayout = 'fixed';
        if (!table.style.width) table.style.width = '100%';
        return cg;
    }

    function snapshotColWidths(table) {
        const cg = ensureTableColgroup(table);
        if (!cg) return;
        const firstRow = table.querySelector('tr');
        const tableW = table.getBoundingClientRect().width || 1;
        [...firstRow.children].forEach((cell, i) => {
            const w = cell.getBoundingClientRect().width;
            const pct = Math.max(5, Math.round((w / tableW) * 1000) / 10);
            cg.children[i].style.width = pct + '%';
        });
    }

    function prepareEditableTables(rootEl) {
        (rootEl || document).querySelectorAll('.wysiwyg-surface table, [data-edit-body] table, #edWysiwyg table').forEach((table) => {
            ensureTableColgroup(table);
            const cg = table.querySelector(':scope > colgroup');
            if (cg && ![...cg.children].some((c) => c.style.width)) snapshotColWidths(table);
        });
    }

    function tableAddRow() {
        const ctx = getSelectedTableContext();
        if (!ctx) { setEditorMsg('Clicca prima in una cella della tabella.', true); return; }
        const cols = ctx.row.children.length;
        const newRow = document.createElement('tr');
        for (let i = 0; i < cols; i++) {
            const td = document.createElement('td');
            td.innerHTML = '<br>';
            newRow.appendChild(td);
        }
        ctx.row.after(newRow);
        ensureTableColgroup(ctx.table);
    }

    function tableDelRow() {
        const ctx = getSelectedTableContext();
        if (!ctx) { setEditorMsg('Clicca prima in una cella della tabella.', true); return; }
        if (ctx.rows.length <= 1) { setEditorMsg('Serve almeno una riga.', true); return; }
        ctx.row.remove();
    }

    function tableAddCol() {
        const ctx = getSelectedTableContext();
        if (!ctx) { setEditorMsg('Clicca prima in una cella della tabella.', true); return; }
        ctx.rows.forEach((tr) => {
            const ref = tr.children[ctx.cellIndex];
            const isHead = ref && ref.tagName === 'TH';
            const cell = document.createElement(isHead ? 'th' : 'td');
            cell.innerHTML = isHead ? 'Nuova' : '<br>';
            if (ref) ref.after(cell);
            else tr.appendChild(cell);
        });
        ensureTableColgroup(ctx.table);
        snapshotColWidths(ctx.table);
    }

    function tableDelCol() {
        const ctx = getSelectedTableContext();
        if (!ctx) { setEditorMsg('Clicca prima in una cella della tabella.', true); return; }
        if (ctx.row.children.length <= 1) { setEditorMsg('Serve almeno una colonna.', true); return; }
        ctx.rows.forEach((tr) => {
            const cell = tr.children[ctx.cellIndex];
            if (cell) cell.remove();
        });
        const cg = ctx.table.querySelector(':scope > colgroup');
        if (cg && cg.children[ctx.cellIndex]) cg.children[ctx.cellIndex].remove();
        ensureTableColgroup(ctx.table);
        snapshotColWidths(ctx.table);
    }

    const TABLE_RESIZE_EDGE = 10;

    function hitTestTableEdge(e, cell) {
        const rect = cell.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        const nearRight = x >= rect.right - TABLE_RESIZE_EDGE && x <= rect.right + 1;
        const nearLeft = x <= rect.left + TABLE_RESIZE_EDGE && x >= rect.left - 1;
        const nearBottom = y >= rect.bottom - TABLE_RESIZE_EDGE && y <= rect.bottom + 1;
        const nearTop = y <= rect.top + TABLE_RESIZE_EDGE && y >= rect.top - 1;
        // angolo: priorità alla colonna
        if (nearRight) return { edge: 'col', cell, side: 'right' };
        if (nearLeft && cell.previousElementSibling) {
            return { edge: 'col', cell: cell.previousElementSibling, side: 'right' };
        }
        if (nearBottom) return { edge: 'row', cell, side: 'bottom' };
        if (nearTop && cell.parentElement && cell.parentElement.previousElementSibling) {
            const prevRow = cell.parentElement.previousElementSibling;
            const idx = [...cell.parentElement.children].indexOf(cell);
            const above = prevRow.children[idx];
            if (above) return { edge: 'row', cell: above, side: 'bottom' };
        }
        return null;
    }

    function clearTableResizeCursors(scope) {
        (scope || document).querySelectorAll('.is-resize-col, .is-resize-row').forEach((el) => {
            el.classList.remove('is-resize-col', 'is-resize-row');
            el.style.removeProperty('cursor');
        });
    }

    function setTableResizeCursor(cell, edge) {
        clearTableResizeCursors(cell.closest('table') || document);
        const cls = edge === 'col' ? 'is-resize-col' : 'is-resize-row';
        cell.classList.add(cls);
        cell.style.cursor = edge === 'col' ? 'col-resize' : 'row-resize';
    }

    function ensureTableResizeDelegation() {
        const root = document.getElementById('contentRoot');
        if (!root || root.dataset.tableResizeWired) return;
        root.dataset.tableResizeWired = '1';

        let drag = null;
        const cellSel = '.wysiwyg-surface td, .wysiwyg-surface th, [data-edit-body] td, [data-edit-body] th, #edWysiwyg td, #edWysiwyg th';

        root.addEventListener('mousemove', (e) => {
            if (drag) return;
            const cell = e.target.closest && e.target.closest(cellSel);
            if (!cell) {
                clearTableResizeCursors(root);
                return;
            }
            const hit = hitTestTableEdge(e, cell);
            if (hit) setTableResizeCursor(hit.cell, hit.edge);
            else clearTableResizeCursors(cell.closest('table') || root);
        });

        root.addEventListener('mouseleave', () => {
            if (!drag) clearTableResizeCursors(root);
        });

        root.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            const cell = e.target.closest && e.target.closest(cellSel);
            if (!cell) return;
            const hit = hitTestTableEdge(e, cell);
            if (!hit) return;
            const resizeCell = hit.cell;
            const table = resizeCell.closest('table');
            const row = resizeCell.parentElement;
            if (!table || !row) return;
            e.preventDefault();
            e.stopPropagation();

            const cg = ensureTableColgroup(table);
            snapshotColWidths(table);
            const cellIndex = [...row.children].indexOf(resizeCell);
            const startX = e.clientX;
            const startY = e.clientY;
            const tableW = table.getBoundingClientRect().width || 1;

            if (hit.edge === 'col') {
                const leftCol = cg.children[cellIndex];
                const rightCol = cg.children[cellIndex + 1];
                const leftStart = leftCol.getBoundingClientRect().width;
                const rightStart = rightCol ? rightCol.getBoundingClientRect().width : 0;
                drag = {
                    type: 'col',
                    table,
                    leftCol,
                    rightCol,
                    leftStart,
                    rightStart,
                    startX,
                    tableW,
                };
                document.body.classList.add('is-table-resizing', 'is-table-resizing-col');
            } else {
                const startH = row.getBoundingClientRect().height;
                drag = {
                    type: 'row',
                    table,
                    row,
                    startH,
                    startY,
                };
                document.body.classList.add('is-table-resizing', 'is-table-resizing-row');
            }
        });

        const onMove = (e) => {
            if (!drag) return;
            e.preventDefault();
            if (drag.type === 'col') {
                const dx = e.clientX - drag.startX;
                const minW = 36;
                let left = drag.leftStart + dx;
                if (drag.rightCol) {
                    let right = drag.rightStart - dx;
                    if (left < minW) {
                        right -= (minW - left);
                        left = minW;
                    }
                    if (right < minW) {
                        left -= (minW - right);
                        right = minW;
                    }
                    if (left < minW || right < minW) return;
                    drag.leftCol.style.width = ((left / drag.tableW) * 100).toFixed(2) + '%';
                    drag.rightCol.style.width = ((right / drag.tableW) * 100).toFixed(2) + '%';
                } else {
                    left = Math.max(minW, left);
                    drag.leftCol.style.width = ((left / drag.tableW) * 100).toFixed(2) + '%';
                }
            } else {
                const dy = e.clientY - drag.startY;
                const h = Math.max(28, Math.round(drag.startH + dy));
                drag.row.style.height = h + 'px';
                [...drag.row.children].forEach((c) => {
                    c.style.height = h + 'px';
                });
            }
        };

        const onUp = () => {
            if (!drag) return;
            if (drag.type === 'col') snapshotColWidths(drag.table);
            drag = null;
            document.body.classList.remove('is-table-resizing', 'is-table-resizing-col', 'is-table-resizing-row');
            clearTableResizeCursors(root);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function isSelectionInTable() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return false;
        let node = sel.anchorNode;
        if (node && node.nodeType === 3) node = node.parentElement;
        if (!node || !node.closest) return false;
        const cell = node.closest('td, th');
        if (!cell) return false;
        return !!(cell.closest('.wysiwyg-surface, [data-edit-body], #edWysiwyg'));
    }

    function syncTableToolsVisibility() {
        const tools = document.getElementById('edTableTools');
        if (!tools) return;
        const show = isSelectionInTable() || !!getSelectedTableContext();
        tools.hidden = !show;
        tools.classList.toggle('is-visible', show);
    }

    function ensureTableToolsVisibilityWatch() {
        if (window._corsiTableToolsWatch) return;
        window._corsiTableToolsWatch = true;
        document.addEventListener('selectionchange', () => {
            if (!document.getElementById('edTableTools')) return;
            syncTableToolsVisibility();
        });
        document.addEventListener('mouseup', () => {
            if (!document.getElementById('edTableTools')) return;
            requestAnimationFrame(syncTableToolsVisibility);
        });
        document.addEventListener('keyup', () => {
            if (!document.getElementById('edTableTools')) return;
            syncTableToolsVisibility();
        });
    }

    function wireToolbar() {
        ensureChartEditDelegation();
        ensureTableResizeDelegation();
        ensureTableToolsVisibilityWatch();
        const toolbar = document.getElementById('edToolbar');
        if (!toolbar) return;
        syncTableToolsVisibility();
        const colorInput = document.getElementById('edColor');
        const colorBar = document.getElementById('edColorBar');
        const fileInput = document.getElementById('edImageFile');
        const syncColorBar = () => {
            if (colorBar && colorInput) colorBar.style.background = colorInput.value;
        };
        syncColorBar();
        if (colorInput) colorInput.addEventListener('input', syncColorBar);

        if (fileInput && !fileInput.dataset.wired) {
            fileInput.dataset.wired = '1';
            fileInput.addEventListener('change', async () => {
                const file = fileInput.files && fileInput.files[0];
                fileInput.value = '';
                if (!file) return;
                if (file.size > 10 * 1024 * 1024) { setEditorMsg('Immagine troppo grande (max 10 MB).', true); return; }
                setEditorMsg('Caricamento immagine...');
                try {
                    const url = await uploadImage(file);
                    const alt = file.name.replace(/\.[^.]*$/, '').replace(/"/g, '');
                    insertHtmlAtCursor(`<p><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"></p>`);
                    setEditorMsg('Immagine inserita.');
                } catch (err) {
                    setEditorMsg(err.message, true);
                }
            });
        }

        if (toolbar.dataset.wired) return;
        toolbar.dataset.wired = '1';

        toolbar.addEventListener('mousedown', (e) => {
            if (e.target.closest('button, input[type="color"]')) e.preventDefault();
        });

        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-cmd]');
            if (!btn) return;
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            const surface = getActiveEditSurface();
            if (surface) surface.focus();
            if (cmd === 'bold' || cmd === 'italic' || cmd === 'underline'
                || cmd === 'insertUnorderedList' || cmd === 'insertOrderedList') {
                document.execCommand(cmd, false, null);
            } else if (cmd === 'foreColor' && colorInput) {
                document.execCommand('foreColor', false, colorInput.value);
            } else if (cmd === 'image') {
                if (fileInput) fileInput.click();
            } else if (cmd === 'table') {
                insertHtmlAtCursor(TABLE_HTML);
                requestAnimationFrame(syncTableToolsVisibility);
            } else if (cmd === 'tableAddRow') {
                tableAddRow();
            } else if (cmd === 'tableDelRow') {
                tableDelRow();
            } else if (cmd === 'tableAddCol') {
                tableAddCol();
            } else if (cmd === 'tableDelCol') {
                tableDelCol();
            } else if (cmd === 'chart') {
                openChartBuilder(CHART_DEFAULT, (cfg) => insertChartBlockAtCursor(cfg), {
                    title: 'Inserisci grafico',
                    okLabel: 'Inserisci',
                });
            }
            requestAnimationFrame(syncTableToolsVisibility);
        });
    }

    // ── Grafici nei contenuti (blocchi ```chart con JSON) ─────────────────────
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
                const normalized = normalizeChartConfig(cfg);
                new Chart(canvas, {
                    type: normalized.type,
                    data: {
                        labels: normalized.labels,
                        datasets: styleChartDatasets(normalized.type, normalized),
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            title: { display: !!normalized.title, text: normalized.title || '' },
                            legend: { display: normalized.legend !== false },
                        },
                    },
                });
            } catch (err) {
                wrap.outerHTML = '<p class="corsi-error">Impossibile disegnare il grafico: ' + escapeHtml(err.message) + '</p>';
            }
        });
    }

    function wireEditor(mode, existingId, seedMarkdown) {
        const idInput = document.getElementById('edId');
        const titleInput = document.getElementById('edTitle');
        const contentHidden = document.getElementById('edContent');
        const form = document.getElementById('editorForm');
        fillWysiwyg(seedMarkdown || '');
        wireToolbar();
        if (mode === 'create') {
            const syncId = () => { idInput.value = slugify(titleInput.value); };
            titleInput.addEventListener('input', syncId);
            syncId();
        }
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
                        setEditorMsg(err.message, true);
                    }
                });
            });
        }
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            setEditorMsg('Salvataggio...');
            const parentVal = document.getElementById('edParent').value || null;
            let type = document.getElementById('edType').value;
            if (parentVal) type = 'section';
            else if (type === 'section') type = 'course';
            const title = titleInput.value.trim();
            if (mode === 'create') idInput.value = slugify(title);
            const md = editorHtmlToMarkdown();
            if (contentHidden) contentHidden.value = md;
            const payload = {
                id: idInput.value.trim().toLowerCase(),
                title,
                type,
                content: md,
                parentId: parentVal,
            };
            if (mode === 'create' && !payload.id) {
                setEditorMsg('Il titolo deve contenere almeno una lettera o un numero.', true);
                return;
            }
            if (!md.trim()) {
                setEditorMsg('Il contenuto non può essere vuoto.', true);
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
                window.location.hash = 'view/' + (mode === 'create' ? payload.id : existingId);
            } catch (err) {
                setEditorMsg(err.message, true);
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
        const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
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
