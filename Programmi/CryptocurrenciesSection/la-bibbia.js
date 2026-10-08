(function () {
    let state = { exchanges: [], permissions: { canWrite: false, canAdmin: false }, selectedId: null };
    let modalMode = null;

    function token() { return typeof getAuthToken === 'function' ? getAuthToken() : ''; }
    function headers(extra) {
        return Object.assign({ Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, extra || {});
    }
    function logout() {
        if (typeof clearAuth === 'function') clearAuth();
        window.location.replace('/login');
    }
    window.logout = logout;

    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    async function api(path, opts) {
        const res = await fetch('/api/auth/bibbia/' + path, opts || {});
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Errore di rete');
        return data;
    }

    function filteredExchanges() {
        const q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
        if (!q) return state.exchanges;
        return state.exchanges.filter((ex) => {
            const hay = [
                ex.name, ex.website, ex.notes, ex.requestInfo,
                ...(ex.contacts || []).flatMap((c) => [c.name, c.email, c.phone, c.roleLabel, c.notes]),
            ].join(' ').toLowerCase();
            return hay.includes(q);
        });
    }

    function defaultLogo() { return '/icons/line/building.svg'; }

    function renderList() {
        const ul = document.getElementById('exchangeList');
        const list = filteredExchanges();
        if (!list.length) {
            ul.innerHTML = '<li class="lb-empty">Nessun exchange. ' +
                (state.permissions.canWrite ? 'Aggiungine uno con il pulsante in alto.' : '') + '</li>';
            return;
        }
        ul.innerHTML = list.map((ex) => {
            const img = ex.logoUrl || defaultLogo();
            const active = ex.id === state.selectedId ? ' active' : '';
            const n = (ex.contacts || []).length;
            return '<li class="lb-ex-item' + active + '" data-id="' + esc(ex.id) + '">' +
                '<img src="' + esc(img) + '" alt="" onerror="this.src=\'' + defaultLogo() + '\'">' +
                '<span>' + esc(ex.name) + (n ? ' <small>(' + n + ')</small>' : '') + '</span></li>';
        }).join('');
        ul.querySelectorAll('.lb-ex-item').forEach((li) => {
            li.addEventListener('click', () => {
                state.selectedId = li.getAttribute('data-id');
                renderList();
                renderDetail();
            });
        });
    }

    function renderDetail() {
        const box = document.getElementById('exchangeDetail');
        const ex = state.exchanges.find((e) => e.id === state.selectedId);
        if (!ex) {
            box.innerHTML = '<div class="lb-empty">Seleziona un exchange dalla lista.</div>';
            return;
        }
        const p = state.permissions;
        const img = ex.logoUrl || defaultLogo();
        let headActions = '';
        if (p.canWrite) {
            headActions += '<button type="button" class="lb-btn" data-act="add-contact">+ Contatto</button>';
        }
        if (p.canAdmin) {
            headActions += '<button type="button" class="lb-btn" data-act="edit-exchange">Modifica exchange</button>';
            headActions += '<button type="button" class="lb-btn lb-btn--danger" data-act="del-exchange">Elimina</button>';
        } else if (p.canWrite) {
            headActions += '<button type="button" class="lb-btn" data-act="req-edit-exchange">Richiedi modifica</button>';
            headActions += '<button type="button" class="lb-btn lb-btn--danger" data-act="req-del-exchange">Richiedi eliminazione</button>';
        }

        const contacts = ex.contacts || [];
        const rows = contacts.length ? contacts.map((c) => {
            let acts = '';
            if (p.canAdmin) {
                acts = '<button type="button" class="lb-btn" data-act="edit-contact" data-cid="' + esc(c.id) + '">Modifica</button>' +
                    '<button type="button" class="lb-btn lb-btn--danger" data-act="del-contact" data-cid="' + esc(c.id) + '">Elimina</button>';
            } else if (p.canWrite) {
                acts = '<button type="button" class="lb-btn" data-act="req-edit-contact" data-cid="' + esc(c.id) + '">Richiedi modifica</button>' +
                    '<button type="button" class="lb-btn lb-btn--danger" data-act="req-del-contact" data-cid="' + esc(c.id) + '">Richiedi elim.</button>';
            }
            return '<tr><td>' + esc(c.roleLabel) + '</td><td>' + esc(c.name) + '</td><td>' +
                (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') + '</td><td>' +
                esc(c.pec) + '</td><td>' + esc(c.phone) + '</td><td>' + esc(c.notes) + '</td>' +
                '<td><div class="lb-row-actions">' + acts + '</div></td></tr>';
        }).join('') : '<tr><td colspan="7" class="lb-empty">Nessun contatto registrato.</td></tr>';

        box.innerHTML =
            '<div class="lb-ex-head">' +
            '<img src="' + esc(img) + '" alt="" onerror="this.src=\'' + defaultLogo() + '\'">' +
            '<div><h2 class="lb-ex-title">' + esc(ex.name) + '</h2>' +
            '<div class="lb-meta">' +
            (ex.website ? '<div>Sito: <a href="' + esc(ex.website) + '" target="_blank" rel="noopener">' + esc(ex.website) + '</a></div>' : '') +
            (ex.requestInfo ? '<div>Richieste: ' + esc(ex.requestInfo) + '</div>' : '') +
            (ex.notes ? '<div>Note: ' + esc(ex.notes) + '</div>' : '') +
            '</div></div>' +
            '<div class="lb-actions">' + headActions + '</div></div>' +
            '<div class="lb-table-wrap"><table class="lb-table"><thead><tr>' +
            '<th>Ruolo</th><th>Nome</th><th>Email</th><th>PEC</th><th>Telefono</th><th>Note</th><th></th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div>';

        box.querySelectorAll('[data-act]').forEach((btn) => {
            btn.addEventListener('click', () => onDetailAction(btn.getAttribute('data-act'), btn.getAttribute('data-cid')));
        });
    }

    function renderAdminPanel(requests) {
        const panel = document.getElementById('adminRequestsPanel');
        if (!state.permissions.canAdmin || !requests.length) {
            panel.style.display = 'none';
            return;
        }
        panel.style.display = '';
        panel.innerHTML = '<h3 id="richieste">Richieste in attesa (' + requests.length + ')</h3>' +
            requests.map((r) =>
                '<div class="lb-req"><strong>' + esc(r.action === 'delete' ? 'Eliminazione' : 'Modifica') +
                '</strong> · ' + esc(r.entityType) + ' · ' + esc(r.exchangeName) + ' — ' + esc(r.entityLabel) +
                '<br>Da ' + esc(r.requestedByEmail) + ' · ' + esc(r.reason || '') +
                '<div class="lb-row-actions" style="margin-top:0.45rem">' +
                '<button type="button" class="lb-btn lb-btn--primary" data-req-approve="' + esc(r.id) + '">Approva</button>' +
                '<button type="button" class="lb-btn lb-btn--danger" data-req-reject="' + esc(r.id) + '">Rifiuta</button>' +
                '</div></div>'
            ).join('');
        panel.querySelectorAll('[data-req-approve]').forEach((b) => {
            b.addEventListener('click', () => approveRequest(b.getAttribute('data-req-approve')));
        });
        panel.querySelectorAll('[data-req-reject]').forEach((b) => {
            b.addEventListener('click', () => rejectRequest(b.getAttribute('data-req-reject')));
        });
    }

    async function loadBootstrap() {
        const data = await api('bootstrap', { headers: headers() });
        state.exchanges = data.exchanges || [];
        state.permissions = data.permissions || state.permissions;
        if (!state.selectedId && state.exchanges.length) state.selectedId = state.exchanges[0].id;
        document.getElementById('btnAddExchange').style.display = state.permissions.canWrite ? '' : 'none';
        renderAdminPanel(data.pendingRequests || []);
        renderList();
        renderDetail();
    }

    function openModal(title, fieldsHtml, mode) {
        modalMode = mode;
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = fieldsHtml;
        document.getElementById('modalStatus').textContent = '';
        document.getElementById('modalBg').classList.add('open');
    }
    function closeModal() {
        document.getElementById('modalBg').classList.remove('open');
        modalMode = null;
    }

    function field(id, label, value, type) {
        type = type || 'text';
        if (type === 'textarea') {
            return '<div class="lb-field"><label for="' + id + '">' + esc(label) + '</label>' +
                '<textarea id="' + id + '">' + esc(value) + '</textarea></div>';
        }
        return '<div class="lb-field"><label for="' + id + '">' + esc(label) + '</label>' +
            '<input id="' + id + '" type="' + type + '" value="' + esc(value) + '"></div>';
    }

    function readModalFields(ids) {
        const out = {};
        ids.forEach((id) => {
            const el = document.getElementById(id);
            out[id] = el ? el.value.trim() : '';
        });
        return out;
    }

    async function onDetailAction(act, contactId) {
        const ex = state.exchanges.find((e) => e.id === state.selectedId);
        if (!ex) return;
        const contact = (ex.contacts || []).find((c) => c.id === contactId);

        if (act === 'add-contact') {
            openModal('Nuovo contatto', [
                field('cRole', 'Ruolo / ufficio', ''),
                field('cName', 'Nome', ''),
                field('cEmail', 'Email', '', 'email'),
                field('cPec', 'PEC', '', 'email'),
                field('cPhone', 'Telefono', ''),
                field('cNotes', 'Note', '', 'textarea'),
            ].join(''), { type: 'add-contact', exchangeId: ex.id });
            return;
        }
        if (act === 'edit-exchange' || act === 'req-edit-exchange') {
            openModal(act.startsWith('req') ? 'Richiedi modifica exchange' : 'Modifica exchange', [
                field('eName', 'Nome exchange', ex.name),
                field('eWeb', 'Sito web', ex.website),
                field('eReq', 'Modalità richiesta', ex.requestInfo, 'textarea'),
                field('eNotes', 'Note exchange', ex.notes, 'textarea'),
                act.startsWith('req') ? field('reason', 'Motivo richiesta', '', 'textarea') : '',
            ].join(''), { type: act, exchangeId: ex.id });
            return;
        }
        if (act === 'del-exchange') {
            if (!confirm('Eliminare l\'exchange «' + ex.name + '» e tutti i contatti?')) return;
            await api('exchanges/' + ex.id, { method: 'DELETE', headers: headers() });
            state.selectedId = null;
            await loadBootstrap();
            return;
        }
        if (act === 'req-del-exchange') {
            openModal('Richiedi eliminazione exchange', field('reason', 'Motivo (obbligatorio)', '', 'textarea'),
                { type: act, exchangeId: ex.id });
            return;
        }
        if (!contact) return;
        if (act === 'edit-contact' || act === 'req-edit-contact') {
            openModal(act.startsWith('req') ? 'Richiedi modifica contatto' : 'Modifica contatto', [
                field('cRole', 'Ruolo', contact.roleLabel),
                field('cName', 'Nome', contact.name),
                field('cEmail', 'Email', contact.email, 'email'),
                field('cPec', 'PEC', contact.pec, 'email'),
                field('cPhone', 'Telefono', contact.phone),
                field('cNotes', 'Note', contact.notes, 'textarea'),
                act.startsWith('req') ? field('reason', 'Motivo richiesta', '', 'textarea') : '',
            ].join(''), { type: act, contactId: contact.id, exchangeId: ex.id });
            return;
        }
        if (act === 'del-contact') {
            if (!confirm('Eliminare questo contatto?')) return;
            await api('contacts/' + contact.id, { method: 'DELETE', headers: headers() });
            await loadBootstrap();
            return;
        }
        if (act === 'req-del-contact') {
            openModal('Richiedi eliminazione contatto', field('reason', 'Motivo (obbligatorio)', '', 'textarea'),
                { type: act, contactId: contact.id });
        }
    }

    async function submitModal() {
        const status = document.getElementById('modalStatus');
        status.textContent = '';
        status.className = 'lb-status';
        try {
            const m = modalMode;
            if (!m) return;
            if (m.type === 'add-exchange') {
                const v = readModalFields(['eName', 'eWeb', 'eReq', 'eNotes']);
                if (!v.eName) throw new Error('Nome obbligatorio.');
                await api('exchanges', {
                    method: 'POST', headers: headers(),
                    body: JSON.stringify({ name: v.eName, website: v.eWeb, requestInfo: v.eReq, notes: v.eNotes }),
                });
            } else if (m.type === 'add-contact') {
                const v = readModalFields(['cRole', 'cName', 'cEmail', 'cPec', 'cPhone', 'cNotes']);
                await api('exchanges/' + m.exchangeId + '/contacts', {
                    method: 'POST', headers: headers(),
                    body: JSON.stringify({
                        roleLabel: v.cRole, name: v.cName, email: v.cEmail, pec: v.cPec, phone: v.cPhone, notes: v.cNotes,
                    }),
                });
            } else if (m.type === 'edit-exchange') {
                const v = readModalFields(['eName', 'eWeb', 'eReq', 'eNotes']);
                await api('exchanges/' + m.exchangeId, {
                    method: 'PUT', headers: headers(),
                    body: JSON.stringify({ name: v.eName, website: v.eWeb, requestInfo: v.eReq, notes: v.eNotes }),
                });
            } else if (m.type === 'edit-contact') {
                const v = readModalFields(['cRole', 'cName', 'cEmail', 'cPec', 'cPhone', 'cNotes']);
                await api('contacts/' + m.contactId, {
                    method: 'PUT', headers: headers(),
                    body: JSON.stringify({
                        roleLabel: v.cRole, name: v.cName, email: v.cEmail, pec: v.cPec, phone: v.cPhone, notes: v.cNotes,
                    }),
                });
            } else if (m.type.startsWith('req-')) {
                const reasonEl = document.getElementById('reason');
                const reason = reasonEl ? reasonEl.value.trim() : '';
                const isDelete = m.type.includes('del');
                const entityType = m.type.includes('contact') ? 'contact' : 'exchange';
                const entityId = m.contactId || m.exchangeId;
                let payload = {};
                if (!isDelete) {
                    if (entityType === 'exchange') {
                        const v = readModalFields(['eName', 'eWeb', 'eReq', 'eNotes']);
                        payload = { name: v.eName, website: v.eWeb, requestInfo: v.eReq, notes: v.eNotes };
                    } else {
                        const v = readModalFields(['cRole', 'cName', 'cEmail', 'cPec', 'cPhone', 'cNotes']);
                        payload = {
                            roleLabel: v.cRole, name: v.cName, email: v.cEmail, pec: v.cPec, phone: v.cPhone, notes: v.cNotes,
                        };
                    }
                }
                await api('change-requests', {
                    method: 'POST', headers: headers(),
                    body: JSON.stringify({
                        entityType, entityId, action: isDelete ? 'delete' : 'update', payload, reason,
                    }),
                });
                status.textContent = 'Richiesta inviata agli admin.';
                status.className = 'lb-status ok';
                setTimeout(closeModal, 900);
                await loadBootstrap();
                return;
            }
            closeModal();
            await loadBootstrap();
        } catch (err) {
            status.textContent = err.message || 'Operazione non riuscita.';
            status.className = 'lb-status error';
        }
    }

    async function approveRequest(id) {
        await fetch('/api/auth/bibbia/change-requests/' + id + '/approve', { method: 'POST', headers: headers() });
        await loadBootstrap();
    }
    async function rejectRequest(id) {
        await fetch('/api/auth/bibbia/change-requests/' + id, { method: 'DELETE', headers: headers() });
        await loadBootstrap();
    }

    document.getElementById('btnAddExchange').addEventListener('click', () => {
        openModal('Nuovo exchange', [
            field('eName', 'Nome exchange', ''),
            field('eWeb', 'Sito web', ''),
            field('eReq', 'Modalità richiesta', '', 'textarea'),
            field('eNotes', 'Note', '', 'textarea'),
        ].join(''), { type: 'add-exchange' });
    });
    document.getElementById('searchInput').addEventListener('input', () => { renderList(); });
    document.getElementById('modalCancel').addEventListener('click', closeModal);
    document.getElementById('modalSubmit').addEventListener('click', submitModal);
    document.getElementById('modalBg').addEventListener('click', (e) => {
        if (e.target.id === 'modalBg') closeModal();
    });

    (async function init() {
        const t = token();
        if (!t) { window.location.replace('/login'); return; }
        try {
            const res = await fetch('/api/auth/verify', { headers: { Authorization: 'Bearer ' + t } });
            if (!res.ok) throw new Error();
            const user = await res.json();
            const cards = user.cards || [];
            const ok = user.role === 'superadmin' || cards.includes('la-bibbia');
            if (!ok) { window.location.replace('/portal'); return; }
            document.getElementById('authOverlay').style.display = 'none';
            document.getElementById('navUserEmail').textContent = user.displayName || user.email || '';
            if (typeof initNavBell === 'function') initNavBell();
            await loadBootstrap();
            if (location.hash === '#richieste') {
                document.getElementById('adminRequestsPanel')?.scrollIntoView({ behavior: 'smooth' });
            }
        } catch {
            if (typeof clearAuth === 'function') clearAuth();
            window.location.replace('/login');
        }
    })();
})();
