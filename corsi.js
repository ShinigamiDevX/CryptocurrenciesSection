(function () {
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

    function bodyToDisplayHtml(body) {
        const raw = unwrapWholeDocumentFence(body || '');
        return looksLikeHtml(raw) ? raw : renderMarkdown(raw);
    }

    async function loadContent(id) {
        if (cache[id]) return cache[id];
        const res = await fetch(API + '/content/' + encodeURIComponent(id), { headers: authHeaders() });
        if (!res.ok) throw new Error('Impossibile caricare ' + id);
        const data = await res.json();
        const split = extractTitleStyle(unwrapWholeDocumentFence(data.content || ''));
        const parsed = {
            meta: {
                title: data.title || '',
                date: data.date || '',
                updatedAt: data.updatedAt || '',
                updatedBy: data.updatedBy || '',
            },
            body: split.body,
            titleStyle: split.style,
        };
        cache[id] = parsed;
        return parsed;
    }

    function invalidateCache() { cache = Object.create(null); }

    async function reloadManifest() {
        const res = await fetch(API + '/manifest', { headers: authHeaders() });
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

    function parentIdOfNode(nodeId) {
        let found = null;
        function walk(nodes, parent) {
            for (const n of contentNodes(nodes)) {
                if (n.id === nodeId) {
                    found = parent;
                    return true;
                }
                if (n.children && n.children.length && walk(n.children, n.id)) return true;
            }
            return false;
        }
        walk(navNodes(), null);
        return found;
    }

    function siblingIdsOf(nodeId) {
        const parentId = parentIdOfNode(nodeId);
        const siblings = parentId ? (findNodeById(parentId)?.children || []) : navNodes();
        return contentNodes(siblings).map((n) => n.id);
    }

    function isDescendantOf(ancestorId, nodeId) {
        if (!ancestorId || !nodeId || ancestorId === nodeId) return ancestorId === nodeId;
        const node = findNodeById(ancestorId);
        if (!node) return false;
        let found = false;
        walk(node.children || [], (n) => {
            if (n.id === nodeId) { found = true; return true; }
            return false;
        });
        return found;
    }

    let _navDragId = null;

    async function persistNavOrder(parentId, order) {
        const data = await apiJson(API + '/reorder', {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ parentId: parentId || null, order }),
        });
        invalidateCache();
        if (data && data.manifest) manifest = data.manifest;
        buildSidebar(true);
    }

    function wireNavDragDrop(nav) {
        if (!IS_MANAGE_PAGE || !nav) return;
        const HOLD_MS = 450;
        nav.querySelectorAll('.cs50-item').forEach((li) => {
            if (li.dataset.dragWired) return;
            li.dataset.dragWired = '1';
            li.setAttribute('draggable', 'true');
            const link = li.querySelector('.cs50-link');
            if (link) link.setAttribute('draggable', 'false');

            let holdTimer = null;
            let holdReady = false;
            let suppressClick = false;
            let didDrag = false;

            const clearHold = () => {
                if (holdTimer) {
                    clearTimeout(holdTimer);
                    holdTimer = null;
                }
                holdReady = false;
                li.classList.remove('is-drag-ready');
            };

            const startHold = (e) => {
                if (e.type === 'mousedown' && e.button !== 0) return;
                clearHold();
                didDrag = false;
                suppressClick = false;
                holdTimer = setTimeout(() => {
                    holdReady = true;
                    li.classList.add('is-drag-ready');
                }, HOLD_MS);
            };

            li.addEventListener('mousedown', startHold);
            li.addEventListener('touchstart', startHold, { passive: true });
            li.addEventListener('mouseup', () => {
                if (holdReady) suppressClick = true;
                clearHold();
            });
            li.addEventListener('mouseleave', clearHold);
            li.addEventListener('touchend', () => {
                if (holdReady) suppressClick = true;
                clearHold();
            });
            li.addEventListener('touchcancel', clearHold);

            li.addEventListener('dragstart', (e) => {
                if (!holdReady) {
                    e.preventDefault();
                    return;
                }
                didDrag = true;
                suppressClick = true;
                _navDragId = li.getAttribute('data-nav-id');
                li.classList.add('is-dragging');
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', _navDragId);
                }
                clearHold();
            });
            li.addEventListener('dragend', () => {
                li.classList.remove('is-dragging');
                nav.querySelectorAll('.cs50-item.is-drop-before, .cs50-item.is-drop-after')
                    .forEach((el) => el.classList.remove('is-drop-before', 'is-drop-after'));
                _navDragId = null;
            });
            if (link) {
                link.addEventListener('click', (e) => {
                    if (didDrag || suppressClick) {
                        e.preventDefault();
                        suppressClick = false;
                        didDrag = false;
                    }
                });
            }
            li.addEventListener('dragover', (e) => {
                if (!_navDragId) return;
                const targetId = li.getAttribute('data-nav-id');
                if (!targetId || targetId === _navDragId) return;
                if (isDescendantOf(_navDragId, targetId)) return;
                const dragParent = parentIdOfNode(_navDragId);
                const targetParent = parentIdOfNode(targetId);
                if (dragParent !== targetParent) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                const rect = li.getBoundingClientRect();
                const before = (e.clientY - rect.top) < rect.height / 2;
                nav.querySelectorAll('.cs50-item.is-drop-before, .cs50-item.is-drop-after')
                    .forEach((el) => el.classList.remove('is-drop-before', 'is-drop-after'));
                li.classList.add(before ? 'is-drop-before' : 'is-drop-after');
            });
            li.addEventListener('dragleave', (e) => {
                if (!li.contains(e.relatedTarget)) {
                    li.classList.remove('is-drop-before', 'is-drop-after');
                }
            });
            li.addEventListener('drop', async (e) => {
                e.preventDefault();
                const targetId = li.getAttribute('data-nav-id');
                const dragId = _navDragId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
                li.classList.remove('is-drop-before', 'is-drop-after');
                if (!dragId || !targetId || dragId === targetId) return;
                if (isDescendantOf(dragId, targetId)) return;
                const parentId = parentIdOfNode(dragId);
                if (parentId !== parentIdOfNode(targetId)) return;
                const order = siblingIdsOf(dragId);
                const from = order.indexOf(dragId);
                const to = order.indexOf(targetId);
                if (from < 0 || to < 0 || from === to) return;
                order.splice(from, 1);
                const rect = li.getBoundingClientRect();
                const before = (e.clientY - rect.top) < rect.height / 2;
                let insertAt = order.indexOf(targetId);
                if (insertAt < 0) insertAt = order.length;
                else if (!before) insertAt += 1;
                order.splice(insertAt, 0, dragId);
                try {
                    await persistNavOrder(parentId, order);
                } catch (err) {
                    alert(err.message);
                }
            });
        });
    }

    function renderNavTree(nodes, depth, manageMode) {
        const items = contentNodes(nodes);
        if (!items.length) return '';
        return items.map((n) => {
            const kidsList = contentNodes(n.children);
            const hasKids = kidsList.length > 0;
            const kids = hasKids
                ? `<div class="cs50-subwrap"><ul class="cs50-sub depth-${depth + 1}">${renderNavTree(n.children, depth + 1, manageMode)}</ul></div>`
                : '';
            return `
                <li class="cs50-item depth-${depth} type-${escapeHtml(n.type)}${hasKids ? ' has-children' : ''} is-open" data-nav-id="${escapeHtml(n.id)}">
                    <div class="cs50-row">
                        <a class="cs50-link" href="${contentHref(n.id, manageMode)}" data-route="${escapeHtml(n.id)}"${manageMode ? ' title="Tieni premuto per spostare"' : ''}>${escapeHtml(n.title)}</a>
                    </div>
                    ${kids}
                </li>
            `;
        }).join('');
    }

    function buildSidebar(manageMode) {
        const nav = document.getElementById('sidebarNav');
        nav.className = 'sidebar-nav cs50-nav' + (manageMode ? ' cs50-nav-manage' : '');
        nav.innerHTML = `
            <ul class="cs50-root">
                ${renderNavTree(navNodes(), 0, !!manageMode)}
            </ul>
        `;
        if (manageMode) wireNavDragDrop(nav);
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

    async function apiJson(url, options) {
        const res = await fetch(url, options);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.error || 'Operazione non riuscita.');
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    function levelLabel(depth) {
        if (depth <= 0) return 'Sezione';
        if (depth === 1) return 'Sottosezione';
        return `Sottosezione liv. ${depth}`;
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

    function wireNewSectionButton() {
        const btn = document.getElementById('btnNewSection');
        if (!btn || btn.dataset.wired) return;
        btn.dataset.wired = '1';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            addSectionInline({ btn });
        });
    }

    function editTreeSelector(id) {
        return '.inline-edit-tree [data-edit-id="' + String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]';
    }

    function focusEditableTitle(art) {
        const titleEl = directEditChild(art, 'data-edit-title');
        if (!titleEl) return;
        titleEl.focus();
        const range = document.createRange();
        range.selectNodeContents(titleEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    async function mountNewEditableArticle(id, insertParent) {
        const newNode = findNodeById(id);
        if (!newNode) {
            await renderManageIndex();
            highlightAndScrollEdit(id);
            return;
        }
        const depth = ancestorIdsOf(id).length;
        const html = await renderEditableTree(newNode, depth);
        let host = insertParent;
        if (host) {
            if (!host.classList.contains('inline-doc-children')) {
                let kidsWrap = [...host.children].find((el) => el.classList.contains('inline-doc-children'));
                if (!kidsWrap) {
                    kidsWrap = document.createElement('div');
                    kidsWrap.className = 'inline-doc-children';
                    host.appendChild(kidsWrap);
                }
                host = kidsWrap;
            }
        } else {
            host = document.querySelector('.inline-edit-tree');
        }
        if (!host) {
            await renderManageIndex();
            highlightAndScrollEdit(id);
            return;
        }
        if (host.classList.contains('inline-edit-tree') && !host.querySelector('[data-edit-id]')) {
            host.innerHTML = '';
        }
        host.insertAdjacentHTML('beforeend', html);
        const art = host.lastElementChild;
        if (art && art.getAttribute('data-edit-id') === id) {
            await hydrateEditableArticle(art);
            wireManageTreeActions(art);
            highlightAndScrollEdit(id);
            focusEditableTitle(art);
        }
    }

    async function addSectionInline({ parentId, btn } = {}) {
        const isChild = !!parentId;
        if (btn) btn.disabled = true;
        setEditorMsg(isChild ? 'Creazione sottosezione...' : 'Creazione sezione...');
        try {
            const title = isChild ? 'Nuova sottosezione' : 'Nuova sezione';
            const id = uniqueContentId(title);
            const data = await apiJson(API + '/items', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    id,
                    title,
                    type: isChild ? 'section' : 'course',
                    date: todayIsoDate(),
                    content: '<p></p>\n',
                    parentId: parentId || null,
                }),
            });
            if (data && data.manifest) manifest = data.manifest;
            invalidateCache();
            buildSidebar(true);
            if (document.querySelector('.inline-edit-tree[data-view="single"]')) {
                window.location.hash = 'view/' + encodeURIComponent(id);
                const created = findNodeById(id);
                if (created) await renderManageSection(created);
                else highlightAndScrollEdit(id);
                setEditorMsg(isChild
                    ? 'Sottosezione creata. Modificala qui e premi Salva.'
                    : 'Sezione creata. Modificala qui e premi Salva.');
                return;
            }
            const parentArt = parentId ? document.querySelector(editTreeSelector(parentId)) : null;
            await mountNewEditableArticle(id, parentArt);
            setEditorMsg(isChild
                ? 'Sottosezione aggiunta in fondo al livello. Modificala qui e premi Salva.'
                : 'Sezione aggiunta in fondo. Modificala qui e premi Salva.');
        } catch (err) {
            setEditorMsg(err.message, true);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function addSubsectionInline(parentId, btn) {
        if (!parentId) return;
        return addSectionInline({ parentId, btn });
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

    function firstContentId() {
        const roots = contentNodes(navNodes());
        return roots[0] ? roots[0].id : null;
    }

    async function renderHome() {
        const first = firstContentId();
        if (first) {
            window.location.replace(READ_ONLY_URL + '#' + encodeURIComponent(first));
            return;
        }
        const root = document.getElementById('contentRoot');
        root.className = 'page';
        root.innerHTML = '<h1 class="page-title">Corsi</h1><p>Nessuna sezione disponibile. Scegli una voce dalla sidebar quando sarà presente.</p>';
    }

    const LOCAL_FONTS_MANIFEST = '/corsi/fonts/manifest.json?v=1';
    const LOCAL_FONTS_CSS = '/corsi/fonts/editor-fonts.css?v=1';

    let EDITOR_FONTS = [
        { id: '', label: 'Predefinito', family: '', source: 'system' },
    ];

    async function loadEditorFontsCatalog() {
        try {
            const res = await fetch(LOCAL_FONTS_MANIFEST);
            if (!res.ok) return;
            const data = await res.json();
            const local = (data.fonts || []).map((f) => ({
                id: f.id,
                label: f.label,
                family: f.family,
                source: 'local',
            }));
            if (!local.length) return;
            EDITOR_FONTS = [
                { id: '', label: 'Predefinito', family: '', source: 'system' },
                ...local,
            ];
        } catch (_) { /* mantieni solo Predefinito */ }
    }

    function fontSelectOptionsHtml() {
        const local = EDITOR_FONTS.filter((f) => f.source === 'local');
        const def = EDITOR_FONTS.find((f) => f.source === 'system');
        const opt = (f) => `<option value="${escapeHtml(f.family)}"${f.family ? ` style="font-family:${escapeHtml(f.family)}"` : ''}>${escapeHtml(f.label)}</option>`;
        if (!local.length) return opt(def);
        return [
            opt(def),
            `<optgroup label="Font del progetto">${local.map(opt).join('')}</optgroup>`,
        ].join('');
    }

    function ensureEditorFonts() {
        if (document.getElementById('corsiEditorFonts')) return;
        const link = document.createElement('link');
        link.id = 'corsiEditorFonts';
        link.rel = 'stylesheet';
        link.href = LOCAL_FONTS_CSS;
        document.head.appendChild(link);
    }

    function applyFontFamily(family) {
        saveColorSelection();
        prepareColorCommand();
        const host = colorPickerState.capture && colorPickerState.capture.host;
        if (host && host.hasAttribute('data-edit-title')) {
            if (!family) {
                host.style.fontFamily = '';
                if (!(host.getAttribute('style') || '').trim()) host.removeAttribute('style');
            } else {
                host.style.fontFamily = family;
            }
            return;
        }
        try { document.execCommand('styleWithCSS', false, true); } catch (_) { /* ignore */ }
        if (!family) {
            applyFontFamilyFallback('inherit');
            return;
        }
        const ok = document.execCommand('fontName', false, family);
        if (!ok) applyFontFamilyFallback(family);
    }

    function applyFontFamilyFallback(family) {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0).cloneRange();
        if (range.collapsed) {
            const span = document.createElement('span');
            span.style.fontFamily = family;
            const zw = document.createTextNode('\u200b');
            span.appendChild(zw);
            range.insertNode(span);
            const next = document.createRange();
            next.setStart(zw, 1);
            next.collapse(true);
            sel.removeAllRanges();
            sel.addRange(next);
            if (colorPickerState.capture) colorPickerState.capture.range = next.cloneRange();
            return;
        }
        const span = document.createElement('span');
        span.style.fontFamily = family;
        try {
            range.surroundContents(span);
        } catch (_) {
            span.appendChild(range.extractContents());
            range.insertNode(span);
        }
    }

    function toolbarHtml() {
        return `
            <div class="editor-toolbar" id="edToolbar">
                <button type="button" data-cmd="bold" title="Grassetto"><b>G</b></button>
                <button type="button" data-cmd="italic" title="Corsivo"><i>C</i></button>
                <button type="button" data-cmd="underline" title="Sottolineato"><u>S</u></button>
                <label class="tb-font-wrap" title="Carattere">
                    <span class="visually-hidden">Carattere</span>
                    <select id="edFont" class="tb-font-select" aria-label="Carattere">
                        ${fontSelectOptionsHtml()}
                    </select>
                </label>
                <span class="tb-color-split" data-color-kind="bg">
                    <button type="button" class="tb-color-btn" data-cmd="bgColor" title="Applica colore di sfondo">
                        <svg class="tb-fill-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.2 9.2 8.6 2.8l3.4 3.4-6.4 6.4c-.8.8-2 .8-2.8 0-.8-.8-.8-2 0-2.8z"/><path d="M11.6 7.6c1.2 1.6 2.6 1.4 3.2.4"/></svg>
                        <span class="tb-color-bar" id="edBgBar"></span>
                    </button>
                    <button type="button" class="tb-color-arrow" data-cmd="bgColorMenu" title="Scegli colore di sfondo" aria-haspopup="dialog" aria-label="Scegli colore di sfondo">
                        <span class="tb-color-caret" aria-hidden="true"></span>
                    </button>
                </span>
                <span class="tb-color-split" data-color-kind="fg">
                    <button type="button" class="tb-color-btn" data-cmd="foreColor" title="Applica colore del testo">
                        A<span class="tb-color-bar" id="edColorBar"></span>
                    </button>
                    <button type="button" class="tb-color-arrow" data-cmd="foreColorMenu" title="Scegli colore del testo" aria-haspopup="dialog" aria-label="Scegli colore del testo">
                        <span class="tb-color-caret" aria-hidden="true"></span>
                    </button>
                </span>
                <span class="tb-sep"></span>
                <button type="button" data-cmd="insertUnorderedList" title="Elenco puntato">• Elenco</button>
                <button type="button" data-cmd="insertOrderedList" title="Elenco numerato">1. Elenco</button>
                <span class="tb-sep"></span>
                <button type="button" data-cmd="image" title="Carica e inserisci un'immagine">🖼 Immagine</button>
                <button type="button" data-cmd="chart" title="Inserisci un grafico">📊 Grafico</button>
                <button type="button" data-cmd="table" title="Inserisci una tabella">▦ Tabella</button>
                <button type="button" data-cmd="codeBlock" title="Inserisci un blocco codice Markdown">{} Codice</button>
                <span class="tb-table-tools" id="edTableTools" hidden>
                    <span class="tb-sep"></span>
                    <button type="button" data-cmd="tableAddRow" title="Aggiungi riga sotto">+ Riga</button>
                    <button type="button" data-cmd="tableDelRow" title="Elimina riga">− Riga</button>
                    <button type="button" data-cmd="tableAddCol" title="Aggiungi colonna a destra">+ Col</button>
                    <button type="button" data-cmd="tableDelCol" title="Elimina colonna">− Col</button>
                </span>
                <span class="tb-sep"></span>
                <button type="button" data-cmd="plainText" title="Esci dal blocco codice e torna al testo normale">Testo normale</button>
                <input type="file" id="edImageFile" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none;">
            </div>
        `;
    }

    function manageHeadHtml() {
        return `
            <header class="manage-page-head">
                <h1 class="page-title">Gestione contenuti</h1>
                <button type="button" class="btn-new-section" id="btnNewSection">Nuova sezione</button>
            </header>
        `;
    }

    function inlineEditChromeHtml() {
        return `
            <p class="inline-edit-hint">Clicca su titolo o testo per modificare. «Salva» registra solo le sezioni che hai cambiato. Gli avvisi in alto ti segnalano se un collega entra in Gestione contenuti o salva modifiche.</p>
            <div class="inline-edit-bar">
                ${toolbarHtml()}
                <div class="inline-edit-actions">
                    <button type="button" class="btn-primary" id="btnInlineSave">Salva</button>
                    <button type="button" class="btn-sm" id="btnInlineReload">Ricarica</button>
                    <span id="editorMsg" class="editor-hint"></span>
                </div>
            </div>
        `;
    }

    async function renderEditableTree(node, depth, includeChildren = true) {
        const titleTag = depth <= 0 ? 'h1' : (depth === 1 ? 'h2' : 'h3');
        const kids = contentNodes(node.children);
        let childrenHtml = '';
        if (includeChildren && kids.length) {
            const parts = [];
            for (const k of kids) parts.push(await renderEditableTree(k, depth + 1, true));
            childrenHtml = `<div class="inline-doc-children">${parts.join('')}</div>`;
        }
        return `
            <article class="inline-doc depth-${depth}" data-edit-id="${escapeHtml(node.id)}" data-edit-type="${escapeHtml(node.type || 'section')}">
                <div class="inline-doc-head">
                    <${titleTag} class="post-title inline-edit-title" contenteditable="true" spellcheck="true" data-edit-title></${titleTag}>
                    <div class="inline-doc-actions">
                        <button type="button" class="btn-icon btn-icon-add" data-add-child="${escapeHtml(node.id)}" title="Aggiungi sottosezione" aria-label="Aggiungi sottosezione">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                        </button>
                        <button type="button" class="btn-icon btn-icon-del" data-del="${escapeHtml(node.id)}" title="Elimina" aria-label="Elimina">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6"/></svg>
                        </button>
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
            const { meta, body, titleStyle } = await loadContent(node.id);
            titleEl.textContent = meta.title || node.title || id;
            if (titleStyle) titleEl.setAttribute('style', titleStyle);
            else titleEl.removeAttribute('style');
            bodyEl.innerHTML = markdownToEditorHtml(body);
            bodyEl.querySelectorAll('.chart-edit-block').forEach(paintChartBlock);
            highlightCodeIn(bodyEl);
            if (meta.updatedAt) art.dataset.editUpdatedAt = meta.updatedAt;
            else art.removeAttribute('data-edit-updated-at');
            markArticleBaseline(art);
        } catch (_) {
            titleEl.textContent = node.title || id;
            bodyEl.innerHTML = '<p class="corsi-error">Contenuto non disponibile.</p>';
            markArticleBaseline(art);
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

    function articleEditFingerprint(art) {
        const titleEl = directEditChild(art, 'data-edit-title');
        const bodyEl = directEditChild(art, 'data-edit-body');
        if (!titleEl || !bodyEl) return '';
        return (titleEl.textContent || '') + '\n---\n' + editorHtmlToStored(bodyEl);
    }

    function markArticleBaseline(art) {
        if (!art) return;
        art.dataset.editBaseline = articleEditFingerprint(art);
        art.removeAttribute('data-edit-dirty');
    }

    function isArticleDirty(art) {
        if (!art) return false;
        if (art.dataset.editDirty === '1') return true;
        const base = art.dataset.editBaseline;
        if (base == null) return true;
        return articleEditFingerprint(art) !== base;
    }

    function wireEditDirtyTracking(rootEl) {
        if (!rootEl || rootEl.dataset.dirtyWired) return;
        rootEl.dataset.dirtyWired = '1';
        rootEl.addEventListener('input', (e) => {
            const art = e.target.closest && e.target.closest('[data-edit-id]');
            if (art) art.dataset.editDirty = '1';
        });
    }

    async function reloadEditableContent() {
        invalidateCache();
        await reloadManifest();
        buildSidebar(true);
        const root = document.getElementById('contentRoot');
        const tree = root && root.querySelector('.inline-edit-tree');
        if (!tree) return;
        const activeId = getActiveEditArticle()?.getAttribute('data-edit-id');
        const articles = [...tree.querySelectorAll('[data-edit-id]')];
        for (const art of articles) await hydrateEditableArticle(art);
        highlightCodeIn(tree);
        ensureCodeHighlighting();
        if (activeId) {
            tree.querySelectorAll('.inline-doc.is-active').forEach((el) => el.classList.remove('is-active'));
            const art = tree.querySelector('[data-edit-id="' + CSS.escape(activeId) + '"]');
            if (art) art.classList.add('is-active');
        }
        setEditorMsg('Contenuti ricaricati dal server.');
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

    async function renderReadTree(node, depth) {
        const { meta, body, titleStyle } = await loadContent(node.id);
        const title = meta.title || node.title;
        const tag = depth <= 0 ? 'h1' : (depth === 1 ? 'h2' : 'h3');
        const titleClass = depth <= 0 ? 'post-title' : 'post-title nest-title';
        const titleStyleAttr = titleStyle ? ` style="${escapeHtml(titleStyle)}"` : '';
        let html = `<section class="corsi-section depth-${depth}" id="sec-${escapeHtml(node.id)}">`;
        html += `<${tag} class="${titleClass}"${titleStyleAttr}>${escapeHtml(title)}</${tag}>`;
        html += `<div class="corsi-section-body">${bodyToDisplayHtml(body)}</div>`;
        html += '</section>';
        return html;
    }

    async function renderDoc(entry, { manageMode }) {
        const root = document.getElementById('contentRoot');
        root.className = 'post';
        try {
            const entryDepth = ancestorIdsOf(entry.id).length;

            if (manageMode) {
                root.innerHTML = `
                    ${inlineEditChromeHtml()}
                    <div class="inline-edit-tree">${await renderEditableTree(entry, entryDepth, false)}</div>
                `;
                await hydrateEditableTree(root);
                highlightCodeIn(root);
                ensureCodeHighlighting();
                wireToolbar();
                wireInlineTreeSave();
                wireEditFocusTracking(root);
                wireEditDirtyTracking(root);
                wireManageTreeActions(root);
                return;
            }

            root.innerHTML = await renderReadTree(entry, entryDepth);
            renderChartsIn(root);
            highlightCodeIn(root);
            ensureCodeHighlighting();
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
        const content = wrapTitleStyle(titleEl && titleEl.getAttribute('style'), editorHtmlToStored(bodyEl));
        const type = (entry && entry.type) || art.getAttribute('data-edit-type') || 'section';
        const date = (entry && entry.date) || todayIsoDate();
        return {
            id,
            entry,
            title,
            bodyEl,
            art,
            payload: {
                id,
                title,
                type,
                date,
                content,
                expectedUpdatedAt: art.getAttribute('data-edit-updated-at') || '',
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
        const dirtyArticles = articles.filter(isArticleDirty);
        if (!dirtyArticles.length) {
            setEditorMsg('Nessuna modifica da salvare.');
            return;
        }

        const prepared = dirtyArticles.map(payloadFromEditableArticle);
        for (const item of prepared) {
            if (!item.title) {
                setEditorMsg('Ogni sezione deve avere un titolo. Controlla: ' + (item.id || 'senza id'), true);
                item.bodyEl?.closest('[data-edit-id]')?.querySelector('[data-edit-title]')?.focus();
                return;
            }
        }

        const btn = document.getElementById('btnInlineSave');
        if (btn) btn.disabled = true;
        setEditorMsg('Salvataggio di ' + prepared.length + ' sezion' + (prepared.length === 1 ? 'e' : 'i') + '...');
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
                if (item.art) markArticleBaseline(item.art);
            });
            buildSidebar(true);
            const stayId = (getActiveEditArticle() && getActiveEditArticle().getAttribute('data-edit-id'))
                || (prepared[0] && prepared[0].id)
                || null;
            goReadOnly(stayId);
        } catch (err) {
            if (err.status === 409) {
                setEditorMsg((err.message || 'Conflitto con un altro docente.') + ' Clicca «Ricarica» per aggiornare.', true);
            } else {
                setEditorMsg(err.message, true);
            }
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
        const reloadBtn = document.getElementById('btnInlineReload');
        if (reloadBtn && !reloadBtn.dataset.wired) {
            reloadBtn.dataset.wired = '1';
            reloadBtn.addEventListener('click', (e) => {
                e.preventDefault();
                reloadEditableContent();
            });
        }
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

    async function renderManageSection(node) {
        const root = document.getElementById('contentRoot');
        root.className = 'posts';
        const depth = ancestorIdsOf(node.id).length;
        root.innerHTML = `
            <div class="manage-sticky-chrome">
                ${manageHeadHtml()}
                ${inlineEditChromeHtml()}
            </div>
            <div class="inline-edit-tree" data-view="single">${await renderEditableTree(node, depth, false)}</div>
        `;
        await hydrateEditableTree(root);
        highlightCodeIn(root);
        ensureCodeHighlighting();
        wireToolbar();
        wireInlineTreeSave();
        wireEditFocusTracking(root);
        wireEditDirtyTracking(root);
        wireManageTreeActions(root);
        wireNewSectionButton();
        syncStickyScrollMargin();
        highlightAndScrollEdit(node.id);
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
            <div class="manage-sticky-chrome">
                ${manageHeadHtml()}
                ${inlineEditChromeHtml()}
            </div>
            <div class="inline-edit-tree">${blocks.join('') || '<p>Nessuna sezione. Crea la prima.</p>'}</div>
        `;
        await hydrateEditableTree(root);
        highlightCodeIn(root);
        ensureCodeHighlighting();
        wireToolbar();
        wireInlineTreeSave();
        wireEditFocusTracking(root);
        wireEditDirtyTracking(root);
        wireManageTreeActions(root);
        wireNewSectionButton();
        syncStickyScrollMargin();
    }

    async function renderManage(route) {
        if (!canEdit) { window.location.replace(READ_ONLY_URL); return; }
        const { segs } = parseRoute(route === 'index' ? '' : route);
        const action = segs[0] || '';

        if (action === 'new') {
            if (location.hash) history.replaceState(null, '', location.pathname + location.search);
            await renderManageIndex();
            return;
        }

        if (action === 'edit' && segs[1]) {
            window.location.hash = 'view/' + segs[1];
            return;
        }

        const focusId = (action === 'view' && segs[1])
            ? segs[1]
            : (action && action !== 'index' && action !== 'view' && action !== 'edit' && action !== 'new' ? action : null);

        if (focusId) {
            const node = findNodeById(focusId);
            if (node) {
                await renderManageSection(node);
                return;
            }
        }

        await renderManageIndex();
    }

    const STICKY_SCROLL_GAP = 12;

    function getStickyScrollOffset() {
        const chrome = document.querySelector('.manage-sticky-chrome');
        if (!chrome) return STICKY_SCROLL_GAP;
        return Math.ceil(chrome.getBoundingClientRect().height) + STICKY_SCROLL_GAP;
    }

    function syncStickyScrollMargin() {
        if (!IS_MANAGE_PAGE) return;
        document.documentElement.style.setProperty('--corsi-sticky-offset', getStickyScrollOffset() + 'px');
    }

    function scrollBelowStickyHeader(el, behavior) {
        if (!el) return;
        const y = window.scrollY + el.getBoundingClientRect().top - getStickyScrollOffset();
        window.scrollTo({ top: Math.max(0, y), behavior: behavior || 'auto' });
    }

    function highlightAndScrollEdit(id) {
        const root = document.getElementById('contentRoot');
        if (!root) return;
        root.querySelectorAll('.inline-doc.is-active').forEach((el) => el.classList.remove('is-active'));
        if (!id) return;
        const art = [...root.querySelectorAll('[data-edit-id]')].find((el) => el.getAttribute('data-edit-id') === id);
        if (!art) return;
        art.classList.add('is-active');
        syncStickyScrollMargin();
        requestAnimationFrame(() => scrollBelowStickyHeader(art, 'smooth'));
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
            <div class="manage-sticky-chrome">
                ${manageHeadHtml()}
            </div>
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
    const CHART_PALETTE = ['#0070C0', '#FFC000', '#FF0000'];
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
        const c = normalizeHexColor(hex, '#0070C0');
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

    function chartColorSplitHtml(kindClass, value, index, ariaLabel) {
        const hex = normalizeHexColor(value, defaultSeriesColor(index || 0));
        return `
            <span class="tb-color-split chart-color-split">
                <input type="hidden" class="${kindClass}" value="${escapeHtml(hex)}">
                <button type="button" class="chart-color-swatch-btn" data-cmd="chartColor" style="background:${escapeHtml(hex)}" title="Applica ultimo colore" aria-label="${escapeHtml(ariaLabel)}"></button>
                <button type="button" class="tb-color-arrow" data-cmd="chartColorMenu" title="Scegli colore" aria-haspopup="dialog" aria-label="Scegli ${escapeHtml(ariaLabel)}">
                    <span class="tb-color-caret" aria-hidden="true"></span>
                </button>
            </span>
        `;
    }

    function buildChartDataTableHtml(cfg) {
        const labels = cfg.labels.length ? cfg.labels : ['Categoria 1'];
        const datasets = cfg.datasets.length ? cfg.datasets : [{ label: 'Serie 1', data: labels.map(() => 0), color: defaultSeriesColor(0) }];
        const categoryColors = cfg.categoryColors || labels.map((_, j) => defaultSeriesColor(j));
        const headCells = labels.map((lab, i) => `
            <th>
                <div class="chart-cat-cell">
                    ${chartColorSplitHtml('chart-cat-color', categoryColors[i], i, 'Colore categoria ' + (i + 1))}
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
                            ${chartColorSplitHtml('chart-series-color', d.color, ri, 'Colore serie')}
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
        if (modal && modal.dataset.chartUi !== 'colors-2') {
            destroyChartPreview();
            modal.remove();
            modal = null;
        }
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'chartModal';
        modal.className = 'corsi-modal chart-modal';
        modal.dataset.chartUi = 'colors-2';
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
            const colorBtn = e.target.closest('[data-cmd="chartColor"], [data-cmd="chartColorMenu"]');
            if (colorBtn) {
                e.preventDefault();
                e.stopPropagation();
                const split = colorBtn.closest('.chart-color-split');
                if (!split) return;
                if (colorBtn.dataset.cmd === 'chartColorMenu') {
                    openColorPicker('fg', split, { chartEl: split });
                } else {
                    applyChartTargetColor(split, colorPickerState.chartLast || '#FF0000');
                    closeColorPicker();
                }
                return;
            }
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
        closeColorPicker();
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
        if (window.CorsiExport && typeof window.CorsiExport.getTurndown === 'function') {
            const shared = window.CorsiExport.getTurndown();
            if (shared) return shared;
        }
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
        _turndown.addRule('fontFamilySpan', {
            filter: (node) => node.nodeName === 'SPAN' && node.getAttribute('style') && /font-family\s*:/i.test(node.getAttribute('style')),
            replacement: (content, node) => {
                const style = String(node.getAttribute('style') || '');
                const fm = style.match(/font-family\s*:\s*([^;]+)/i);
                const cm = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
                const parts = [];
                if (fm) parts.push('font-family:' + fm[1].trim());
                if (cm) parts.push('color:' + cm[1].trim());
                return parts.length ? `<span style="${parts.join(';')}">${content}</span>` : content;
            },
        });
        _turndown.addRule('fontFace', {
            filter: (node) => node.nodeName === 'FONT' && (node.getAttribute('face') || node.getAttribute('color')),
            replacement: (content, node) => {
                const parts = [];
                if (node.getAttribute('face')) parts.push('font-family:' + node.getAttribute('face'));
                if (node.getAttribute('color')) parts.push('color:' + node.getAttribute('color'));
                return parts.length ? `<span style="${parts.join(';')}">${content}</span>` : content;
            },
        });
        _turndown.addRule('fontColor', {
            filter: (node) => node.nodeName === 'FONT' && node.getAttribute('color') && !node.getAttribute('face'),
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

    function extractTitleStyle(raw) {
        const s = String(raw || '');
        const m = s.match(/^<!--corsi-title-style:([^>]*?)-->\s*/);
        if (!m) return { style: '', body: s };
        let style = '';
        try { style = decodeURIComponent(m[1]); } catch (_) { style = ''; }
        return { style, body: s.slice(m[0].length) };
    }

    function wrapTitleStyle(style, body) {
        const st = String(style || '').trim();
        if (!st) return body;
        return `<!--corsi-title-style:${encodeURIComponent(st)}-->` + body;
    }

    function looksLikeHtml(md) {
        return /<(p|div|table|h[1-6]|ul|ol|li|img|span|blockquote|pre|figure|thead|tbody|tr|td|th)\b/i.test(md || '');
    }

    /** Se tutto il contenuto è un fence senza linguaggio, era quasi sempre un errore di battitura. */
    function unwrapWholeDocumentFence(md) {
        const s = String(md || '').trim();
        const m = s.match(/^```([a-zA-Z0-9_-]*)[ \t]*\n([\s\S]*?)\n```$/);
        if (!m) return md;
        const lang = (m[1] || '').toLowerCase();
        if (lang && lang !== 'text' && lang !== 'plain') return md;
        return m[2];
    }

    function markdownToEditorHtml(md) {
        const wrap = document.createElement('div');
        const raw = unwrapWholeDocumentFence(md || '');
        wrap.innerHTML = looksLikeHtml(raw)
            ? raw
            : (renderMarkdown(raw) || '<p></p>');
        wrap.querySelectorAll('pre > code.language-chart').forEach((code) => {
            const pre = code.parentElement;
            if (!pre) return;
            pre.replaceWith(buildChartEditBlock(code.textContent.trim()));
        });
        wrap.querySelectorAll('pre').forEach((pre) => {
            if (!pre.nextElementSibling) {
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                pre.after(p);
            }
        });
        stripCodeThemeBars(wrap);
        return wrap.innerHTML || '<p></p>';
    }

    function fillWysiwyg(md) {
        const surface = getActiveEditSurface() || document.getElementById('edWysiwyg');
        if (!surface) return;
        surface.innerHTML = markdownToEditorHtml(md);
        surface.querySelectorAll('.chart-edit-block').forEach(paintChartBlock);
        prepareEditableTables(surface);
        highlightCodeIn(surface);
        ensureCodeHighlighting();
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
        clone.querySelectorAll('pre > code').forEach((code) => {
            if (code.classList.contains('language-chart')) return;
            const lang = [...code.classList].find((c) => c.startsWith('language-') && c !== 'language-chart');
            const text = code.textContent;
            code.className = lang || '';
            code.removeAttribute('data-highlighted');
            code.textContent = text;
        });
        stripCodeThemeBars(clone);
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

    function getPreFromSelection() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        let node = sel.anchorNode;
        if (node && node.nodeType === 3) node = node.parentElement;
        const pre = node && node.closest ? node.closest('pre') : null;
        if (!pre) return null;
        if (pre.querySelector('code.language-chart')) return null;
        const surface = getActiveEditSurface();
        if (surface && !surface.contains(pre)) return null;
        return pre;
    }

    function placeCaretIn(el, atEnd) {
        const sel = window.getSelection();
        if (!sel || !el) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(!atEnd);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function insertParagraphAfter(el) {
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        el.after(p);
        placeCaretIn(p, false);
        return p;
    }

    let _hljsConfigured = false;
    const CODE_THEME_KEY = 'corsiCodeTheme';

    function normalizeCodeTheme(theme) {
        return theme === 'light' ? 'light' : 'dark';
    }

    function getDefaultCodeTheme() {
        try { return normalizeCodeTheme(localStorage.getItem(CODE_THEME_KEY)); }
        catch (_) { return 'dark'; }
    }

    function setDefaultCodeTheme(theme) {
        try { localStorage.setItem(CODE_THEME_KEY, normalizeCodeTheme(theme)); }
        catch (_) { /* ignore */ }
    }

    function applyCodeTheme(pre, theme) {
        if (!pre) return;
        const t = normalizeCodeTheme(theme);
        pre.classList.remove('code-theme-dark', 'code-theme-light');
        pre.classList.add(t === 'light' ? 'code-theme-light' : 'code-theme-dark');
        pre.setAttribute('data-code-theme', t);
    }

    function getPreCodeTheme(pre) {
        if (!pre) return getDefaultCodeTheme();
        const attr = pre.getAttribute('data-code-theme');
        return attr ? normalizeCodeTheme(attr) : getDefaultCodeTheme();
    }

    function applyCodeThemesIn(rootEl) {
        if (!rootEl) return;
        rootEl.querySelectorAll('pre').forEach((pre) => {
            if (pre.closest('.chart-edit-block')) return;
            const code = pre.querySelector(':scope > code');
            if (code && isChartCode(code)) return;
            applyCodeTheme(pre, getPreCodeTheme(pre));
        });
    }

    function stripCodeThemeBars(rootEl) {
        if (!rootEl) return;
        rootEl.querySelectorAll('.code-block-theme-bar').forEach((bar) => bar.remove());
    }

    function isEditableCodePre(pre) {
        if (!pre || pre.closest('.chart-edit-block')) return false;
        if (!pre.closest('.inline-wysiwyg, .wysiwyg-surface, #edWysiwyg')) return false;
        const code = pre.querySelector(':scope > code');
        return !(code && isChartCode(code));
    }

    function syncCodeThemeBar(bar, pre) {
        if (!bar || !pre) return;
        const t = getPreCodeTheme(pre);
        bar.querySelectorAll('[data-theme]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.getAttribute('data-theme') === t);
        });
    }

    function wireCodeThemeBar(bar, pre) {
        if (!bar || bar.dataset.wired) return;
        bar.dataset.wired = '1';
        bar.querySelectorAll('[data-theme]').forEach((btn) => {
            btn.addEventListener('mousedown', (e) => e.preventDefault());
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                setCodeTheme(btn.getAttribute('data-theme'), { pre });
                syncCodeThemeBar(bar, pre);
            });
        });
    }

    function ensureCodeThemeBar(pre) {
        if (!isEditableCodePre(pre)) return null;
        let bar = pre.previousElementSibling;
        if (!bar || !bar.classList.contains('code-block-theme-bar')) {
            bar = document.createElement('div');
            bar.className = 'code-block-theme-bar';
            bar.setAttribute('role', 'toolbar');
            bar.setAttribute('aria-label', 'Tema blocco codice');
            bar.innerHTML = `
                <button type="button" data-theme="dark" title="Tema codice scuro">◐ Scuro</button>
                <button type="button" data-theme="light" title="Tema codice chiaro">◑ Chiaro</button>
            `;
            pre.before(bar);
            wireCodeThemeBar(bar, pre);
        }
        syncCodeThemeBar(bar, pre);
        return bar;
    }

    function hideAllCodeThemeBars() {
        document.querySelectorAll('.code-block-theme-bar').forEach((bar) => {
            bar.classList.remove('is-visible');
        });
    }

    function showCodeThemeBarForPre(pre) {
        if (!isEditableCodePre(pre)) {
            hideAllCodeThemeBars();
            return;
        }
        hideAllCodeThemeBars();
        const bar = ensureCodeThemeBar(pre);
        if (bar) bar.classList.add('is-visible');
    }

    function updateCodeThemeBarFromSelection() {
        const pre = getPreFromSelection();
        if (pre) showCodeThemeBarForPre(pre);
        else hideAllCodeThemeBars();
    }

    function removeCodeThemeBar(pre) {
        const bar = pre && pre.previousElementSibling;
        if (bar && bar.classList.contains('code-block-theme-bar')) bar.remove();
    }

    function setCodeTheme(theme, { pre } = {}) {
        const t = normalizeCodeTheme(theme);
        setDefaultCodeTheme(t);
        const target = pre || getPreFromSelection();
        if (target) {
            applyCodeTheme(target, t);
            const code = target.querySelector(':scope > code');
            if (code && !isChartCode(code)) highlightOneCode(code, true);
            const bar = target.previousElementSibling;
            if (bar && bar.classList.contains('code-block-theme-bar')) syncCodeThemeBar(bar, target);
        }
    }

    function codeHighlightReady() {
        if (typeof hljs === 'undefined' || !hljs || typeof hljs.highlightElement !== 'function') return false;
        if (!_hljsConfigured) {
            try { hljs.configure({ ignoreUnescapedHTML: true }); } catch (_) { /* ignore */ }
            _hljsConfigured = true;
        }
        return true;
    }

    function isChartCode(code) {
        return !!(code && (code.classList.contains('language-chart') || code.closest('.chart-edit-block')));
    }

    function flattenHighlightedCode(code) {
        if (!code || isChartCode(code)) return;
        const lang = [...code.classList].find((c) => c.startsWith('language-') && c !== 'language-chart');
        const text = code.textContent;
        code.className = lang || '';
        code.removeAttribute('data-highlighted');
        code.textContent = text;
    }

    function caretTextOffset(root) {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount || !root) return 0;
        const range = sel.getRangeAt(0);
        if (!root.contains(range.startContainer) && root !== range.startContainer) return 0;
        const pre = document.createRange();
        pre.selectNodeContents(root);
        try { pre.setEnd(range.startContainer, range.startOffset); } catch (_) { return 0; }
        return pre.toString().length;
    }

    function setCaretTextOffset(root, offset) {
        if (!root) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        let node;
        let count = 0;
        const sel = window.getSelection();
        while ((node = walker.nextNode())) {
            const len = node.textContent.length;
            if (count + len >= offset) {
                const r = document.createRange();
                r.setStart(node, Math.max(0, offset - count));
                r.collapse(true);
                sel.removeAllRanges();
                sel.addRange(r);
                return;
            }
            count += len;
        }
        placeCaretIn(root, true);
    }

    function highlightOneCode(code, keepCaret) {
        if (!code || isChartCode(code)) return;
        const text = code.textContent || '';
        if (!text.length) return;
        if (!codeHighlightReady()) return;
        const caret = keepCaret ? caretTextOffset(code) : null;
        flattenHighlightedCode(code);
        const langClass = [...code.classList].find((c) => c.startsWith('language-') && c !== 'language-chart');
        const lang = langClass ? langClass.slice('language-'.length) : '';
        try {
            let result;
            if (lang && hljs.getLanguage && hljs.getLanguage(lang)) {
                result = hljs.highlight(text, { language: lang });
            } else {
                result = hljs.highlightAuto(text);
            }
            code.innerHTML = result.value;
            code.className = 'hljs' + (result.language ? ' language-' + result.language : '');
            code.setAttribute('data-highlighted', 'yes');
        } catch (_) {
            code.classList.add('hljs');
        }
        if (keepCaret && caret != null) setCaretTextOffset(code, caret);
    }

    function highlightCodeIn(rootEl) {
        if (!rootEl) return;
        stripCodeThemeBars(rootEl);
        applyCodeThemesIn(rootEl);
        if (!codeHighlightReady()) return;
        const codes = [];
        rootEl.querySelectorAll('pre').forEach((pre) => {
            if (pre.closest('.chart-edit-block')) return;
            let code = pre.querySelector(':scope > code');
            if (code && isChartCode(code)) return;
            if (!code) {
                code = document.createElement('code');
                code.textContent = pre.textContent;
                pre.textContent = '';
                pre.appendChild(code);
            }
            code.spellcheck = false;
            codes.push(code);
        });
        const active = document.activeElement;
        codes.forEach((code) => {
            const focused = !!(active && (code === active || code.contains(active)
                || (code.parentElement && code.parentElement.contains(active))));
            highlightOneCode(code, focused);
        });
    }

    function scheduleCodeHighlight(code) {
        if (!code || isChartCode(code)) return;
        clearTimeout(scheduleCodeHighlight._timer);
        scheduleCodeHighlight._timer = setTimeout(() => highlightOneCode(code, true), 40);
    }

    function ensureCodeHighlighting() {
        const root = document.getElementById('contentRoot');
        if (!root || root.dataset.codeHlWired) return;
        root.dataset.codeHlWired = '1';
        const runForEvent = (e) => {
            const pre = e.target.closest && e.target.closest('pre');
            if (!pre || pre.closest('.chart-edit-block')) return;
            const code = pre.querySelector(':scope > code') || pre;
            if (isChartCode(code)) return;
            scheduleCodeHighlight(code);
        };
        root.addEventListener('input', runForEvent);
        root.addEventListener('keyup', runForEvent);
        root.addEventListener('compositionend', runForEvent);
        if (IS_MANAGE_PAGE) {
            root.addEventListener('focusin', () => {
                updateCodeThemeBarFromSelection();
            });
            root.addEventListener('focusout', () => {
                requestAnimationFrame(() => {
                    if (!getPreFromSelection()) hideAllCodeThemeBars();
                });
            });
        }
        root.addEventListener('blur', (e) => {
            const pre = e.target.closest && e.target.closest('pre');
            if (!pre || pre.closest('.chart-edit-block')) return;
            const code = pre.querySelector(':scope > code');
            if (code && !isChartCode(code)) highlightOneCode(code, false);
        }, true);
    }

    function insertCodeBlock() {
        const surface = getActiveEditSurface();
        if (surface) surface.focus();
        const existing = getPreFromSelection();
        if (existing) {
            placeCaretIn(existing.querySelector('code') || existing, true);
            showCodeThemeBarForPre(existing);
            setEditorMsg('Sei già nel blocco codice. Invio su riga vuota in fondo per uscirne.');
            return;
        }
        const sel = window.getSelection();
        let selected = '';
        let range = null;
        if (sel && sel.rangeCount) {
            range = sel.getRangeAt(0);
            if (surface && surface.contains(range.commonAncestorContainer) && !sel.isCollapsed) {
                selected = sel.toString();
            }
        }
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.spellcheck = false;
        code.textContent = selected || '';
        pre.appendChild(code);
        applyCodeTheme(pre, getDefaultCodeTheme());
        const after = document.createElement('p');
        after.innerHTML = '<br>';
        if (range && surface && surface.contains(range.commonAncestorContainer)) {
            range.deleteContents();
            range.insertNode(after);
            range.insertNode(pre);
        } else if (surface) {
            surface.appendChild(pre);
            surface.appendChild(after);
        }
        placeCaretIn(code, true);
        highlightOneCode(code, true);
        showCodeThemeBarForPre(pre);
        setEditorMsg('Blocco codice: scrivi liberamente. Invio su riga vuota in fondo per tornare al testo.');
    }

    function convertCodeBlockToPlainText() {
        const surface = getActiveEditSurface();
        if (surface) surface.focus();
        const pre = getPreFromSelection() || (surface && surface.querySelector('pre'));
        if (!pre) {
            document.execCommand('formatBlock', false, 'p');
            setEditorMsg('Formato riportato a testo normale.');
            hideAllCodeThemeBars();
            return;
        }
        removeCodeThemeBar(pre);
        const codeEl = pre.querySelector('code');
        if (codeEl) flattenHighlightedCode(codeEl);
        const text = String((codeEl || pre).textContent || '').replace(/\n+$/, '');
        const frag = document.createDocumentFragment();
        const lines = text.split('\n');
        (lines.length ? lines : ['']).forEach((line) => {
            const p = document.createElement('p');
            if (line) p.textContent = line;
            else p.innerHTML = '<br>';
            frag.appendChild(p);
        });
        const last = frag.lastChild;
        pre.replaceWith(frag);
        hideAllCodeThemeBars();
        if (last) placeCaretIn(last, true);
        setEditorMsg('Blocco codice convertito in testo normale.');
    }

    function caretAtEndOf(el) {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount || !el) return false;
        const range = sel.getRangeAt(0).cloneRange();
        range.selectNodeContents(el);
        range.setStart(sel.focusNode, sel.focusOffset);
        return String(range.toString() || '').replace(/\n+$/, '') === '';
    }

    function ensureCodeBlockExit() {
        const root = document.getElementById('contentRoot');
        if (!root || root.dataset.codeExitWired) return;
        root.dataset.codeExitWired = '1';
        root.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.shiftKey) return;
            const pre = getPreFromSelection();
            if (!pre) return;
            if (!caretAtEndOf(pre)) return;
            const text = String(pre.innerText || '');
            const lastLineEmpty = text === '' || /\n[ \t]*$/.test(text);
            if (!lastLineEmpty || !text.trim()) return;
            e.preventDefault();
            const code = pre.querySelector('code') || pre;
            code.textContent = text.replace(/\n[ \t]*$/, '');
            insertParagraphAfter(pre);
        });
    }

    function getCurrentEditBlock() {
        const host = colorPickerState.capture && colorPickerState.capture.host;
        if (host && host.hasAttribute && host.hasAttribute('data-edit-title')) return host;
        const surface = host || getActiveEditSurface();
        const sel = window.getSelection();
        let node = sel && sel.rangeCount ? sel.anchorNode : null;
        if (!node && colorPickerState.capture && colorPickerState.capture.range) {
            node = colorPickerState.capture.range.startContainer;
        }
        if (!node) return null;
        if (node.nodeType === 3) node = node.parentElement;
        if (!node || !surface || !surface.contains(node)) return null;
        const block = node.closest('p, pre, h1, h2, h3, h4, h5, h6, li, blockquote, div.corsi-bg-block');
        if (!block || !surface.contains(block) || block === surface) return null;
        return block;
    }

    const THEME_BASE_COLORS = [
        '#FFFFFF', '#000000', '#EEECE1', '#1F4E79', '#5B9BD5',
        '#ED7D31', '#A5A5A5', '#FFC000', '#4472C4', '#70AD47',
    ];
    const STANDARD_COLORS = [
        '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050',
        '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0',
    ];
    const colorPickerState = {
        kind: 'fg',
        hc: false,
        fg: '#FF0000',
        bg: '#FF0000',
        chartLast: '#FF0000',
        chartEl: null,
        capture: null,
        gradOpen: false,
    };

    function parseHexColor(hex) {
        let h = String(hex || '').replace('#', '').trim();
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
        };
    }

    function toHexColor(r, g, b) {
        const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
        return '#' + c(r) + c(g) + c(b);
    }

    function mixHex(a, b, t) {
        const A = parseHexColor(a) || { r: 0, g: 0, b: 0 };
        const B = parseHexColor(b) || { r: 255, g: 255, b: 255 };
        return toHexColor(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
    }

    function themeShades(base) {
        const b = String(base).toUpperCase();
        if (b === '#FFFFFF') return ['#FFFFFF', '#F2F2F2', '#D8D8D8', '#BFBFBF', '#A5A5A5', '#7F7F7F'];
        if (b === '#000000') return ['#000000', '#7F7F7F', '#595959', '#3F3F3F', '#262626', '#0C0C0C'];
        return [
            base,
            mixHex(base, '#FFFFFF', 0.8),
            mixHex(base, '#FFFFFF', 0.6),
            mixHex(base, '#FFFFFF', 0.4),
            mixHex(base, '#000000', 0.25),
            mixHex(base, '#000000', 0.5),
        ];
    }

    function themeGridColors() {
        const cols = THEME_BASE_COLORS.map(themeShades);
        const out = [];
        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < cols.length; c++) out.push(cols[c][r]);
        }
        return out;
    }

    function relativeLuminance(hex) {
        const rgb = parseHexColor(hex);
        if (!rgb) return 0;
        const lin = (n) => {
            const c = n / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
    }

    function contrastRatio(a, b) {
        const l1 = relativeLuminance(a);
        const l2 = relativeLuminance(b);
        const hi = Math.max(l1, l2);
        const lo = Math.min(l1, l2);
        return (hi + 0.05) / (lo + 0.05);
    }

    function swatchPassesHc(hex, kind) {
        if (kind === 'bg') return contrastRatio(hex, '#313131') >= 4.5;
        return contrastRatio(hex, '#FFFFFF') >= 4.5;
    }

    function gradientVariations(hex) {
        const mid = hex || '#5B9BD5';
        const light = mixHex(mid, '#FFFFFF', 0.72);
        const dark = mixHex(mid, '#000000', 0.4);
        return [
            { css: `linear-gradient(90deg, ${light}, ${mid})`, title: 'Orizzontale chiara' },
            { css: `linear-gradient(90deg, ${mid}, ${light})`, title: 'Orizzontale inversa' },
            { css: `linear-gradient(180deg, ${light}, ${mid})`, title: 'Verticale chiara' },
            { css: `linear-gradient(180deg, ${mid}, ${light})`, title: 'Verticale inversa' },
            { css: `linear-gradient(135deg, ${light}, ${mid})`, title: 'Diagonale' },
            { css: `linear-gradient(45deg, ${light}, ${mid})`, title: 'Diagonale inversa' },
            { css: `linear-gradient(90deg, ${mid}, ${dark})`, title: 'Orizzontale scura' },
            { css: `linear-gradient(180deg, ${mid}, ${dark})`, title: 'Verticale scura' },
            { css: `radial-gradient(circle at center, ${light}, ${mid})`, title: 'Dal centro' },
            { css: `radial-gradient(circle at center, ${mid}, ${dark})`, title: 'Dal centro scura' },
            { css: `linear-gradient(90deg, ${light}, ${mid}, ${dark})`, title: 'Tre colori orizzontale' },
            { css: `linear-gradient(180deg, ${light}, ${mid}, ${dark})`, title: 'Tre colori verticale' },
        ];
    }

    function currentPickerColor() {
        if (colorPickerState.chartEl) {
            const input = colorPickerState.chartEl.querySelector('.chart-cat-color, .chart-series-color');
            return normalizeHexColor(input && input.value, colorPickerState.chartLast || '#FF0000');
        }
        return colorPickerState.kind === 'bg' ? colorPickerState.bg : colorPickerState.fg;
    }

    function syncToolbarColorBars() {
        const fgBar = document.getElementById('edColorBar');
        const bgBar = document.getElementById('edBgBar');
        if (fgBar) fgBar.style.background = colorPickerState.fg;
        if (bgBar) bgBar.style.background = colorPickerState.bg;
    }

    function captureEditorSelection() {
        const sel = window.getSelection();
        const active = document.activeElement;
        let host = null;
        let range = null;
        if (sel && sel.rangeCount) {
            const r = sel.getRangeAt(0);
            let node = r.commonAncestorContainer;
            if (node.nodeType === 3) node = node.parentElement;
            if (node && node.closest) {
                host = node.closest('[data-edit-title], [data-edit-body], #edWysiwyg, .wysiwyg-surface');
                if (host) range = r.cloneRange();
            }
        }
        if (!host && active && active.closest) {
            host = active.closest('[data-edit-title], [data-edit-body], #edWysiwyg, .wysiwyg-surface');
        }
        if (!host) {
            const art = document.querySelector('.inline-doc.is-active[data-edit-id]')
                || document.querySelector('[data-edit-id]');
            host = art ? directEditChild(art, 'data-edit-body') : document.getElementById('edWysiwyg');
        }
        if (!host) return null;
        return { host, range };
    }

    function saveColorSelection() {
        const cap = captureEditorSelection();
        if (cap) colorPickerState.capture = cap;
    }

    function restoreColorSelection() {
        const cap = colorPickerState.capture;
        if (!cap || !cap.host) return false;
        cap.host.focus();
        const sel = window.getSelection();
        sel.removeAllRanges();
        if (!cap.range) return true;
        try {
            sel.addRange(cap.range);
            return true;
        } catch (_) {
            return false;
        }
    }

    function prepareColorCommand() {
        restoreColorSelection();
        const host = colorPickerState.capture && colorPickerState.capture.host;
        if (host) host.focus();
        restoreColorSelection();
        try { document.execCommand('styleWithCSS', false, true); } catch (_) { /* ignore */ }
        return colorPickerState.capture;
    }

    function expandRangeToWord(range) {
        if (!range.collapsed) return range;
        const node = range.startContainer;
        if (node.nodeType !== 3) return range;
        const text = node.textContent || '';
        let start = range.startOffset;
        let end = range.endOffset;
        while (start > 0 && /\S/.test(text[start - 1])) start -= 1;
        while (end < text.length && /\S/.test(text[end])) end += 1;
        if (end > start) {
            range.setStart(node, start);
            range.setEnd(node, end);
        }
        return range;
    }

    function unwrapTextFillsInSelection() {
        const host = (colorPickerState.capture && colorPickerState.capture.host) || getActiveEditSurface();
        const sel = window.getSelection();
        if (!host || !sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        host.querySelectorAll('span.corsi-text-fill').forEach((el) => {
            if (!range.intersectsNode(el)) return;
            el.classList.remove('corsi-text-fill');
            el.style.backgroundImage = '';
            el.style.webkitBackgroundClip = '';
            el.style.backgroundClip = '';
            el.style.webkitTextFillColor = '';
            if (el.style.color === 'transparent') el.style.color = '';
        });
    }

    function applyBlockFill(el, color, gradientCss) {
        if (!el) return;
        if (gradientCss) {
            el.style.backgroundImage = gradientCss;
            if (color) el.style.backgroundColor = color;
            el.classList.add('corsi-bg-block');
            return;
        }
        el.style.backgroundImage = '';
        if (!color) {
            el.style.backgroundColor = '';
            el.classList.remove('corsi-bg-block');
            if (!(el.getAttribute('style') || '').trim()) el.removeAttribute('style');
            return;
        }
        el.style.backgroundColor = color;
        el.classList.add('corsi-bg-block');
    }

    function applyBlockBackground(color, gradientCss) {
        prepareColorCommand();
        let block = getCurrentEditBlock();
        if (!block) {
            const host = colorPickerState.capture && colorPickerState.capture.host;
            if (host && host.hasAttribute('data-edit-title')) block = host;
            else if (host) {
                document.execCommand('formatBlock', false, 'p');
                block = getCurrentEditBlock() || host;
            }
        }
        if (!block) return;
        applyBlockFill(block, color, gradientCss);
    }

    function applyForeColorFallback(hex) {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0).cloneRange();
        if (range.collapsed) {
            const span = document.createElement('span');
            span.style.color = hex;
            const zw = document.createTextNode('\u200b');
            span.appendChild(zw);
            range.insertNode(span);
            const next = document.createRange();
            next.setStart(zw, 1);
            next.collapse(true);
            sel.removeAllRanges();
            sel.addRange(next);
            if (colorPickerState.capture) colorPickerState.capture.range = next.cloneRange();
            return;
        }
        const span = document.createElement('span');
        span.style.color = hex;
        try {
            range.surroundContents(span);
        } catch (_) {
            span.appendChild(range.extractContents());
            range.insertNode(span);
        }
    }

    function applyForeColor(color) {
        prepareColorCommand();
        unwrapTextFillsInSelection();
        const hex = color || '#313131';
        const ok = document.execCommand('foreColor', false, hex);
        if (!ok) applyForeColorFallback(hex);
    }

    function applyTextGradient(css) {
        prepareColorCommand();
        unwrapTextFillsInSelection();
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = expandRangeToWord(sel.getRangeAt(0).cloneRange());
        if (range.collapsed) {
            setEditorMsg('Seleziona il testo a cui applicare la sfumatura.');
            return;
        }
        sel.removeAllRanges();
        sel.addRange(range);
        const span = document.createElement('span');
        span.className = 'corsi-text-fill';
        span.style.backgroundImage = css;
        span.style.webkitBackgroundClip = 'text';
        span.style.backgroundClip = 'text';
        span.style.color = 'transparent';
        span.style.webkitTextFillColor = 'transparent';
        try {
            range.surroundContents(span);
        } catch (_) {
            span.appendChild(range.extractContents());
            range.insertNode(span);
        }
        const kept = document.createRange();
        kept.selectNodeContents(span);
        if (colorPickerState.capture) colorPickerState.capture.range = kept;
    }

    function chartSplitIndex(split) {
        if (!split) return 0;
        if (split.querySelector('.chart-cat-color')) {
            const cells = [...document.querySelectorAll('#chartDataTable thead .chart-color-split')];
            const i = cells.indexOf(split);
            return i < 0 ? 0 : i;
        }
        const rows = [...document.querySelectorAll('#chartDataTable tbody tr')];
        const i = rows.indexOf(split.closest('tr'));
        return i < 0 ? 0 : i;
    }

    function applyChartTargetColor(split, color, gradientCss) {
        if (!split) split = colorPickerState.chartEl;
        if (!split) return;
        const hex = normalizeHexColor(color, colorPickerState.chartLast || '#FF0000');
        const input = split.querySelector('.chart-cat-color, .chart-series-color');
        const swatch = split.querySelector('.chart-color-swatch-btn');
        if (input) {
            input.value = hex;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (swatch) {
            swatch.style.background = gradientCss || hex;
            swatch.style.backgroundImage = gradientCss || '';
        }
        colorPickerState.chartLast = hex;
    }

    function applyPickerSolid(color) {
        if (colorPickerState.chartEl) {
            applyChartTargetColor(colorPickerState.chartEl, color);
            closeColorPicker();
            return;
        }
        if (colorPickerState.kind === 'bg') {
            colorPickerState.bg = color;
            applyBlockBackground(color);
        } else {
            colorPickerState.fg = color;
            applyForeColor(color);
        }
        syncToolbarColorBars();
        closeColorPicker();
    }

    function applyPickerAuto() {
        if (colorPickerState.chartEl) {
            applyChartTargetColor(colorPickerState.chartEl, defaultSeriesColor(chartSplitIndex(colorPickerState.chartEl)));
            closeColorPicker();
            return;
        }
        if (colorPickerState.kind === 'bg') {
            applyBlockBackground('');
        } else {
            colorPickerState.fg = '#313131';
            applyForeColor('#313131');
        }
        syncToolbarColorBars();
        closeColorPicker();
    }

    function applyPickerGradient(css) {
        if (colorPickerState.chartEl) {
            const m = String(css || '').match(/#[0-9a-fA-F]{3,8}/g);
            const hex = m && m.length
                ? normalizeHexColor(m[Math.min(1, m.length - 1)], currentPickerColor())
                : currentPickerColor();
            applyChartTargetColor(colorPickerState.chartEl, hex, css);
            closeColorPicker();
            return;
        }
        if (colorPickerState.kind === 'bg') {
            applyBlockBackground(currentPickerColor(), css);
        } else {
            applyTextGradient(css);
        }
        closeColorPicker();
    }

    function clearPickerGradient() {
        if (colorPickerState.chartEl) {
            applyChartTargetColor(colorPickerState.chartEl, currentPickerColor(), '');
            closeColorPicker();
            return;
        }
        restoreColorSelection();
        if (colorPickerState.kind === 'bg') {
            const block = getCurrentEditBlock();
            if (block) block.style.backgroundImage = '';
        } else {
            unwrapTextFillsInSelection();
            applyForeColor(colorPickerState.fg);
        }
        closeColorPicker();
    }

    function swatchButtonHtml(hex, extraClass) {
        const hc = swatchPassesHc(hex, colorPickerState.kind) ? '1' : '0';
        const light = relativeLuminance(hex) > 0.85;
        return `<button type="button" class="corsi-swatch${light ? ' is-light' : ''}${extraClass ? ' ' + extraClass : ''}" data-color="${escapeHtml(hex)}" data-hc-ok="${hc}" style="background:${escapeHtml(hex)}" title="${escapeHtml(hex)}" aria-label="${escapeHtml(hex)}"></button>`;
    }

    function renderColorSwatches() {
        const root = document.getElementById('corsiColorPopover');
        if (!root) return;
        const theme = document.getElementById('corsiThemeGrid');
        const standard = document.getElementById('corsiStdGrid');
        if (theme) theme.innerHTML = themeGridColors().map((hex) => swatchButtonHtml(hex)).join('');
        if (standard) standard.innerHTML = STANDARD_COLORS.map((hex) => swatchButtonHtml(hex)).join('');
        root.classList.toggle('is-hc', !!colorPickerState.hc);
        const autoSwatch = root.querySelector('[data-auto] .corsi-swatch');
        if (autoSwatch) {
            if (colorPickerState.chartEl) {
                const hex = defaultSeriesColor(chartSplitIndex(colorPickerState.chartEl));
                autoSwatch.style.background = hex;
                autoSwatch.classList.toggle('is-light', relativeLuminance(hex) > 0.85);
            } else {
                autoSwatch.style.background = colorPickerState.kind === 'bg' ? '#ffffff' : '#000000';
                autoSwatch.classList.toggle('is-light', colorPickerState.kind === 'bg');
            }
        }
        renderGradientVariations();
    }

    function renderGradientVariations() {
        const grid = document.getElementById('corsiGradGrid');
        if (!grid) return;
        grid.innerHTML = gradientVariations(currentPickerColor()).map((g) => `
            <button type="button" class="corsi-grad-swatch" data-grad="${escapeHtml(g.css)}" title="${escapeHtml(g.title)}" aria-label="${escapeHtml(g.title)}" style="background-image:${escapeHtml(g.css)}"></button>
        `).join('');
    }

    function placeColorPicker(anchor) {
        const pop = document.getElementById('corsiColorPopover');
        if (!pop || !anchor) return;
        const r = anchor.getBoundingClientRect();
        const width = 272;
        let left = r.left;
        if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
        let top = r.bottom + 4;
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';
        pop.hidden = false;
        requestAnimationFrame(() => {
            const pr = pop.getBoundingClientRect();
            if (pr.bottom > window.innerHeight - 8) {
                pop.style.top = Math.max(8, r.top - pr.height - 4) + 'px';
            }
        });
        placeGradientPanel();
    }

    function placeGradientPanel() {
        const pop = document.getElementById('corsiColorPopover');
        const panel = document.getElementById('corsiGradPanel');
        const item = document.getElementById('corsiGradMenu');
        if (!pop || !panel || panel.hidden || !item) return;
        const pr = pop.getBoundingClientRect();
        const ir = item.getBoundingClientRect();
        const width = 232;
        const height = panel.offsetHeight || 220;
        let top = ir.top;
        if (top + height > window.innerHeight - 8) {
            top = Math.max(8, window.innerHeight - height - 8);
        }
        panel.style.top = top + 'px';
        if (window.innerWidth - pr.right > width + 12) {
            panel.style.left = (pr.right + 4) + 'px';
        } else {
            panel.style.left = Math.max(8, pr.left - width - 4) + 'px';
        }
    }

    function setGradientPanelOpen(open) {
        const panel = document.getElementById('corsiGradPanel');
        const item = document.getElementById('corsiGradMenu');
        colorPickerState.gradOpen = !!open;
        if (panel) panel.hidden = !open;
        if (item) item.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            placeGradientPanel();
            requestAnimationFrame(placeGradientPanel);
        }
    }

    function closeColorPicker() {
        const pop = document.getElementById('corsiColorPopover');
        const dialog = document.getElementById('corsiGradDialog');
        if (pop) pop.hidden = true;
        setGradientPanelOpen(false);
        if (dialog) dialog.hidden = true;
        colorPickerState.chartEl = null;
    }

    function applyLastUsedColor(kind) {
        saveColorSelection();
        if (kind === 'bg') applyBlockBackground(colorPickerState.bg);
        else applyForeColor(colorPickerState.fg);
        closeColorPicker();
    }

    function openColorPicker(kind, anchor, opts) {
        opts = opts || {};
        ensureColorPicker();
        const nextKind = kind === 'bg' ? 'bg' : 'fg';
        const chartEl = opts.chartEl || null;
        const pop = document.getElementById('corsiColorPopover');
        if (pop && !pop.hidden && colorPickerState.kind === nextKind && colorPickerState.chartEl === chartEl) {
            closeColorPicker();
            return;
        }
        if (!chartEl) saveColorSelection();
        colorPickerState.kind = nextKind;
        colorPickerState.chartEl = chartEl;
        const extra = document.getElementById('corsiColorExtra');
        if (extra) extra.value = currentPickerColor();
        renderColorSwatches();
        placeColorPicker(anchor && anchor.closest ? (anchor.closest('.tb-color-split') || anchor) : anchor);
    }

    function ensureColorPicker() {
        if (document.getElementById('corsiColorPopover')) return;
        const wrap = document.createElement('div');
        wrap.id = 'corsiColorRoot';
        wrap.innerHTML = `
            <div class="corsi-color-popover" id="corsiColorPopover" hidden role="dialog" aria-label="Selezione colore">
                <label class="corsi-color-hc">
                    <span>Solo contrasto elevato</span>
                    <span class="corsi-switch">
                        <input type="checkbox" class="corsi-color-hc-input" id="corsiColorHc">
                        <span class="corsi-switch-ui" aria-hidden="true"></span>
                    </span>
                </label>
                <div class="corsi-color-block">
                    <div class="corsi-color-label">Automatico</div>
                    <button type="button" class="corsi-auto-row" data-auto>
                        <span class="corsi-swatch is-light" aria-hidden="true"></span>
                        <span>Automatico</span>
                    </button>
                </div>
                <div class="corsi-color-block">
                    <div class="corsi-color-label">Colori tema</div>
                    <div class="corsi-theme-grid" id="corsiThemeGrid"></div>
                </div>
                <div class="corsi-color-block">
                    <div class="corsi-color-label">Colori standard</div>
                    <div class="corsi-std-grid" id="corsiStdGrid"></div>
                </div>
                <button type="button" class="corsi-color-row" data-more-colors>
                    <span class="corsi-color-row-ico" aria-hidden="true"></span>
                    Altri colori…
                </button>
                <button type="button" class="corsi-color-row corsi-color-row-sub" id="corsiGradMenu" data-grad-menu aria-expanded="false">
                    Sfumature
                    <span class="corsi-color-chevron" aria-hidden="true">›</span>
                </button>
                <input type="color" id="corsiColorExtra" class="tb-fg-picker" value="#ff0000" tabindex="-1" aria-hidden="true">
            </div>
            <div class="corsi-color-grad-panel" id="corsiGradPanel" hidden>
                <button type="button" class="corsi-no-grad" data-no-grad>
                    <span class="corsi-no-grad-swatch" aria-hidden="true"></span>
                    Nessuna sfumatura
                </button>
                <div class="corsi-color-label">Variazioni</div>
                <div class="corsi-grad-grid" id="corsiGradGrid"></div>
                <button type="button" class="corsi-color-row" data-more-grad>
                    Altre sfumature…
                </button>
            </div>
            <div class="corsi-grad-dialog" id="corsiGradDialog" hidden>
                <p class="corsi-grad-dialog-title">Altre sfumature</p>
                <label>Colore 1 <input type="color" id="corsiGradC1" value="#ffffff"></label>
                <label>Colore 2 <input type="color" id="corsiGradC2" value="#5B9BD5"></label>
                <label>Direzione
                    <select id="corsiGradDir">
                        <option value="90">Orizzontale</option>
                        <option value="180">Verticale</option>
                        <option value="135">Diagonale</option>
                        <option value="radial">Radiale</option>
                    </select>
                </label>
                <div class="corsi-grad-dialog-actions">
                    <button type="button" data-grad-apply>Applica</button>
                    <button type="button" data-grad-cancel>Annulla</button>
                </div>
            </div>
        `;
        document.body.appendChild(wrap);

        wrap.addEventListener('mousedown', (e) => {
            if (!e.target.closest('input, select, textarea')) e.preventDefault();
        });

        wrap.addEventListener('click', (e) => {
            const auto = e.target.closest('[data-auto]');
            if (auto) { applyPickerAuto(); return; }
            const swatch = e.target.closest('[data-color]');
            if (swatch) { applyPickerSolid(swatch.getAttribute('data-color')); return; }
            if (e.target.closest('[data-more-colors]')) {
                const extra = document.getElementById('corsiColorExtra');
                if (!extra) return;
                extra.value = currentPickerColor();
                try {
                    if (typeof extra.showPicker === 'function') extra.showPicker();
                    else extra.click();
                } catch (_) {
                    extra.click();
                }
                return;
            }
            if (e.target.closest('[data-grad-menu]')) {
                setGradientPanelOpen(!colorPickerState.gradOpen);
                return;
            }
            const grad = e.target.closest('[data-grad]');
            if (grad) { applyPickerGradient(grad.getAttribute('data-grad')); return; }
            if (e.target.closest('[data-no-grad]')) { clearPickerGradient(); return; }
            if (e.target.closest('[data-more-grad]')) {
                const dialog = document.getElementById('corsiGradDialog');
                const c1 = document.getElementById('corsiGradC1');
                const c2 = document.getElementById('corsiGradC2');
                if (c1) c1.value = mixHex(currentPickerColor(), '#FFFFFF', 0.7);
                if (c2) c2.value = currentPickerColor();
                if (dialog) dialog.hidden = false;
                setGradientPanelOpen(false);
                return;
            }
            if (e.target.closest('[data-grad-cancel]')) {
                const dialog = document.getElementById('corsiGradDialog');
                if (dialog) dialog.hidden = true;
                return;
            }
            if (e.target.closest('[data-grad-apply]')) {
                const c1 = document.getElementById('corsiGradC1')?.value || '#ffffff';
                const c2 = document.getElementById('corsiGradC2')?.value || '#5B9BD5';
                const dir = document.getElementById('corsiGradDir')?.value || '90';
                const css = dir === 'radial'
                    ? `radial-gradient(circle at center, ${c1}, ${c2})`
                    : `linear-gradient(${dir}deg, ${c1}, ${c2})`;
                applyPickerGradient(css);
            }
        });

        wrap.addEventListener('change', (e) => {
            if (e.target.id === 'corsiColorHc') {
                colorPickerState.hc = e.target.checked;
                renderColorSwatches();
                return;
            }
            if (e.target.id === 'corsiColorExtra') applyPickerSolid(e.target.value);
        });

        const gradMenu = wrap.querySelector('#corsiGradMenu');
        const gradPanel = wrap.querySelector('#corsiGradPanel');
        let gradTimer = null;
        const openSoon = () => {
            clearTimeout(gradTimer);
            setGradientPanelOpen(true);
        };
        const closeSoon = () => {
            clearTimeout(gradTimer);
            gradTimer = setTimeout(() => {
                if (!colorPickerState.gradOpen) return;
                const over = wrap.querySelector('#corsiGradMenu:hover, #corsiGradPanel:hover');
                if (!over) setGradientPanelOpen(false);
            }, 180);
        };
        if (gradMenu) {
            gradMenu.addEventListener('mouseenter', openSoon);
            gradMenu.addEventListener('mouseleave', closeSoon);
        }
        if (gradPanel) {
            gradPanel.addEventListener('mouseenter', openSoon);
            gradPanel.addEventListener('mouseleave', closeSoon);
        }

        document.addEventListener('mousedown', (e) => {
            const pop = document.getElementById('corsiColorPopover');
            if (!pop || pop.hidden) return;
            if (wrap.contains(e.target)) return;
            if (e.target.closest('.tb-color-split')) return;
            closeColorPicker();
        });
        window.addEventListener('resize', () => {
            const pop = document.getElementById('corsiColorPopover');
            if (pop && !pop.hidden) closeColorPicker();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeColorPicker();
        });
    }

    function wireToolbar() {
        ensureChartEditDelegation();
        ensureTableResizeDelegation();
        ensureTableToolsVisibilityWatch();
        ensureCodeBlockExit();
        ensureCodeHighlighting();
        const toolbar = document.getElementById('edToolbar');
        if (!toolbar) return;
        syncTableToolsVisibility();
        syncToolbarColorBars();
        const fontSel = document.getElementById('edFont');
        if (fontSel && !fontSel.dataset.wired) {
            fontSel.dataset.wired = '1';
            fontSel.addEventListener('mousedown', () => saveColorSelection());
            fontSel.addEventListener('change', () => {
                applyFontFamily(fontSel.value || '');
            });
        }
        const fileInput = document.getElementById('edImageFile');

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
            if (e.target.closest('select')) {
                saveColorSelection();
                return;
            }
            if (e.target.closest('.tb-color-split')) {
                e.preventDefault();
                saveColorSelection();
                return;
            }
            if (e.target.closest('button, input[type="color"]')) e.preventDefault();
        });

        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-cmd]');
            if (!btn) return;
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            if (cmd === 'foreColor') {
                applyLastUsedColor('fg');
                return;
            }
            if (cmd === 'bgColor') {
                applyLastUsedColor('bg');
                return;
            }
            if (cmd === 'foreColorMenu') {
                openColorPicker('fg', btn);
                return;
            }
            if (cmd === 'bgColorMenu') {
                openColorPicker('bg', btn);
                return;
            }
            const surface = getActiveEditSurface();
            if (surface) surface.focus();
            if (cmd === 'bold' || cmd === 'italic' || cmd === 'underline'
                || cmd === 'insertUnorderedList' || cmd === 'insertOrderedList') {
                document.execCommand(cmd, false, null);
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
            } else if (cmd === 'codeBlock') {
                insertCodeBlock();
            } else if (cmd === 'plainText') {
                convertCodeBlockToPlainText();
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
                goReadOnly(mode === 'create' ? payload.id : existingId);
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
                '<div class="page"><h1 class="page-title">Non trovato</h1><p>Il contenuto richiesto non esiste.</p></div>';
            return;
        }
        await renderDoc(node, { manageMode: false });
    }

    const LIVE_POLL_MS = 20000;
    let _liveTimer = null;
    let _liveSince = null;
    let _liveKnownEditors = new Set();
    let _liveEditorsReady = false;
    let _liveShownKeys = new Set();
    let _liveEntryBannerShown = false;

    function formatColleagueNames(editors) {
        const names = (editors || []).map((e) => e.profileName).filter(Boolean);
        if (!names.length) return '';
        if (names.length === 1) return names[0];
        if (names.length === 2) return names[0] + ' e ' + names[1];
        return names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1];
    }

    function formatTitleList(titles) {
        const list = (titles || []).filter(Boolean);
        if (!list.length) return '';
        if (list.length === 1) return '«' + list[0] + '»';
        if (list.length === 2) return '«' + list[0] + '» e «' + list[1] + '»';
        return list.slice(0, -1).map((t) => '«' + t + '»').join(', ') + ' e «' + list[list.length - 1] + '»';
    }

    function groupRecentSavesByUser(saves) {
        const byUser = new Map();
        (saves || []).forEach((save) => {
            const key = save.userId || save.profileName;
            if (!byUser.has(key)) {
                byUser.set(key, { profileName: save.profileName, titles: [] });
            }
            const title = save.title || save.itemId || 'contenuti';
            const row = byUser.get(key);
            if (!row.titles.includes(title)) row.titles.push(title);
        });
        return [...byUser.values()];
    }

    function updateOnlineEditorsBanner(editorsOnline) {
        const editors = editorsOnline || [];
        let root = document.getElementById('corsiManageOnlineBanner');
        if (!editors.length) {
            if (root) root.hidden = true;
            return;
        }
        if (!root) {
            root = document.createElement('div');
            root.id = 'corsiManageOnlineBanner';
            root.className = 'corsi-manage-online-banner';
            const entry = document.getElementById('corsiManageEntryBanner');
            const alerts = document.getElementById('corsiLiveAlerts');
            const content = document.querySelector('.content.container');
            if (content) {
                if (entry && entry.nextSibling) content.insertBefore(root, entry.nextSibling);
                else if (entry) entry.after(root);
                else if (alerts) content.insertBefore(root, alerts);
                else content.insertBefore(root, content.firstChild);
            }
        }
        const who = formatColleagueNames(editors);
        const n = editors.length;
        const label = n === 1 ? '1 docente' : n + ' docenti';
        root.innerHTML = `
            <div class="corsi-manage-online-banner-body">
                <strong>Colleghi in Gestione contenuti</strong>
                <p>In questo momento ${n === 1 ? 'c\'è' : 'ci sono'} <strong>${label}</strong> oltre a te: ${escapeHtml(who)}.</p>
            </div>
        `;
        root.hidden = false;
    }

    function showManageEntryBanner(editorsOnline, recentSaves) {
        if (_liveEntryBannerShown) return;
        const editors = editorsOnline || [];
        const saveGroups = groupRecentSavesByUser(recentSaves);
        if (!editors.length && !saveGroups.length) return;
        _liveEntryBannerShown = true;

        const items = [];
        if (editors.length) {
            const who = formatColleagueNames(editors);
            const verb = editors.length === 1 ? 'è già' : 'sono già';
            items.push(`${who} ${verb} in Gestione contenuti e potrebbe star modificando i contenuti.`);
        }
        saveGroups.forEach((group) => {
            const where = formatTitleList(group.titles);
            const verb = group.titles.length === 1 ? 'ha salvato di recente in' : 'ha salvato di recente in';
            items.push(`${group.profileName} ${verb} ${where}.`);
        });

        let root = document.getElementById('corsiManageEntryBanner');
        if (!root) {
            root = document.createElement('div');
            root.id = 'corsiManageEntryBanner';
            root.className = 'corsi-manage-entry-banner';
            const alerts = document.getElementById('corsiLiveAlerts');
            const content = document.querySelector('.content.container');
            if (content) {
                if (alerts) content.insertBefore(root, alerts);
                else content.insertBefore(root, content.firstChild);
            }
        }
        root.innerHTML = `
            <div class="corsi-manage-entry-banner-body">
                <strong>Attenzione</strong>
                <ul class="corsi-manage-entry-list">
                    ${items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('')}
                </ul>
                <p class="corsi-manage-entry-banner-hint">Coordina le modifiche con tutti i colleghi elencati o usa «Ricarica» dopo un salvataggio altrui.</p>
            </div>
            <button type="button" class="corsi-live-dismiss" data-entry-dismiss aria-label="Chiudi avviso">×</button>
        `;
        root.hidden = false;
        const dismiss = root.querySelector('[data-entry-dismiss]');
        if (dismiss && !dismiss.dataset.wired) {
            dismiss.dataset.wired = '1';
            dismiss.addEventListener('click', () => { root.hidden = true; });
        }
    }

    function ensureLiveAlertsRoot() {
        let root = document.getElementById('corsiLiveAlerts');
        if (!root) {
            root = document.createElement('div');
            root.id = 'corsiLiveAlerts';
            root.className = 'corsi-live-alerts';
            root.setAttribute('aria-live', 'polite');
            const content = document.querySelector('.content.container');
            if (content) content.insertBefore(root, content.firstChild);
        }
        if (!root.dataset.wired) {
            root.dataset.wired = '1';
            root.addEventListener('click', (e) => {
                const dismiss = e.target.closest && e.target.closest('[data-live-dismiss]');
                if (dismiss) {
                    dismiss.closest('.corsi-live-alert')?.remove();
                    return;
                }
                const reload = e.target.closest && e.target.closest('[data-live-reload]');
                if (reload) reloadEditableContent();
            });
        }
        return root;
    }

    function pushLiveAlert(kind, message, dedupeKey) {
        if (dedupeKey && _liveShownKeys.has(dedupeKey)) return;
        if (dedupeKey) _liveShownKeys.add(dedupeKey);
        const root = ensureLiveAlertsRoot();
        const el = document.createElement('div');
        el.className = 'corsi-live-alert corsi-live-alert-' + kind;
        el.innerHTML = `
            <span class="corsi-live-alert-text">${escapeHtml(message)}</span>
            ${kind === 'save' ? '<button type="button" class="btn-sm" data-live-reload>Ricarica</button>' : ''}
            <button type="button" class="corsi-live-dismiss" data-live-dismiss aria-label="Chiudi avviso">×</button>
        `;
        root.prepend(el);
        while (root.children.length > 15) root.lastElementChild.remove();
    }

    function reconcileLiveEditors(editorsOnline) {
        const online = new Set((editorsOnline || []).map((e) => e.userId));
        for (const id of [..._liveKnownEditors]) {
            if (!online.has(id)) _liveKnownEditors.delete(id);
        }
        const newcomers = [];
        for (const ed of editorsOnline || []) {
            if (_liveKnownEditors.has(ed.userId)) continue;
            _liveKnownEditors.add(ed.userId);
            if (_liveEditorsReady) newcomers.push(ed);
        }
        if (!_liveEditorsReady) {
            _liveEditorsReady = true;
            return;
        }
        if (!newcomers.length) return;
        const names = formatColleagueNames(newcomers);
        const verb = newcomers.length === 1 ? 'è entrato' : 'sono entrati';
        const tickKey = 'presence-batch|' + newcomers.map((e) => e.userId).sort().join(',');
        pushLiveAlert(
            'presence',
            `${names} ${verb} in Gestione contenuti.`,
            tickKey + '|' + Date.now()
        );
    }

    function reportLiveSaves(saves) {
        const list = saves || [];
        if (!list.length) return;
        if (list.length === 1) {
            const save = list[0];
            const title = save.title || save.itemId || 'contenuti';
            pushLiveAlert(
                'save',
                `${save.profileName} ha salvato modifiche in «${title}».`,
                'save|' + save.at + '|' + save.itemId + '|' + save.userId
            );
            return;
        }
        const tickKey = 'save-batch|' + list.map((s) => s.at + '|' + s.itemId).sort().join(';');
        const detail = groups.map((group) => `${group.profileName} in ${formatTitleList(group.titles)}`).join('; ');
        pushLiveAlert(
            'save',
            `Salvataggi: ${detail}.`,
            tickKey + '|' + Date.now()
        );
    }

    async function corsiLiveTick() {
        if (!IS_MANAGE_PAGE || document.hidden) return;
        try {
            await apiJson(API + '/presence', {
                method: 'POST',
                headers: authHeaders(),
                body: '{}',
            });
            const isFirst = !_liveEditorsReady;
            const since = _liveSince || new Date(0).toISOString();
            const data = await apiJson(API + '/live?since=' + encodeURIComponent(since), {
                headers: authHeaders(),
            });
            if (isFirst) {
                const recentSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
                try {
                    const recent = await apiJson(API + '/live?since=' + encodeURIComponent(recentSince), {
                        headers: authHeaders(),
                    });
                    showManageEntryBanner(data.editorsOnline, recent.saves);
                } catch (_) {
                    showManageEntryBanner(data.editorsOnline, []);
                }
            }
            if (data.serverTime) _liveSince = data.serverTime;
            updateOnlineEditorsBanner(data.editorsOnline);
            reconcileLiveEditors(data.editorsOnline);
            reportLiveSaves(data.saves);
        } catch (_) { /* rete momentanea: riprova al tick successivo */ }
    }

    function startCorsiLiveSync() {
        if (!IS_MANAGE_PAGE || _liveTimer) return;
        ensureLiveAlertsRoot();
        _liveSince = new Date().toISOString();
        corsiLiveTick();
        _liveTimer = setInterval(corsiLiveTick, LIVE_POLL_MS);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) corsiLiveTick();
        });
    }

    function stopCorsiLiveSync() {
        if (_liveTimer) {
            clearInterval(_liveTimer);
            _liveTimer = null;
        }
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
            const btnExport = document.getElementById('btnExportMd');
            if (btn) btn.style.display = canEdit ? 'inline' : 'none';
            if (btnStorico) btnStorico.style.display = canEdit ? 'inline' : 'none';
            if (btnExport) btnExport.style.display = canEdit ? 'inline' : 'none';
            if (window.CorsiExport) window.CorsiExport.wireExportMdButton({ show: canEdit });
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
        if (IS_MANAGE_PAGE && canEdit) startCorsiLiveSync();
        if (IS_MANAGE_PAGE) {
            window.addEventListener('resize', syncStickyScrollMargin, { passive: true });
        }
        await loadEditorFontsCatalog();
        ensureEditorFonts();
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
