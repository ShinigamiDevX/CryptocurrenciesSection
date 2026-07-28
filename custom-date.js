/**
 * CustomDate — Calendario personalizzato (tema portale)
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
    static WEEK = [
        { label: 'lun', weekend: false },
        { label: 'mar', weekend: false },
        { label: 'mer', weekend: false },
        { label: 'gio', weekend: false },
        { label: 'ven', weekend: false },
        { label: 'sab', weekend: true },
        { label: 'dom', weekend: true },
    ];

    constructor(el, cfg = {}) {
        this.el = typeof el === 'string' ? document.querySelector(el) : el;
        if (!this.el) return;
        this.onChange = cfg.onChange || (() => {});
        this.placeholder = cfg.placeholder || 'gg / mm / aaaa';
        this.max = cfg.max || ''; // YYYY-MM-DD opzionale
        this._value = this._normalize(cfg.value || '');
        this._isOpen = false;

        const base = this._value ? this._parse(this._value) : new Date();
        this._viewYear = base.getFullYear();
        this._viewMonth = base.getMonth();

        this.el.classList.add('cdate');
        this.el._cdate = this;

        this.btn = document.createElement('button');
        this.btn.type = 'button';
        this.btn.className = 'cdate-btn';
        this.btn.innerHTML = `
            <span class="cdate-label"></span>
            <span class="cdate-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <rect x="3" y="5" width="18" height="16" rx="2"/>
                    <path d="M3 10h18M8 3v4M16 3v4"/>
                </svg>
            </span>`;
        this.labelEl = this.btn.querySelector('.cdate-label');
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

    getValue() { return this._value; }

    setValue(v) {
        this._value = this._normalize(v || '');
        if (this._value) {
            const d = this._parse(this._value);
            this._viewYear = d.getFullYear();
            this._viewMonth = d.getMonth();
        }
        this._updateBtn();
        if (this._isOpen) this._renderPanel();
    }

    _normalize(v) {
        const s = String(v || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
        const d = this._parse(s);
        if (Number.isNaN(d.getTime())) return '';
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

    _updateBtn() {
        if (this._value) {
            this.labelEl.textContent = this._formatIT(this._value);
            this.labelEl.classList.remove('cdate-placeholder');
        } else {
            this.labelEl.textContent = this.placeholder;
            this.labelEl.classList.add('cdate-placeholder');
        }
    }

    _bindEvents() {
        this.btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._toggle();
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
        this.btn.classList.add('active');
        this._renderPanel();
        this.panel.classList.add('open');
        // flip se poco spazio sotto
        const rect = this.el.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        this.panel.classList.toggle('up', spaceBelow < 320 && rect.top > spaceBelow);
    }

    _close() {
        this._isOpen = false;
        this.btn.classList.remove('active');
        this.panel.classList.remove('open', 'up');
    }

    _renderPanel() {
        const y = this._viewYear;
        const m = this._viewMonth;
        const todayIso = this._toIso(
            new Date().getFullYear(),
            new Date().getMonth(),
            new Date().getDate()
        );

        const first = new Date(y, m, 1);
        // lunedì = 0
        let startPad = (first.getDay() + 6) % 7;
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const daysPrev = new Date(y, m, 0).getDate();

        let weekHtml = CustomDate.WEEK.map(w =>
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

        const daysHtml = cells.map(c => {
            const iso = this._toIso(c.y, c.m, c.d);
            const cls = [
                'cdate-day',
                c.muted ? 'muted' : '',
                iso === this._value ? 'selected' : '',
                iso === todayIso ? 'today' : '',
            ].filter(Boolean).join(' ');
            const disabled = this.max && iso > this.max;
            return `<button type="button" class="${cls}" data-iso="${iso}" ${disabled ? 'disabled' : ''}>${c.d}</button>`;
        }).join('');

        this.panel.innerHTML = `
            <div class="cdate-head">
                <button type="button" class="cdate-nav" data-nav="-1" aria-label="Mese precedente">‹</button>
                <div class="cdate-title">${CustomDate.MONTHS[m]} ${y}</div>
                <button type="button" class="cdate-nav" data-nav="1" aria-label="Mese successivo">›</button>
            </div>
            <div class="cdate-week">${weekHtml}</div>
            <div class="cdate-grid">${daysHtml}</div>
            <div class="cdate-foot">
                <button type="button" class="cdate-clear" data-act="clear">Cancella</button>
                <button type="button" class="cdate-today-btn" data-act="today">Oggi</button>
            </div>
        `;

        this.panel.querySelectorAll('[data-nav]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const delta = Number(btn.getAttribute('data-nav'));
                this._viewMonth += delta;
                if (this._viewMonth < 0) { this._viewMonth = 11; this._viewYear--; }
                if (this._viewMonth > 11) { this._viewMonth = 0; this._viewYear++; }
                this._renderPanel();
            });
        });

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

        this.panel.querySelector('[data-act="clear"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this._value = '';
            this._updateBtn();
            this.onChange(this._value);
            this._close();
        });

        this.panel.querySelector('[data-act="today"]').addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.max && todayIso > this.max) return;
            this._value = todayIso;
            const d = this._parse(todayIso);
            this._viewYear = d.getFullYear();
            this._viewMonth = d.getMonth();
            this._updateBtn();
            this.onChange(this._value);
            this._close();
        });
    }
}

// Chiudi i date quando si apre un CustomSelect
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
