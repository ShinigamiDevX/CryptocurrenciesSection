(function () {
    const textEl = document.getElementById('ideeText');
    const toolEl = document.getElementById('ideeTool');
    const topicTextEl = document.getElementById('ideeTopicText');
    const countEl = document.getElementById('ideeCount');
    const msgEl = document.getElementById('ideeMsg');
    const listEl = document.getElementById('ideeList');
    const titleEl = document.getElementById('ideeListTitle');
    const archiveBar = document.getElementById('ideeArchiveBar');
    const archiveBtn = document.getElementById('ideeArchiveBtn');
    const archivePanel = document.getElementById('ideeArchive');
    const archiveList = document.getElementById('ideeArchiveList');
    const trashBtn = document.getElementById('ideeTrashBtn');
    const trashPanel = document.getElementById('ideeTrash');
    const trashList = document.getElementById('ideeTrashList');
    const unreadBadge = document.getElementById('ideeUnreadBadge');
    const form = document.getElementById('ideeForm');
    const submitBtn = document.getElementById('ideeSubmit');

    let isSuperadmin = false;

    function logout() {
        if (typeof clearAuth === 'function') clearAuth();
        else localStorage.removeItem('authToken');
        window.location.replace('/login');
    }
    window.logout = logout;

    function showMsg(text, kind) {
        msgEl.textContent = text || '';
        msgEl.className = 'idee-msg' + (kind ? ' ' + kind : '');
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatWhen(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    }

    function updateCount() {
        if (!countEl || !textEl) return;
        const n = (textEl.value || '').length;
        countEl.textContent = n + ' / 4000';
    }

    function setUnreadBadge(n) {
        const c = Number(n) || 0;
        if (!unreadBadge) return;
        if (c > 0) {
            unreadBadge.hidden = false;
            unreadBadge.textContent = c > 99 ? '99+' : String(c);
        } else {
            unreadBadge.hidden = true;
            unreadBadge.textContent = '0';
        }
    }

    function itemHtmlMine(item) {
        const topic = item.topicLabel
            ? '<span class="idee-chip">' + escapeHtml(item.topicLabel) + '</span>'
            : '';
        return '<article class="idee-item">'
            + '<div class="idee-item-head"><strong>Inviata</strong><time>' + escapeHtml(formatWhen(item.createdAt)) + '</time></div>'
            + topic
            + '<p>' + escapeHtml(item.body) + '</p>'
            + '</article>';
    }

    function itemHtmlReceived(item, index) {
        const unread = !item.read;
        const markLabel = unread ? 'Segna come letto' : 'Segna come non letto';
        const topic = item.topicLabel
            ? '<span class="idee-chip">' + escapeHtml(item.topicLabel) + '</span>'
            : '';
        const who = escapeHtml(item.authorLabel)
            + (item.authorEmail ? ' · ' + escapeHtml(item.authorEmail) : '');
        return '<article class="idee-item' + (unread ? ' unread' : '') + '" data-iid="' + escapeHtml(item.id) + '"'
            + (typeof index === 'number' ? ' style="--i:' + index + '"' : '') + '>'
            + '<div class="idee-item-head"><strong>' + who + '</strong><time>' + escapeHtml(formatWhen(item.createdAt)) + '</time></div>'
            + topic
            + '<p>' + escapeHtml(item.body) + '</p>'
            + '<div class="idee-item-actions">'
            + '<button type="button" class="idee-act-mark" data-mark="' + escapeHtml(item.id) + '">' + markLabel + '</button>'
            + '<button type="button" class="idee-act-del" data-del="' + escapeHtml(item.id) + '">Elimina</button>'
            + '</div></article>';
    }

    function itemHtmlTrash(item, index) {
        const topic = item.topicLabel
            ? '<span class="idee-chip">' + escapeHtml(item.topicLabel) + '</span>'
            : '';
        const who = escapeHtml(item.authorLabel)
            + (item.authorEmail ? ' · ' + escapeHtml(item.authorEmail) : '');
        const meta = 'Eliminata'
            + (item.deletedAt ? ' ' + formatWhen(item.deletedAt) : '')
            + (item.deletedByLabel ? ' · da ' + item.deletedByLabel : '');
        return '<article class="idee-item idee-item--trash" data-iid="' + escapeHtml(item.id) + '"'
            + (typeof index === 'number' ? ' style="--i:' + index + '"' : '') + '>'
            + '<div class="idee-item-head"><strong>' + who + '</strong><time>' + escapeHtml(formatWhen(item.createdAt)) + '</time></div>'
            + topic
            + '<p>' + escapeHtml(item.body) + '</p>'
            + '<div class="idee-item-meta">' + escapeHtml(meta) + '</div>'
            + '<div class="idee-item-actions">'
            + '<button type="button" class="idee-act-del forever" data-forever="' + escapeHtml(item.id) + '">Elimina definitivamente</button>'
            + '</div></article>';
    }

    function renderList(data) {
        const items = (data && data.items) || [];
        titleEl.textContent = 'Le tue proposte';
        if (!items.length) {
            listEl.innerHTML = '<p class="idee-empty">Non hai ancora inviato proposte.</p>';
            return;
        }
        listEl.innerHTML = items.map((item) => itemHtmlMine(item)).join('');
    }

    function bindReceivedActions() {
        archiveList.querySelectorAll('.idee-act-mark').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.getAttribute('data-mark');
                const item = btn.closest('.idee-item');
                if (!id || !item) return;
                const unread = item.classList.contains('unread');
                btn.disabled = true;
                try {
                    const res = await fetch(
                        '/api/auth/idee/' + encodeURIComponent(id) + (unread ? '/read' : '/unread'),
                        { method: 'POST', headers: authHeader() }
                    );
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.error || 'Operazione non riuscita.');
                    setItemRead(item, unread);
                    if (data.unread != null) setUnreadBadge(data.unread);
                } catch (err) {
                    showMsg(err.message || 'Operazione non riuscita.', 'err');
                } finally {
                    btn.disabled = false;
                }
            });
        });
        archiveList.querySelectorAll('.idee-act-del').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.getAttribute('data-del');
                const item = btn.closest('.idee-item');
                if (!id) return;
                const ok = await showConfirm('Eliminare questa proposta? Andrà nell\'archivio del Super Admin.');
                if (!ok) return;
                btn.disabled = true;
                try {
                    const res = await fetch('/api/auth/idee/' + encodeURIComponent(id), {
                        method: 'DELETE',
                        headers: authHeader(),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.error || 'Eliminazione non riuscita.');
                    if (item) item.remove();
                    if (data.unread != null) setUnreadBadge(data.unread);
                    if (!archiveList.querySelector('.idee-item')) {
                        archiveList.innerHTML = '<p class="idee-empty">Nessuna proposta ricevuta.</p>';
                    }
                    showMsg('Proposta spostata nell\'archivio.', 'ok');
                } catch (err) {
                    showMsg(err.message || 'Eliminazione non riuscita.', 'err');
                    btn.disabled = false;
                }
            });
        });
    }

    function bindTrashActions() {
        trashList.querySelectorAll('[data-forever]').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.getAttribute('data-forever');
                const item = btn.closest('.idee-item');
                if (!id) return;
                const ok = await showConfirm('Eliminare definitivamente questa proposta? L\'azione non è reversibile.');
                if (!ok) return;
                btn.disabled = true;
                try {
                    const res = await fetch('/api/auth/idee/' + encodeURIComponent(id) + '/forever', {
                        method: 'DELETE',
                        headers: authHeader(),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.error || 'Eliminazione non riuscita.');
                    if (item) item.remove();
                    if (!trashList.querySelector('.idee-item')) {
                        trashList.innerHTML = '<p class="idee-empty">Archivio vuoto.</p>';
                    }
                    showMsg('Proposta eliminata definitivamente.', 'ok');
                } catch (err) {
                    showMsg(err.message || 'Eliminazione non riuscita.', 'err');
                    btn.disabled = false;
                }
            });
        });
    }

    function setItemRead(item, nowRead) {
        if (!item) return;
        item.classList.toggle('unread', !nowRead);
        const mark = item.querySelector('.idee-act-mark');
        if (mark) mark.textContent = nowRead ? 'Segna come non letto' : 'Segna come letto';
    }

    function renderArchive(items) {
        if (!items.length) {
            archiveList.innerHTML = '<p class="idee-empty">Nessuna proposta ricevuta.</p>';
            return;
        }
        archiveList.innerHTML = items.map((item, i) => itemHtmlReceived(item, i)).join('');
        bindReceivedActions();
    }

    function renderTrash(items) {
        if (!items.length) {
            trashList.innerHTML = '<p class="idee-empty">Archivio vuoto.</p>';
            return;
        }
        trashList.innerHTML = items.map((item, i) => itemHtmlTrash(item, i)).join('');
        bindTrashActions();
    }

    async function loadArchive() {
        const res = await fetch('/api/auth/idee/archivio', { headers: authHeader() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Impossibile aprire le proposte ricevute.');
        if (data.unread != null) setUnreadBadge(data.unread);
        renderArchive(data.items || []);
    }

    async function loadTrash() {
        const res = await fetch('/api/auth/idee/cestino', { headers: authHeader() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Impossibile aprire l\'archivio.');
        renderTrash(data.items || []);
    }

    function placePanelArrow(btn, panel) {
        const b = btn.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        const left = Math.max(16, Math.round(b.left - p.left + (b.width / 2) - 6));
        panel.style.setProperty('--idee-arrow-left', left + 'px');
    }

    function closePanel(btn, panel, immediate) {
        btn.setAttribute('aria-expanded', 'false');
        if (panel._closeTimer) {
            clearTimeout(panel._closeTimer);
            panel._closeTimer = null;
        }
        if (immediate || panel.hidden) {
            panel.classList.remove('is-open');
            panel.hidden = true;
            return;
        }
        panel.classList.remove('is-open');
        panel._closeTimer = setTimeout(() => {
            panel._closeTimer = null;
            if (!panel.classList.contains('is-open')) panel.hidden = true;
        }, 460);
    }

    async function openPanel(btn, panel, loader) {
        if (panel._closeTimer) {
            clearTimeout(panel._closeTimer);
            panel._closeTimer = null;
        }
        await loader();
        btn.setAttribute('aria-expanded', 'true');
        panel.hidden = false;
        placePanelArrow(btn, panel);
        void panel.offsetHeight;
        panel.classList.add('is-open');
    }

    function closeArchive(immediate) {
        closePanel(archiveBtn, archivePanel, immediate);
    }

    function closeTrash(immediate) {
        if (trashBtn && trashPanel) closePanel(trashBtn, trashPanel, immediate);
    }

    async function openArchive() {
        closeTrash(true);
        await openPanel(archiveBtn, archivePanel, loadArchive);
    }

    async function openTrash() {
        closeArchive(true);
        await openPanel(trashBtn, trashPanel, loadTrash);
    }

    function fillTopics(topics) {
        const current = toolEl.value;
        const options = ['<option value="">Scegli uno strumento</option>'].concat(
            (topics || []).map((t) => '<option value="' + escapeHtml(t.key) + '">' + escapeHtml(t.label) + '</option>')
        );
        toolEl.innerHTML = options.join('');
        if (current && Array.from(toolEl.options).some((o) => o.value === current)) toolEl.value = current;
        updatePlaceholder();
    }

    function topicMode() {
        const checked = form.querySelector('input[name="topicMode"]:checked');
        return checked && checked.value === 'free' ? 'free' : 'tool';
    }

    function updatePlaceholder() {
        if (!textEl) return;
        if (topicMode() === 'free') {
            textEl.placeholder = 'Descrivi l\'idea, la proposta o il problema riscontrato per il miglioramento del portale';
            return;
        }
        const opt = toolEl && toolEl.options[toolEl.selectedIndex];
        const label = (opt && opt.value ? opt.text : '').trim();
        textEl.placeholder = label
            ? ('Descrivi l\'idea, la proposta o il problema riscontrato con lo strumento ' + label)
            : 'Descrivi l\'idea, la proposta o il problema riscontrato con lo strumento selezionato';
    }

    function syncTopicMode() {
        const free = topicMode() === 'free';
        toolEl.hidden = free;
        topicTextEl.hidden = !free;
        updatePlaceholder();
    }

    function resetTopic() {
        const toolRadio = form.querySelector('input[name="topicMode"][value="tool"]');
        if (toolRadio) toolRadio.checked = true;
        toolEl.value = '';
        topicTextEl.value = '';
        syncTopicMode();
    }

    async function loadList() {
        const res = await fetch('/api/auth/idee', { headers: authHeader() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Impossibile caricare le proposte.');
        if (Array.isArray(data.topics)) fillTopics(data.topics);
        isSuperadmin = !!data.isSuperadmin;
        archiveBar.hidden = !data.isAdmin;
        if (trashBtn) trashBtn.hidden = !isSuperadmin;
        if (!data.isAdmin) {
            closeArchive(true);
            closeTrash(true);
        } else if (!isSuperadmin) {
            closeTrash(true);
        }
        if (data.unread != null) setUnreadBadge(data.unread);
        renderList(data);
        return data;
    }

    async function ensureAuth() {
        const res = await fetch('/api/auth/verify', { headers: { Authorization: 'Bearer ' + getAuthToken() } });
        const user = await res.json().catch(() => ({}));
        if (!res.ok || !user.valid) {
            window.location.replace('/login');
            return null;
        }
        if (user.accountType === 'strumento') {
            window.location.replace('/portal');
            return null;
        }
        document.getElementById('navUserEmail').textContent = user.displayName || user.username || user.email || '';
        document.getElementById('authOverlay').style.display = 'none';
        return user;
    }

    function showConfirm(message) {
        const modal = document.getElementById('confirmModal');
        const msgNode = document.getElementById('confirmMsg');
        const okBtn = document.getElementById('confirmOk');
        const cancelBtn = document.getElementById('confirmCancel');
        msgNode.textContent = message;
        modal.style.display = 'flex';
        okBtn.focus();
        return new Promise((resolve) => {
            function close(answer) {
                modal.style.display = 'none';
                okBtn.onclick = null;
                cancelBtn.onclick = null;
                document.removeEventListener('keydown', onKey);
                resolve(answer);
            }
            function onKey(e) {
                if (e.key === 'Escape') close(false);
            }
            okBtn.onclick = () => close(true);
            cancelBtn.onclick = () => close(false);
            document.addEventListener('keydown', onKey);
        });
    }

    function currentTopicLabel() {
        if (topicMode() === 'free') return topicTextEl.value.trim();
        const opt = toolEl.options[toolEl.selectedIndex];
        return opt ? opt.text : '';
    }
    form.querySelectorAll('input[name="topicMode"]').forEach((input) => {
        input.addEventListener('change', syncTopicMode);
    });
    if (toolEl) toolEl.addEventListener('change', updatePlaceholder);
    if (textEl) {
        textEl.addEventListener('input', updateCount);
        textEl.addEventListener('change', updateCount);
    }
    updateCount();
    syncTopicMode();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = textEl.value.trim();
        const mode = topicMode();
        if (mode === 'tool' && !toolEl.value) {
            showMsg('Scegli uno strumento oppure passa al campo libero.', 'err');
            return;
        }
        if (mode === 'free' && topicTextEl.value.trim().length < 2) {
            showMsg('Scrivi l\'argomento (almeno 2 caratteri).', 'err');
            return;
        }
        if (text.length < 10) {
            showMsg('Scrivi almeno 10 caratteri.', 'err');
            return;
        }
        const topicLabel = currentTopicLabel();
        const confirmed = await showConfirm('Inviare la proposta sull\'argomento «' + topicLabel + '»?');
        if (!confirmed) return;
        submitBtn.disabled = true;
        showMsg('');
        try {
            const res = await fetch('/api/auth/idee', {
                method: 'POST',
                headers: authHeader(),
                body: JSON.stringify({
                    text,
                    topicMode: mode,
                    topicKey: toolEl.value,
                    topicText: topicTextEl.value.trim(),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Invio non riuscito.');
            textEl.value = '';
            resetTopic();
            updateCount();
            showMsg('Proposta inviata. Admin e super admin la ricevono nella campanella.', 'ok');
            await loadList();
            if (archivePanel.classList.contains('is-open')) await loadArchive();
        } catch (err) {
            showMsg(err.message || 'Invio non riuscito.', 'err');
        } finally {
            submitBtn.disabled = false;
        }
    });

    archiveBtn.addEventListener('click', async () => {
        if (archivePanel.classList.contains('is-open')) {
            closeArchive();
            return;
        }
        archiveBtn.disabled = true;
        try {
            await openArchive();
        } catch (err) {
            closeArchive(true);
            showMsg(err.message || 'Impossibile aprire le proposte ricevute.', 'err');
        } finally {
            archiveBtn.disabled = false;
        }
    });

    if (trashBtn) {
        trashBtn.addEventListener('click', async () => {
            if (trashPanel.classList.contains('is-open')) {
                closeTrash();
                return;
            }
            trashBtn.disabled = true;
            try {
                await openTrash();
            } catch (err) {
                closeTrash(true);
                showMsg(err.message || 'Impossibile aprire l\'archivio.', 'err');
            } finally {
                trashBtn.disabled = false;
            }
        });
    }

    ensureAuth().then(async (user) => {
        if (!user) return;
        const data = await loadList();
        if (data && data.isAdmin) {
            const hash = window.location.hash || '';
            if (hash === '#archivio') await openArchive();
            else if (hash === '#cestino' && data.isSuperadmin) await openTrash();
        }
    }).catch((err) => {
        document.getElementById('authOverlay').style.display = 'none';
        showMsg(err.message || 'Errore di caricamento.', 'err');
    });
})();
