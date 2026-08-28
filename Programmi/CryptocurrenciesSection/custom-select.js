/**
 * CustomSelect — Dropdown personalizzato
 *
 * Uso:
 *   const cs = new CustomSelect(containerEl, options, onChange, {placeholder, small, showImages, searchable});
 *   cs.getValue()
 *   cs.setValue(value)
 *   cs.setOptions(options)
 *
 * options: [{value, label, group?, img?, sublabel?}]
 */
class CustomSelect {
    static _instances = [];

    constructor(el, options, onChange, cfg = {}) {
        this.el          = typeof el === 'string' ? document.querySelector(el) : el;
        this.options     = options || [];
        this.onChange    = onChange || (() => {});
        this.placeholder = cfg.placeholder || '— Seleziona —';
        this.showImages  = cfg.showImages !== false;
        // Di default tutti i menu sono digitabili (filtro mentre si scrive)
        this.searchable  = cfg.searchable !== false;
        this.showBtnSublabel = cfg.showBtnSublabel !== false;
        this.showOptionSublabel = cfg.showOptionSublabel !== false;
        this._value      = cfg.value || '';
        this._isOpen     = false;
        this._filter     = '';
        this._portal     = true;

        this.el.classList.add('csel');
        if (cfg.small) this.el.classList.add('csel-sm');
        if (this.searchable) this.el.classList.add('csel-searchable');

        // Trigger (button o input ricercabile)
        if (this.searchable) {
            this.btn = document.createElement('div');
            this.btn.className = 'csel-btn csel-combo';
            this.input = document.createElement('input');
            this.input.type = 'text';
            this.input.className = 'csel-input';
            this.input.autocomplete = 'off';
            this.input.spellcheck = false;
            this.input.placeholder = this.placeholder;
            this.btn.appendChild(this.input);
            this.subEl = document.createElement('span');
            this.subEl.className = 'csel-sublabel';
            this.subEl.hidden = true;
            this.btn.appendChild(this.subEl);
            const arrow = document.createElement('span');
            arrow.className = 'csel-arrow';
            arrow.textContent = '▾';
            this.btn.appendChild(arrow);
        } else {
            this.btn = document.createElement('button');
            this.btn.type = 'button';
            this.btn.className = 'csel-btn';
        }
        this.el.appendChild(this.btn);

        // Pannello (sempre su body — evita stacking/overflow delle modali)
        this.panel = document.createElement('div');
        this.panel.className = 'csel-panel csel-panel-portal';
        Object.assign(this.panel.style, {
            background: '#030E1C',
            backgroundColor: '#030E1C',
            opacity: '1',
            zIndex: '30000',
        });
        document.body.appendChild(this.panel);

        this._renderOptions();
        this._updateBtn();
        this._bindEvents();

        CustomSelect._instances.push(this);
    }

    static closeAll(except) {
        for (const inst of CustomSelect._instances) {
            if (inst !== except) inst._close();
        }
    }

    static _norm(s) {
        return String(s || '')
            .toLocaleLowerCase('it')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    _filteredOptions() {
        if (!this.searchable || !this._filter.trim()) return this.options;
        const q = CustomSelect._norm(this._filter.trim());
        const qDigits = q.replace(/^\+/, '');
        const wordStarts = (text) => text.split(/[\s"'./\-+]+/).some(w => w && w.startsWith(q));
        return this.options.filter(o => {
            const label = CustomSelect._norm(o.label);
            const value = CustomSelect._norm(o.value);
            const sub = CustomSelect._norm(o.sublabel);
            const labelDigits = label.replace(/^\+/, '');
            return label.startsWith(q)
                || value.startsWith(q)
                || wordStarts(label)
                || wordStarts(value)
                || (sub && (sub.startsWith(q) || wordStarts(sub)))
                || (qDigits && labelDigits.startsWith(qDigits));
        });
    }

    _appendSublabel(parent, text) {
        if (!text) return;
        const sub = document.createElement('span');
        sub.className = 'csel-sublabel';
        sub.textContent = text;
        parent.appendChild(sub);
    }

    _renderOptions() {
        this.panel.innerHTML = '';
        const list = this._filteredOptions();
        if (!list.length) {
            const empty = document.createElement('div');
            empty.className = 'csel-empty';
            empty.textContent = 'Nessun risultato';
            this.panel.appendChild(empty);
            return;
        }
        let lastGroup = null;
        for (const opt of list) {
            if (opt.group && opt.group !== lastGroup) {
                lastGroup = opt.group;
                const g = document.createElement('div');
                g.className = 'csel-group';
                g.textContent = opt.group;
                this.panel.appendChild(g);
            }
            const item = document.createElement('div');
            item.className = 'csel-option' + (opt.value === this._value ? ' selected' : '');
            item.dataset.value = opt.value;
            item.style.background = opt.value === this._value ? '#0d3550' : '#030E1C';
            item.style.backgroundColor = item.style.background;
            item.style.opacity = '1';
            if (opt.img && this.showImages) {
                const img = document.createElement('img');
                img.src = opt.img;
                img.className = 'csel-opt-img';
                img.alt = '';
                item.appendChild(img);
            }
            const span = document.createElement('span');
            span.className = 'csel-opt-label';
            span.textContent = opt.label;
            item.appendChild(span);
            if (this.showOptionSublabel) this._appendSublabel(item, opt.sublabel);
            item.addEventListener('mousedown', (e) => {
                // mousedown evita blur dell'input prima del click
                e.preventDefault();
                e.stopPropagation();
                const prev = this._value;
                this._value = opt.value;
                this._filter = '';
                this._renderOptions();
                this._updateBtn();
                this._close();
                if (prev !== opt.value) this.onChange(opt.value, opt.label, prev);
            });
            this.panel.appendChild(item);
        }
    }

    _updateBtn() {
        const opt = this.options.find(o => o.value === this._value);
        if (this.searchable) {
            if (this._isOpen && this._filter !== '') {
                // mentre digita lascia il testo filtro
                if (this.subEl) this.subEl.hidden = true;
                return;
            }
            this.input.value = opt ? opt.label : '';
            this.input.placeholder = this.placeholder;
            if (this.subEl) {
                if (this.showBtnSublabel && opt && opt.sublabel) {
                    this.subEl.textContent = opt.sublabel;
                    this.subEl.hidden = false;
                } else {
                    this.subEl.textContent = '';
                    this.subEl.hidden = true;
                }
            }
            return;
        }
        this.btn.innerHTML = '';
        const lbl = document.createElement('span');
        lbl.className = 'csel-label';
        if (opt) {
            if (opt.img && this.showImages) {
                const img = document.createElement('img');
                img.src = opt.img;
                img.className = 'csel-btn-img';
                img.alt = '';
                this.btn.appendChild(img);
            }
            lbl.textContent = opt.label;
        } else {
            lbl.className += ' csel-placeholder';
            lbl.textContent = this.placeholder;
        }
        this.btn.appendChild(lbl);
        if (this.showBtnSublabel && opt) this._appendSublabel(this.btn, opt.sublabel);
        const arrow = document.createElement('span');
        arrow.className = 'csel-arrow';
        arrow.textContent = '▾';
        this.btn.appendChild(arrow);
    }

    _positionPanel() {
        const rect = this.el.getBoundingClientRect();
        const maxH = 280;
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < 220 && rect.top > 220;
        // Stili opachi inline: immuni a CSS ereditati/cache
        Object.assign(this.panel.style, {
            position: 'fixed',
            left: `${Math.round(rect.left)}px`,
            width: `${Math.round(rect.width)}px`,
            right: 'auto',
            zIndex: '30000',
            background: '#030E1C',
            backgroundColor: '#030E1C',
            opacity: '1',
            mixBlendMode: 'normal',
            backdropFilter: 'none',
            webkitBackdropFilter: 'none',
            pointerEvents: 'auto',
        });
        if (openUp) {
            this.panel.classList.add('up');
            this.panel.style.top = 'auto';
            this.panel.style.bottom = `${Math.round(window.innerHeight - rect.top)}px`;
            this.panel.style.maxHeight = `${Math.min(maxH, Math.max(120, rect.top - 8))}px`;
        } else {
            this.panel.classList.remove('up');
            this.panel.style.bottom = 'auto';
            this.panel.style.top = `${Math.round(rect.bottom)}px`;
            this.panel.style.maxHeight = `${Math.min(maxH, Math.max(120, spaceBelow - 8))}px`;
        }
    }

    _open() {
        if (typeof CustomDate !== 'undefined' && CustomDate.closeAll) CustomDate.closeAll();
        // assicura che il pannello sia su body (sopra le modali)
        if (this.panel.parentNode !== document.body) {
            document.body.appendChild(this.panel);
        }
        this._isOpen = true;
        this.btn.classList.add('active');
        this.el.classList.add('csel-open');
        // Se il testo è solo l'etichetta già selezionata, mostra TUTTE le opzioni
        // (altrimenti "Amministratore" filtrerebbe via Reader/Utente/ecc.)
        const typed = this.searchable ? String(this.input.value || '') : '';
        const selectedOpt = this.options.find(o => o.value === this._value);
        const isJustSelectedLabel = !!(selectedOpt && typed === selectedOpt.label);
        this._filter = (typed && !isJustSelectedLabel) ? typed : '';
        this._renderOptions();
        // ogni opzione con sfondo pieno
        this.panel.querySelectorAll('.csel-option, .csel-group, .csel-empty').forEach(n => {
            n.style.background = '#030E1C';
            n.style.backgroundColor = '#030E1C';
            n.style.opacity = '1';
        });
        this._positionPanel();
        this.panel.classList.add('open');
        const sel = this.panel.querySelector('.selected');
        if (sel) sel.scrollIntoView({ block: 'nearest' });
        if (this.searchable) {
            this.input.focus();
            if (!typed || isJustSelectedLabel) {
                this.input.select();
            } else {
                const len = this.input.value.length;
                try { this.input.setSelectionRange(len, len); } catch {}
            }
        }
    }

    _close() {
        this._isOpen = false;
        this.btn.classList.remove('active');
        this.el.classList.remove('csel-open');
        this.panel.classList.remove('open', 'up');
        this._filter = '';
        this._updateBtn();
    }

    _bindEvents() {
        if (this.searchable) {
            this.input.addEventListener('focus', (e) => {
                e.stopPropagation();
                if (!this._isOpen) {
                    CustomSelect.closeAll(this);
                    this._open();
                }
            });
            this.input.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this._isOpen) {
                    CustomSelect.closeAll(this);
                    this._open();
                }
            });
            this.input.addEventListener('input', () => {
                this._filter = this.input.value;
                if (this.subEl) this.subEl.hidden = true;
                // digitando si invalida la selezione finché non sceglie
                if (this._value) {
                    const opt = this.options.find(o => o.value === this._value);
                    if (!opt || opt.label !== this.input.value) {
                        const prev = this._value;
                        this._value = '';
                        if (prev) this.onChange('', '');
                    }
                }
                if (!this._isOpen) {
                    CustomSelect.closeAll(this);
                    this._open();
                } else {
                    this._renderOptions();
                    this._positionPanel();
                }
            });
            this.input.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this._close();
                    this.input.blur();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const first = this.panel.querySelector('.csel-option');
                    if (first) first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                }
            });
        } else {
            this.btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this._isOpen) { this._close(); return; }
                CustomSelect.closeAll(this);
                this._open();
            });
        }

        this._onDocClick = (e) => {
            if (!this._isOpen) return;
            if (this.el.contains(e.target) || this.panel.contains(e.target)) return;
            this._close();
        };
        document.addEventListener('click', this._onDocClick);

        this._onScroll = () => {
            if (this._isOpen) this._positionPanel();
        };
        window.addEventListener('resize', this._onScroll);
        window.addEventListener('scroll', this._onScroll, true);
    }

    getValue()           { return this._value; }
    setValue(v)          { this._value = v || ''; this._filter = ''; this._updateBtn(); this._renderOptions(); }
    setOptions(opts, v)  {
        this.options = opts || [];
        if (v !== undefined) this._value = v;
        this._filter = '';
        this._renderOptions();
        this._updateBtn();
    }
}

// Chiude al click esterno (istanze non-searchable legacy path + searchable via _onDocClick)
document.addEventListener('click', () => {
    // non chiudere se il click è su un pannello portale
});

// ── Dati gradi (condivisi tra le pagine) ──────────────────────────────────────
const GRADO_IMG_MAP = {
    "Generale di Corpo d'Armata": "generale di corpo d'armata.webp",
    "Generale di Divisione":       "generale di divisione.webp",
    "Generale di Brigata":         "generale di brigata.webp",
    "Colonnello":                  "colonnello.webp",
    "Tenente Colonnello":          "tenente colonnello.webp",
    "Maggiore":                    "maggiore.webp",
    "Capitano":                    "capitano.webp",
    "Tenente":                     "tenente.webp",
    "Sottotenente":                "sotto tenente.webp",
    "Luogotenente \"Carica Speciale\"": "luogotenente carica speciale.png",
    "Luogotenente":                "Luogotenente.png",
    "Maresciallo Maggiore":        "maresciallo maggiore.webp",
    "Maresciallo Capo":            "maresciallo capo.webp",
    "Maresciallo Ordinario":       "maresciallo ordinario.webp",
    "Maresciallo":                 "maresciallo.webp",
    "Brigadiere Capo \"Qualifica Speciale\"": "brigadiere capo qualifica speciale.webp",
    "Brigadiere Capo":             "brigadiere capo.webp",
    "Brigadiere":                  "brigadiere.webp",
    "Vicebrigadiere":              "vice brigadiere.webp",
    "Appuntato Scelto \"Qualifica Speciale\"": "appuntato scelto qualifica speciale.png",
    "Appuntato Scelto":            "appuntato scelto.webp",
    "Appuntato":                   "appuntato.webp",
    "Carabiniere Scelto":          "carabiniere scelto.webp",
    "Carabiniere":                 "carabiniere.webp",
};

const GRADI_OPTIONS = [
    { group: "Ufficiali Generali",         value: "Generale di Corpo d'Armata",              label: "Generale di Corpo d'Armata" },
    { group: "Ufficiali Generali",         value: "Generale di Divisione",                   label: "Generale di Divisione" },
    { group: "Ufficiali Generali",         value: "Generale di Brigata",                     label: "Generale di Brigata" },
    { group: "Ufficiali Superiori",        value: "Colonnello",                              label: "Colonnello" },
    { group: "Ufficiali Superiori",        value: "Tenente Colonnello",                      label: "Tenente Colonnello" },
    { group: "Ufficiali Superiori",        value: "Maggiore",                                label: "Maggiore" },
    { group: "Ufficiali Inferiori",        value: "Capitano",                                label: "Capitano" },
    { group: "Ufficiali Inferiori",        value: "Tenente",                                 label: "Tenente" },
    { group: "Ufficiali Inferiori",        value: "Sottotenente",                            label: "Sottotenente" },
    { group: "Ispettori",                  value: "Luogotenente \"Carica Speciale\"",        label: "Luogotenente \"Carica Speciale\"" },
    { group: "Ispettori",                  value: "Luogotenente",                            label: "Luogotenente" },
    { group: "Ispettori",                  value: "Maresciallo Maggiore",                    label: "Maresciallo Maggiore" },
    { group: "Ispettori",                  value: "Maresciallo Capo",                        label: "Maresciallo Capo" },
    { group: "Ispettori",                  value: "Maresciallo Ordinario",                   label: "Maresciallo Ordinario" },
    { group: "Ispettori",                  value: "Maresciallo",                             label: "Maresciallo" },
    { group: "Sovrintendenti",             value: "Brigadiere Capo \"Qualifica Speciale\"",  label: "Brigadiere Capo \"Qualifica Speciale\"" },
    { group: "Sovrintendenti",             value: "Brigadiere Capo",                         label: "Brigadiere Capo" },
    { group: "Sovrintendenti",             value: "Brigadiere",                              label: "Brigadiere" },
    { group: "Sovrintendenti",             value: "Vicebrigadiere",                          label: "Vicebrigadiere" },
    { group: "Appuntati e Carabinieri",    value: "Appuntato Scelto \"Qualifica Speciale\"", label: "Appuntato Scelto \"Qualifica Speciale\"" },
    { group: "Appuntati e Carabinieri",    value: "Appuntato Scelto",                        label: "Appuntato Scelto" },
    { group: "Appuntati e Carabinieri",    value: "Appuntato",                               label: "Appuntato" },
    { group: "Appuntati e Carabinieri",    value: "Carabiniere Scelto",                      label: "Carabiniere Scelto" },
    { group: "Appuntati e Carabinieri",    value: "Carabiniere",                             label: "Carabiniere" },
].map(o => ({ ...o, img: GRADO_IMG_MAP[o.value] ? `/immagini/gradi/${encodeURIComponent(GRADO_IMG_MAP[o.value])}` : undefined }));

const RUOLI_OPTIONS = [
    { value: 'reader',     label: 'Reader' },
    { value: 'user',       label: 'Utente' },
    { value: 'admin',      label: 'Amministratore' },
    { value: 'superadmin', label: 'Super Admin' },
];
