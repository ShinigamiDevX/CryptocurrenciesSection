/**
 * CustomDate — Calendario personalizzato (tema portale)
 *
 * - Digitabile con maschera gg/mm/aaaa (slash automatici)
 * - Icona apre il calendario
 * - Livelli: giorni → mesi (click titolo) → anni
 *
 * Uso:
 *   const cd = new CustomDate(containerEl, { placeholder, value, onChange, max });
 *   cd.getValue()  // 'YYYY-MM-DD' oppure ''
 *   cd.setValue('YYYY-MM-DD')
 */
class CustomDate {
    static _instances = [];
    static MONTHS = [
        'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
        'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
    ];
    static MONTHS_SHORT = [
        'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
        'lug', 'ago', 'set', 'ott', 'nov', 'dic',
    ];
    static WEEK = [
        { label: 'lun', weekend: false },
        { label: 'mar', weekend: false },
        { label: 'mer', weekend: false },
        { label: 'gio', weekend: false },
        { label: 'ven', weekend: false },
        { label: 'sab', weekend: true },
        { label: 'dom', weekend: true },
    ];

    /** Cache feste nazionali italiane per anno (ISO → nome). */
    static _holidayCache = Object.create(null);

    /** Pasqua (domenica) — algoritmo gregoriano anonimo. */
    static _easterSunday(year) {
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
        const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=mar, 4=apr
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return { y: year, m: month - 1, d: day };
    }

    static _holidaysForYear(year) {
        if (CustomDate._holidayCache[year]) return CustomDate._holidayCache[year];
        const map = Object.create(null);
        const add = (y, m, d, name) => {
            const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            map[iso] = name;
        };
        add(year, 0, 1, 'Capodanno');
        add(year, 0, 6, 'Epifania');
        add(year, 3, 25, 'Liberazione');
        add(year, 4, 1, 'Festa del Lavoro');
        add(year, 5, 2, 'Festa della Repubblica');
        add(year, 7, 15, 'Ferragosto');
        add(year, 10, 1, 'Tutti i Santi');
        add(year, 11, 8, 'Immacolata Concezione');
        add(year, 11, 25, 'Natale');
        add(year, 11, 26, 'Santo Stefano');
        const easter = CustomDate._easterSunday(year);
        add(easter.y, easter.m, easter.d, 'Pasqua');
        const pasquetta = new Date(easter.y, easter.m, easter.d + 1);
        add(pasquetta.getFullYear(), pasquetta.getMonth(), pasquetta.getDate(), "Lunedì dell'Angelo");
        CustomDate._holidayCache[year] = map;
        return map;
    }

    static holidayName(y, m, d) {
        const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        return CustomDate._holidaysForYear(y)[iso] || '';
    }

    constructor(el, cfg = {}) {
        this.el = typeof el === 'string' ? document.querySelector(el) : el;
        if (!this.el) return;
        this.onChange = cfg.onChange || (() => {});
        this.placeholder = cfg.placeholder || 'gg / mm / aaaa';
        this.max = cfg.max || '';
        this._value = this._normalize(cfg.value || '');
        this._isOpen = false;
        this._mode = 'days';
        this._deleting = false;

        const base = this._value ? this._parse(this._value) : new Date();
        this._viewYear = base.getFullYear();
        this._viewMonth = base.getMonth();
        this._viewDecade = Math.floor(this._viewYear / 12) * 12;

        this.el.classList.add('cdate');
        this.el._cdate = this;

        this.btn = document.createElement('div');
        this.btn.className = 'cdate-btn cdate-combo';

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'cdate-input';
        this.input.inputMode = 'numeric';
        this.input.autocomplete = 'bday';
        this.input.spellcheck = false;
        this.input.placeholder = this.placeholder;
        this.input.maxLength = 10;
        this.btn.appendChild(this.input);

        this.iconBtn = document.createElement('button');
        this.iconBtn.type = 'button';
        this.iconBtn.className = 'cdate-icon-btn';
        this.iconBtn.setAttribute('aria-label', 'Apri calendario');
        this.iconBtn.innerHTML = `
            <span class="cdate-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <rect x="3" y="5" width="18" height="16" rx="2"/>
                    <path d="M3 10h18M8 3v4M16 3v4"/>
                </svg>
            </span>`;
        this.btn.appendChild(this.iconBtn);
        this.el.appendChild(this.btn);

        this.panel = document.createElement('div');
        this.panel.className = 'cdate-panel';
        this.el.appendChild(this.panel);

        this._updateBtn();
        this._bindEvents();
        CustomDate._instances.push(this);
    }

    static closeAll(except) {
        for (const inst of CustomDate._instances) {
            if (inst !== except) inst._close();
        }
    }

    getValue() {
        // riesegue validazione dal testo digitato
        const digits = this._digitsFromMasked(this.input ? this.input.value : '');
        if (digits.length === 8) {
            const iso = this._parseIT(this._maskDigits(digits, false));
            this._value = iso || '';
        } else if (digits.length > 0) {
            this._value = '';
        }
        return this._value;
    }

    /** null se ok; messaggio se data incompleta/non valida nel campo. */
    getValidationError() {
        if (!this.input) return null;
        const digits = this._digitsFromMasked(this.input.value);
        if (!digits.length) return null;
        if (digits.length < 8) return 'Data di nascita incompleta.';
        const iso = this._parseIT(this._maskDigits(digits, false));
        if (!iso) return 'Data di nascita non valida.';
        return null;
    }

    setValue(v) {
        this._value = this._normalize(v || '');
        if (this._value) {
            const d = this._parse(this._value);
            this._viewYear = d.getFullYear();
            this._viewMonth = d.getMonth();
            this._viewDecade = Math.floor(this._viewYear / 12) * 12;
        }
        this._setInvalid(false);
        this._updateBtn();
        if (this._isOpen) this._renderPanel();
    }

    _normalize(v) {
        const s = String(v || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
        const [y, m, d] = s.split('-').map(Number);
        if (m < 1 || m > 12 || d < 1 || d > 31) return '';
        const dt = new Date(y, m - 1, d);
        if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
        if (this.max && s > this.max) return '';
        return s;
    }

    _parse(iso) {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    _toIso(y, m, d) {
        return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    _formatIT(iso) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    }

    _maskDigits(digits, addTrailingSlash) {
        const d = String(digits || '').replace(/\D/g, '').slice(0, 8);
        let out = '';
        if (d.length <= 2) {
            out = d;
            if (addTrailingSlash && d.length === 2) out += '/';
        } else if (d.length <= 4) {
            out = d.slice(0, 2) + '/' + d.slice(2);
            if (addTrailingSlash && d.length === 4) out += '/';
        } else {
            out = d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
        }
        return out;
    }

    _digitsFromMasked(s) {
        return String(s || '').replace(/\D/g, '').slice(0, 8);
    }

    _parseIT(masked) {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(masked || '').trim());
        if (!m) return '';
        const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';
        const dt = new Date(yyyy, mm - 1, dd);
        if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return '';
        const iso = this._toIso(yyyy, mm - 1, dd);
        if (this.max && iso > this.max) return '';
        return iso;
    }

    _setInvalid(on) {
        if (!this.btn) return;
        this.btn.classList.toggle('invalid', !!on);
        if (this.input) this.input.setAttribute('aria-invalid', on ? 'true' : 'false');
    }

    _applyTypedValue() {
        const digits = this._digitsFromMasked(this.input.value);
        if (digits.length === 0) {
            this._setInvalid(false);
            if (this._value) {
                this._value = '';
                this.onChange(this._value);
            }
            return;
        }
        if (digits.length < 8) {
            this._setInvalid(false);
            if (this._value) {
                this._value = '';
                this.onChange(this._value);
            }
            return;
        }
        const iso = this._parseIT(this._maskDigits(digits, false));
        if (!iso) {
            this._setInvalid(true);
            if (this._value) {
                this._value = '';
                this.onChange(this._value);
            }
            return;
        }
        this._setInvalid(false);
        if (iso !== this._value) {
            this._value = iso;
            const d = this._parse(iso);
            this._viewYear = d.getFullYear();
            this._viewMonth = d.getMonth();
            this._viewDecade = Math.floor(this._viewYear / 12) * 12;
            this.onChange(this._value);
            if (this._isOpen) this._renderPanel();
        }
    }

    _cap(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    }

    _maxParts() {
        if (!this.max) return null;
        const [y, m, d] = this.max.split('-').map(Number);
        return { y, m: m - 1, d };
    }

    _updateBtn() {
        this.input.value = this._value ? this._formatIT(this._value) : '';
    }

    _bindEvents() {
        this.iconBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._toggle();
        });

        this.input.addEventListener('click', (e) => e.stopPropagation());
        this.input.addEventListener('focus', (e) => e.stopPropagation());

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' || e.key === 'Delete') this._deleting = true;
            if (e.key === 'Escape' && this._isOpen) {
                this._close();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                this._applyTypedValue();
                if (this._value) this._close();
            }
            if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
            }
        });

        this.input.addEventListener('input', () => {
            const digits = this._digitsFromMasked(this.input.value);
            const masked = this._maskDigits(digits, !this._deleting);
            this._deleting = false;
            this.input.value = masked;
            this._applyTypedValue();
        });

        this.input.addEventListener('blur', () => {
            const digits = this._digitsFromMasked(this.input.value);
            if (this._value) {
                this.input.value = this._formatIT(this._value);
                this._setInvalid(false);
            } else if (digits.length > 0) {
                this._setInvalid(true);
                this.input.value = this._maskDigits(digits, false);
            } else {
                this._setInvalid(false);
                this.input.value = '';
            }
        });

        this.input.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text') || '';
            const digits = this._digitsFromMasked(text);
            this.input.value = this._maskDigits(digits, true);
            this._applyTypedValue();
        });

        document.addEventListener('click', (e) => {
            if (!this._isOpen) return;
            if (!this.el.contains(e.target)) this._close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._isOpen) this._close();
        });
    }

    _toggle() {
        if (this._isOpen) this._close();
        else this._open();
    }

    _open() {
        if (typeof CustomSelect !== 'undefined' && CustomSelect.closeAll) CustomSelect.closeAll();
        CustomDate.closeAll(this);
        this._isOpen = true;
        this._mode = 'days';
        this.btn.classList.add('active');
        this._renderPanel();
        this.panel.classList.add('open');
        const rect = this.el.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        this.panel.classList.toggle('up', spaceBelow < 320 && rect.top > spaceBelow);
    }

    _close() {
        this._isOpen = false;
        this._mode = 'days';
        this.btn.classList.remove('active');
        this.panel.classList.remove('open', 'up');
    }

    _renderPanel() {
        if (this._mode === 'months') this._renderMonths();
        else if (this._mode === 'years') this._renderYears();
        else this._renderDays();
    }

    _headHtml(title, upLevel) {
        return `
            <div class="cdate-head">
                <button type="button" class="cdate-nav" data-nav="-1" aria-label="Precedente">‹</button>
                <button type="button" class="cdate-title${upLevel ? ' clickable' : ''}" data-act="title">${title}</button>
                <button type="button" class="cdate-nav" data-nav="1" aria-label="Successivo">›</button>
            </div>`;
    }

    _footHtml() {
        return `
            <div class="cdate-foot">
                <button type="button" class="cdate-clear" data-act="clear">Cancella</button>
                <button type="button" class="cdate-today-btn" data-act="today">Oggi</button>
            </div>`;
    }

    _bindCommon() {
        const todayIso = this._toIso(
            new Date().getFullYear(),
            new Date().getMonth(),
            new Date().getDate()
        );

        this.panel.querySelectorAll('[data-nav]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const delta = Number(btn.getAttribute('data-nav'));
                if (this._mode === 'days') {
                    this._viewMonth += delta;
                    if (this._viewMonth < 0) { this._viewMonth = 11; this._viewYear--; }
                    if (this._viewMonth > 11) { this._viewMonth = 0; this._viewYear++; }
                } else if (this._mode === 'months') {
                    this._viewYear += delta;
                } else {
                    this._viewDecade += delta * 12;
                }
                this._renderPanel();
            });
        });

        const titleBtn = this.panel.querySelector('[data-act="title"]');
        if (titleBtn) {
            titleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this._mode === 'days') {
                    this._mode = 'months';
                    this._renderPanel();
                } else if (this._mode === 'months') {
                    this._viewDecade = Math.floor(this._viewYear / 12) * 12;
                    this._mode = 'years';
                    this._renderPanel();
                }
            });
        }

        const clearBtn = this.panel.querySelector('[data-act="clear"]');
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._value = '';
                this._updateBtn();
                this.onChange(this._value);
                this._close();
            });
        }

        const todayBtn = this.panel.querySelector('[data-act="today"]');
        if (todayBtn) {
            todayBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.max && todayIso > this.max) return;
                this._value = todayIso;
                const d = this._parse(todayIso);
                this._viewYear = d.getFullYear();
                this._viewMonth = d.getMonth();
                this._viewDecade = Math.floor(this._viewYear / 12) * 12;
                this._mode = 'days';
                this._updateBtn();
                this.onChange(this._value);
                this._close();
            });
        }
    }

    _renderDays() {
        const y = this._viewYear;
        const m = this._viewMonth;
        const todayIso = this._toIso(
            new Date().getFullYear(),
            new Date().getMonth(),
            new Date().getDate()
        );

        const first = new Date(y, m, 1);
        const startPad = (first.getDay() + 6) % 7;
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const daysPrev = new Date(y, m, 0).getDate();

        const weekHtml = CustomDate.WEEK.map(w =>
            `<span class="${w.weekend ? 'weekend' : ''}">${w.label}</span>`
        ).join('');

        const cells = [];
        for (let i = 0; i < startPad; i++) {
            const day = daysPrev - startPad + i + 1;
            const pm = m === 0 ? 11 : m - 1;
            const py = m === 0 ? y - 1 : y;
            cells.push({ y: py, m: pm, d: day, muted: true });
        }
        for (let d = 1; d <= daysInMonth; d++) {
            cells.push({ y, m, d, muted: false });
        }
        while (cells.length % 7 !== 0 || cells.length < 42) {
            const i = cells.length - (startPad + daysInMonth);
            const nm = m === 11 ? 0 : m + 1;
            const ny = m === 11 ? y + 1 : y;
            cells.push({ y: ny, m: nm, d: i + 1, muted: true });
            if (cells.length >= 42) break;
        }

        const daysHtml = cells.map((c, i) => {
            const iso = this._toIso(c.y, c.m, c.d);
            const dow = i % 7; // 0=lun … 5=sab, 6=dom
            const weekend = dow === 5 || dow === 6;
            const festa = CustomDate.holidayName(c.y, c.m, c.d);
            const cls = [
                'cdate-day',
                c.muted ? 'muted' : '',
                weekend ? 'weekend' : '',
                festa ? 'holiday' : '',
                iso === this._value ? 'selected' : '',
                iso === todayIso ? 'today' : '',
            ].filter(Boolean).join(' ');
            const disabled = this.max && iso > this.max;
            const title = festa ? ` title="${festa.replace(/"/g, '&quot;')}"` : '';
            return `<button type="button" class="${cls}" data-iso="${iso}"${title} ${disabled ? 'disabled' : ''}>${c.d}</button>`;
        }).join('');

        this.panel.innerHTML = `
            ${this._headHtml(`${this._cap(CustomDate.MONTHS[m])} ${y}`, true)}
            <div class="cdate-week">${weekHtml}</div>
            <div class="cdate-grid">${daysHtml}</div>
            ${this._footHtml()}
        `;

        this._bindCommon();

        this.panel.querySelectorAll('.cdate-day').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.disabled) return;
                this._value = btn.getAttribute('data-iso') || '';
                this._updateBtn();
                this.onChange(this._value);
                this._close();
            });
        });
    }

    _renderMonths() {
        const y = this._viewYear;
        const max = this._maxParts();
        const now = new Date();
        const curY = now.getFullYear();
        const curM = now.getMonth();
        let selY = null, selM = null;
        if (this._value) {
            const d = this._parse(this._value);
            selY = d.getFullYear();
            selM = d.getMonth();
        }

        const monthsHtml = CustomDate.MONTHS_SHORT.map((label, idx) => {
            const disabled = max && (y > max.y || (y === max.y && idx > max.m));
            const cls = [
                'cdate-cell',
                idx === curM && y === curY ? 'today' : '',
                selY === y && selM === idx ? 'selected' : '',
            ].filter(Boolean).join(' ');
            return `<button type="button" class="${cls}" data-month="${idx}" ${disabled ? 'disabled' : ''}>${this._cap(label)}</button>`;
        }).join('');

        this.panel.innerHTML = `
            ${this._headHtml(String(y), true)}
            <div class="cdate-grid cdate-grid-months">${monthsHtml}</div>
            ${this._footHtml()}
        `;

        this._bindCommon();

        this.panel.querySelectorAll('[data-month]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.disabled) return;
                this._viewMonth = Number(btn.getAttribute('data-month'));
                this._mode = 'days';
                this._renderPanel();
            });
        });
    }

    _renderYears() {
        const start = this._viewDecade;
        const end = start + 11;
        const max = this._maxParts();
        const curY = new Date().getFullYear();
        let selY = null;
        if (this._value) selY = this._parse(this._value).getFullYear();

        const yearsHtml = Array.from({ length: 12 }, (_, i) => {
            const year = start + i;
            const disabled = max && year > max.y;
            const cls = [
                'cdate-cell',
                year === curY ? 'today' : '',
                year === selY ? 'selected' : '',
            ].filter(Boolean).join(' ');
            return `<button type="button" class="${cls}" data-year="${year}" ${disabled ? 'disabled' : ''}>${year}</button>`;
        }).join('');

        this.panel.innerHTML = `
            ${this._headHtml(`${start} – ${end}`, false)}
            <div class="cdate-grid cdate-grid-years">${yearsHtml}</div>
            ${this._footHtml()}
        `;

        this._bindCommon();

        this.panel.querySelectorAll('[data-year]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.disabled) return;
                this._viewYear = Number(btn.getAttribute('data-year'));
                this._mode = 'months';
                this._renderPanel();
            });
        });
    }
}

if (typeof CustomSelect !== 'undefined') {
    const _origOpen = CustomSelect.prototype._open;
    if (_origOpen && !CustomSelect.prototype._cdatePatched) {
        CustomSelect.prototype._open = function (...args) {
            CustomDate.closeAll();
            return _origOpen.apply(this, args);
        };
        CustomSelect.prototype._cdatePatched = true;
    }
}
