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

    const season = detectSeason();
    const root = document.documentElement;
    if (season) root.setAttribute('data-season', season);
    else root.removeAttribute('data-season');
})();
