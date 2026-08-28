'use strict';
/**
 * Apre gli strumenti con login proprio tramite ticket SSO del portale.
 * Accesso diretto allo strumento (senza ticket) resta con login+OTP locali.
 *
 * La finestra si apre nel click (sincrona), poi si naviga: altrimenti il
 * browser blocca il popup dopo il fetch asincrono del ticket.
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

    async function openToolWithSso(tool, fallbackUrl, target, win) {
        const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        const dest = fallbackUrl || '#';
        if (!token || !tool) {
            go(win, dest, target);
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
            const url = (res.ok && data.url) ? data.url : dest;
            go(win, url, target);
        } catch {
            go(win, dest, target);
        }
    }

    function bindPortalSsoLinks(root) {
        const scope = root || document;
        scope.querySelectorAll('a[data-sso-tool]').forEach(function (a) {
            if (a.dataset.ssoBound) return;
            a.dataset.ssoBound = '1';
            a.addEventListener('click', function (e) {
                e.preventDefault();
                const tool = a.getAttribute('data-sso-tool');
                const target = a.getAttribute('target') === '_blank' ? '_blank' : '_self';
                const href = a.getAttribute('href');
                const win = target === '_blank' ? global.open('about:blank', '_blank') : null;
                openToolWithSso(tool, href, target, win);
            });
        });
    }

    global.openToolWithSso = openToolWithSso;
    global.bindPortalSsoLinks = bindPortalSsoLinks;
})(typeof window !== 'undefined' ? window : globalThis);
