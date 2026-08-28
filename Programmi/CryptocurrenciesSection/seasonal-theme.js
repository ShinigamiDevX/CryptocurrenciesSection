'use strict';
/**
 * Tema stagionale leggero: Natale (8 dic – 6 gen) e settimana di Pasqua
 * (domenica delle Palme → lunedì dell'Angelo).
 * Override test: ?season=natale|pasqua|off
 */
(function () {
    function easterSunday(year) {
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(year, month - 1, day);
    }

    function startOfDay(d) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    function addDays(d, n) {
        const x = new Date(d.getTime());
        x.setDate(x.getDate() + n);
        return x;
    }

    function isChristmas(today) {
        const m = today.getMonth(); // 0-based
        const day = today.getDate();
        if (m === 11 && day >= 8) return true; // 8–31 dicembre
        if (m === 0 && day <= 6) return true;  // 1–6 gennaio
        return false;
    }

    function isEasterWeek(today) {
        const y = today.getFullYear();
        const easter = startOfDay(easterSunday(y));
        const from = addDays(easter, -7); // Domenica delle Palme
        const to = addDays(easter, 1);    // Lunedì dell'Angelo
        const t = startOfDay(today);
        return t >= from && t <= to;
    }

    function detectSeason(now) {
        try {
            const q = new URLSearchParams(window.location.search).get('season');
            if (q === 'off' || q === 'none') return '';
            if (q === 'natale' || q === 'pasqua') return q;
        } catch { /* ignore */ }
        const today = now || new Date();
        if (isChristmas(today)) return 'natale';
        if (isEasterWeek(today)) return 'pasqua';
        return '';
    }

    function reduceMotion() {
        try {
            return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch {
            return false;
        }
    }

    function decorateLogos() {
        const imgs = document.querySelectorAll(
            'img[src*="logo.png"], img[src*="logo.PNG"], #headerLogo'
        );
        imgs.forEach((img) => {
            if (img.closest('.season-logo-hat')) return;
            const wrap = document.createElement('span');
            wrap.className = 'season-logo-hat';
            wrap.setAttribute('aria-hidden', 'true');
            img.parentNode.insertBefore(wrap, img);
            wrap.appendChild(img);
        });
    }

    function injectCornerDecor() {
        if (document.getElementById('season-corner')) return;
        const corner = document.createElement('img');
        corner.id = 'season-corner';
        corner.src = '/immagini/angolonatale.png';
        corner.alt = '';
        corner.setAttribute('aria-hidden', 'true');
        document.body.appendChild(corner);
    }

    function injectFxLayer() {
        if (document.getElementById('season-fx')) return;
        const layer = document.createElement('div');
        layer.id = 'season-fx';
        layer.setAttribute('aria-hidden', 'true');

        const snowCount = 42;
        for (let i = 0; i < snowCount; i++) {
            const flake = document.createElement('span');
            flake.className = 'season-snow';
            flake.style.setProperty('--sx', (Math.random() * 100).toFixed(2) + 'vw');
            flake.style.setProperty('--sr', (Math.random() * 22 - 11).toFixed(1) + 'px');
            flake.style.setProperty('--ss', (1.2 + Math.random() * 2.4).toFixed(2) + 'px');
            flake.style.setProperty('--sd', (10 + Math.random() * 16).toFixed(1) + 's');
            flake.style.setProperty('--sdelay', (-Math.random() * 18).toFixed(1) + 's');
            flake.style.setProperty('--sop', (0.25 + Math.random() * 0.4).toFixed(2));
            layer.appendChild(flake);
        }

        const starCount = 18;
        for (let i = 0; i < starCount; i++) {
            const star = document.createElement('span');
            star.className = 'season-star';
            // Mix di taglie: piccole, medie, qualche più grande
            const sizeRoll = Math.random();
            const size = sizeRoll < 0.45
                ? (0.45 + Math.random() * 0.35)   // piccole
                : sizeRoll < 0.8
                    ? (0.85 + Math.random() * 0.4) // medie
                    : (1.35 + Math.random() * 0.55); // grandi
            star.style.setProperty('--stx', (6 + Math.random() * 88).toFixed(2) + 'vw');
            star.style.setProperty('--sty', (4 + Math.random() * 62).toFixed(2) + 'vh');
            star.style.setProperty('--sts', size.toFixed(2));
            star.style.setProperty('--std', (4.5 + Math.random() * 6).toFixed(1) + 's');
            star.style.setProperty('--stdelay', (-Math.random() * 7).toFixed(1) + 's');
            layer.appendChild(star);
        }

        document.body.appendChild(layer);
    }

    function initChristmasExtras() {
        decorateLogos();
        injectCornerDecor();
        if (!reduceMotion()) injectFxLayer();
    }

    const season = detectSeason();
    const root = document.documentElement;
    if (season) root.setAttribute('data-season', season);
    else root.removeAttribute('data-season');

    if (season === 'natale') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initChristmasExtras);
        } else {
            initChristmasExtras();
        }
    }
})();
