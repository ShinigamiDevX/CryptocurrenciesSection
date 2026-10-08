'use strict';
/**
 * Token di sessione da login (localStorage).
 */
(function (global) {
    function getAuthToken() {
        try {
            return localStorage.getItem('authToken') || '';
        } catch {
            return localStorage.getItem('authToken') || '';
        }
    }

    function authHeader(extra) {
        const h = Object.assign({ Authorization: 'Bearer ' + getAuthToken() }, extra || {});
        if (!h['Content-Type'] && !h['content-type']) h['Content-Type'] = 'application/json';
        return h;
    }

    function clearAuth() {
        try { sessionStorage.removeItem('elevatedAuthToken'); } catch {}
        localStorage.removeItem('authToken');
    }

    function isElevatedSession() {
        try { return !!sessionStorage.getItem('elevatedAuthToken'); } catch { return false; }
    }

    /** Se il Super Admin blocca l'account, forza il logout appena la sessione non è più valida. */
    function forceLogoutToLogin() {
        clearAuth();
        try {
            const path = (global.location && global.location.pathname) || '';
            if (/\/login(\.html)?$/i.test(path) || /\/register(\.html)?$/i.test(path)) return;
            global.location.replace('/login');
        } catch { /* ignore */ }
    }

    let _sessionWatchStarted = false;
    function startSessionWatch() {
        if (_sessionWatchStarted || typeof fetch !== 'function') return;
        if (typeof document === 'undefined') return;
        const path = (global.location && global.location.pathname) || '';
        if (/\/login(\.html)?$/i.test(path) || /\/register(\.html)?$/i.test(path)) return;
        _sessionWatchStarted = true;

        async function checkSession() {
            const token = getAuthToken();
            if (!token) return;
            try {
                const res = await fetch('/api/auth/verify', {
                    headers: { Authorization: 'Bearer ' + token },
                });
                if (res.status === 401) forceLogoutToLogin();
            } catch { /* offline: non forzare logout */ }
        }

        checkSession();
        setInterval(checkSession, 3000);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') checkSession();
        });
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startSessionWatch);
        } else {
            startSessionWatch();
        }
    }

    global.getAuthToken = getAuthToken;
    global.authHeader = authHeader;
    global.clearAuth = clearAuth;
    global.isElevatedSession = isElevatedSession;
    global.forceLogoutToLogin = forceLogoutToLogin;
})(typeof window !== 'undefined' ? window : globalThis);
