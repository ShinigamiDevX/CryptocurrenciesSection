'use strict';
/**
 * Apre gli strumenti con login proprio tramite ticket SSO del portale.
 * Accesso diretto allo strumento (senza ticket) resta con login+OTP locali.
 *
 * La finestra si apre nel click (sincrona), poi si naviga: altrimenti il
 * browser blocca il popup dopo il fetch asincrono del ticket.
 *
 * L'href dei link deve puntare a /sso-launch.html?tool=... così «apri in un'altra
 * scheda» (click centrale / Ctrl+click) ottiene comunque il ticket.
 */
(function (global) {
    function go(win, url, target) {
        if (win && !win.closed) {
            win.location.replace(url);
            return;
        }
        if (target === '_self') global.location.assign(url);
        else global.open(url, '_blank');
    }

    function isModifiedClick(e) {
        return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
    }

    async function openToolWithSso(tool, fallbackUrl, target, win) {
        const token = (typeof getAuthToken === 'function' ? getAuthToken() : '')
            || (function () {
                try { return localStorage.getItem('authToken') || ''; } catch { return ''; }
            })();
        const dest = fallbackUrl || '#';
        function fail(msg) {
            if (win && !win.closed) win.close();
            if (typeof global.alert === 'function') {
                global.alert(msg || 'Impossibile aprire lo strumento con l\'accesso del portale.');
            }
        }
        if (!token || !tool) {
            fail('Sessione portale assente. Ricarica la dashboard e riprova.');
            return;
        }
        try {
            const res = await fetch('/api/auth/sso/ticket', {
                method: 'POST',
                headers: typeof authHeader === 'function' ? authHeader() : {
                    Authorization: 'Bearer ' + token,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ tool }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.url) {
                go(win, data.url, target);
                return;
            }
            fail(data.error || 'Impossibile aprire lo strumento con l\'accesso del portale.');
        } catch {
            fail('Portale non raggiungibile. Riprova tra poco.');
        }
    }

    function bindPortalSsoLinks(root) {
        const scope = root || document;
        scope.querySelectorAll('a[data-sso-tool]').forEach(function (a) {
            if (a.dataset.ssoBound) return;
            a.dataset.ssoBound = '1';
            a.addEventListener('click', function (e) {
                if (isModifiedClick(e)) return;
                e.preventDefault();
                const tool = a.getAttribute('data-sso-tool');
                const target = a.getAttribute('target') === '_blank' ? '_blank' : '_self';
                const next = a.getAttribute('data-sso-next') || '';
                const href = a.getAttribute('href') || '';
                const fallback = next || (href.indexOf('sso-launch') === -1 ? href : '');
                const win = target === '_blank' ? global.open('about:blank', '_blank') : null;
                openToolWithSso(tool, fallback, target, win);
            });
        });
    }

    global.openToolWithSso = openToolWithSso;
    global.bindPortalSsoLinks = bindPortalSsoLinks;
})(typeof window !== 'undefined' ? window : globalThis);
