/**
 * CustomSelect — Dropdown personalizzato
 *
 * Uso:
 *   const cs = new CustomSelect(containerEl, options, onChange, {placeholder, small, showImages});
 *   cs.getValue()
 *   cs.setValue(value)
 *   cs.setOptions(options)
 *
 * options: [{value, label, group?, img?}]
 */
class CustomSelect {
    static _instances = [];

    constructor(el, options, onChange, cfg = {}) {
        this.el          = typeof el === 'string' ? document.querySelector(el) : el;
        this.options     = options || [];
        this.onChange    = onChange || (() => {});
        this.placeholder = cfg.placeholder || '— Seleziona —';
        this.showImages  = cfg.showImages !== false;
        this._value      = cfg.value || '';
        this._isOpen     = false;

        this.el.classList.add('csel');
        if (cfg.small) this.el.classList.add('csel-sm');

        // Bottone
        this.btn = document.createElement('button');
        this.btn.type = 'button';
        this.btn.className = 'csel-btn';
        this.el.appendChild(this.btn);

        // Pannello
        this.panel = document.createElement('div');
        this.panel.className = 'csel-panel';
        this.el.appendChild(this.panel);

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

    _renderOptions() {
        this.panel.innerHTML = '';
        let lastGroup = null;
        for (const opt of this.options) {
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
            if (opt.img && this.showImages) {
                const img = document.createElement('img');
                img.src = opt.img;
                img.className = 'csel-opt-img';
                img.alt = '';
                item.appendChild(img);
            }
            const span = document.createElement('span');
            span.textContent = opt.label;
            item.appendChild(span);
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const prev = this._value;
                this._value = opt.value;
                this._renderOptions();
                this._updateBtn();
                this._close();
                if (prev !== opt.value) this.onChange(opt.value, opt.label);
            });
            this.panel.appendChild(item);
        }
    }

    _updateBtn() {
        this.btn.innerHTML = '';
        const opt = this.options.find(o => o.value === this._value);
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
        const arrow = document.createElement('span');
        arrow.className = 'csel-arrow';
        arrow.textContent = '▾';
        this.btn.appendChild(arrow);
    }

    _open() {
        this._isOpen = true;
        this.btn.classList.add('active');
        this.panel.classList.add('open');
        // Controlla spazio disponibile
        const rect = this.el.getBoundingClientRect();
        if (window.innerHeight - rect.bottom < 220 && rect.top > 220)
            this.panel.classList.add('up');
        else
            this.panel.classList.remove('up');
        // Scrolla all'opzione selezionata
        const sel = this.panel.querySelector('.selected');
        if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    _close() {
        this._isOpen = false;
        this.btn.classList.remove('active');
        this.panel.classList.remove('open');
    }

    _bindEvents() {
        this.btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._isOpen) { this._close(); return; }
            CustomSelect.closeAll(this);
            this._open();
        });
    }

    getValue()           { return this._value; }
    setValue(v)          { this._value = v; this._updateBtn(); this._renderOptions(); }
    setOptions(opts, v)  { this.options = opts; if (v !== undefined) this._value = v; this._renderOptions(); this._updateBtn(); }
}

// Chiude al click esterno
document.addEventListener('click', () => CustomSelect.closeAll());

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
    { group: "Ufficiali Generali",         value: "Generale di Corpo d'Armata", label: "Generale di Corpo d'Armata" },
    { group: "Ufficiali Generali",         value: "Generale di Divisione",      label: "Generale di Divisione" },
    { group: "Ufficiali Generali",         value: "Generale di Brigata",        label: "Generale di Brigata" },
    { group: "Ufficiali Superiori",        value: "Colonnello",                 label: "Colonnello" },
    { group: "Ufficiali Superiori",        value: "Tenente Colonnello",         label: "Tenente Colonnello" },
    { group: "Ufficiali Superiori",        value: "Maggiore",                   label: "Maggiore" },
    { group: "Ufficiali Inferiori",        value: "Capitano",                   label: "Capitano" },
    { group: "Ufficiali Inferiori",        value: "Tenente",                    label: "Tenente" },
    { group: "Ufficiali Inferiori",        value: "Sottotenente",               label: "Sottotenente" },
    { group: "Ispettori",                  value: "Luogotenente \"Carica Speciale\"", label: "Luogotenente \"Carica Speciale\"" },
    { group: "Ispettori",                  value: "Luogotenente",               label: "Luogotenente" },
    { group: "Ispettori",                  value: "Maresciallo Maggiore",       label: "Maresciallo Maggiore" },
    { group: "Ispettori",                  value: "Maresciallo Capo",           label: "Maresciallo Capo" },
    { group: "Ispettori",                  value: "Maresciallo Ordinario",      label: "Maresciallo Ordinario" },
    { group: "Ispettori",                  value: "Maresciallo",                label: "Maresciallo" },
    { group: "Sovrintendenti – Brigadieri", value: "Brigadiere Capo \"Qualifica Speciale\"", label: "Brigadiere Capo \"Qualifica Speciale\"" },
    { group: "Sovrintendenti – Brigadieri", value: "Brigadiere Capo",          label: "Brigadiere Capo" },
    { group: "Sovrintendenti – Brigadieri", value: "Brigadiere",               label: "Brigadiere" },
    { group: "Sovrintendenti – Brigadieri", value: "Vicebrigadiere",           label: "Vicebrigadiere" },
    { group: "Appuntati e Carabinieri",    value: "Appuntato Scelto \"Qualifica Speciale\"", label: "Appuntato Scelto \"Qualifica Speciale\"" },
    { group: "Appuntati e Carabinieri",    value: "Appuntato Scelto",          label: "Appuntato Scelto" },
    { group: "Appuntati e Carabinieri",    value: "Appuntato",                 label: "Appuntato" },
    { group: "Appuntati e Carabinieri",    value: "Carabiniere Scelto",        label: "Carabiniere Scelto" },
    { group: "Appuntati e Carabinieri",    value: "Carabiniere",               label: "Carabiniere" },
].map(o => ({ ...o, img: GRADO_IMG_MAP[o.value] ? `/immagini/gradi/${encodeURIComponent(GRADO_IMG_MAP[o.value])}` : undefined }));

const RUOLI_OPTIONS = [
    { value: 'reader',     label: 'Reader' },
    { value: 'user',       label: 'Utente' },
    { value: 'admin',      label: 'Amministratore' },
    { value: 'superadmin', label: 'Super Admin' },
];
