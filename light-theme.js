'use strict';
/**
 * Tema chiaro condiviso con Cluster (localStorage key: theme).
 */
(function () {
    const KEY = 'theme';

    function isLight() {
        try { return localStorage.getItem(KEY) === 'light'; }
        catch { return false; }
    }

    function label(light) {
        return light ? '🌙 Tema scuro' : '☀️ Tema chiaro';
    }

    function apply(light) {
        document.documentElement.classList.toggle('light-theme', light);
        if (document.body) document.body.classList.toggle('light-theme', light);
        try { localStorage.setItem(KEY, light ? 'light' : 'dark'); }
        catch { /* ignore */ }
        const btn = document.getElementById('themeToggleBtn');
        if (btn) btn.textContent = label(light);
    }

    apply(isLight());

    function mountButton() {
        apply(isLight());
        let btn = document.getElementById('themeToggleBtn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'themeToggleBtn';
            btn.type = 'button';
            btn.textContent = label(isLight());
            const navUl = document.querySelector('header nav ul');
            if (navUl) {
                const li = document.createElement('li');
                li.className = 'nav-theme-wrap';
                li.appendChild(btn);
                const logout = navUl.querySelector('.nav-logout');
                navUl.insertBefore(li, logout || null);
            } else {
                btn.classList.add('theme-toggle-floating');
                document.body.appendChild(btn);
            }
        }
        if (btn.dataset.wired) return;
        btn.dataset.wired = '1';
        btn.addEventListener('click', function () {
            apply(!document.documentElement.classList.contains('light-theme'));
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountButton);
    } else {
        mountButton();
    }
})();
