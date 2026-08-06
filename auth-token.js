'use strict';
/**
 * Token di sessione: preferisce l'elevazione easter-egg (sessionStorage),
 * altrimenti il login normale (localStorage).
 */
(function (global) {
    function getAuthToken() {
        try {
            return sessionStorage.getItem('elevatedAuthToken') || localStorage.getItem('authToken') || '';
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

    global.getAuthToken = getAuthToken;
    global.authHeader = authHeader;
    global.clearAuth = clearAuth;
    global.isElevatedSession = isElevatedSession;
})(typeof window !== 'undefined' ? window : globalThis);
