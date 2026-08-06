'use strict';
/**
 * Aggiunge un'icona occhio a tutti i campi <input type="password">
 * per mostrare/nascondere la password. Basta includere questo file:
 * non richiede modifiche all'HTML dei campi.
 */
(function () {
    const EYE_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const EYE_CLOSED = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

    const style = document.createElement('style');
    style.textContent = `
        .pwd-toggle-wrap { position: relative; display: block; }
        .pwd-toggle-wrap > input { padding-right: 2.8rem !important; }
        .pwd-toggle-btn {
            position: absolute;
            top: 50%;
            right: 0.35rem;
            transform: translateY(-50%);
            display: flex;
            align-items: center;
            justify-content: center;
            width: 2.1rem;
            height: 2.1rem;
            background: none;
            border: none;
            padding: 0;
            cursor: pointer;
            color: #5ABBC8;
            opacity: 0.75;
            transition: color 0.2s, opacity 0.2s;
        }
        .pwd-toggle-btn:hover { color: #00C8FF; opacity: 1; }
        .pwd-toggle-btn:focus-visible { outline: 1px solid rgba(0,200,255,0.6); border-radius: 6px; }
    `;
    document.head.appendChild(style);

    function enhance(input) {
        if (input.dataset.pwdToggle) return;
        input.dataset.pwdToggle = '1';

        const wrap = document.createElement('div');
        wrap.className = 'pwd-toggle-wrap';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pwd-toggle-btn';
        btn.setAttribute('aria-label', 'Mostra password');
        btn.innerHTML = EYE_OPEN;
        wrap.appendChild(btn);

        btn.addEventListener('click', () => {
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.innerHTML = show ? EYE_CLOSED : EYE_OPEN;
            btn.setAttribute('aria-label', show ? 'Nascondi password' : 'Mostra password');
            input.focus({ preventScroll: true });
            // Cursore alla fine del testo dopo il cambio di tipo
            const len = input.value.length;
            try { input.setSelectionRange(len, len); } catch {}
        });
    }

    function init() {
        document.querySelectorAll('input[type="password"]').forEach(enhance);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Campi password aggiunti dopo il load (modali, form dinamici)
    const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches && node.matches('input[type="password"]')) enhance(node);
                if (node.querySelectorAll) node.querySelectorAll('input[type="password"]').forEach(enhance);
            }
        }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
})();
