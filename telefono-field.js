'use strict';
/**
 * TelefonoField — prefisso internazionale + numero
 *
 * Uso:
 *   const tf = await TelefonoField.create(containerEl, { value: { telefonoPrefisso, telefono } });
 *   tf.getValue() // { telefonoPrefisso: '+39', telefono: '333.1234 5678' }
 *   tf.setValue({ telefonoPrefisso, telefono })
 */
class TelefonoField {
    static _dataPromise = null;
    static DEFAULT_PREFISSO = '+39';

    static loadData() {
        if (this._dataPromise) return this._dataPromise;
        this._dataPromise = fetch('/files/prefissi.json')
            .then(r => r.json())
            .then(rows => {
                const mapped = rows.map((r, i) => ({
                    value: `${r.prefisso}|${r.paese}`,
                    label: r.prefisso,
                    sublabel: r.paese,
                    prefisso: r.prefisso,
                    paese: r.paese,
                    _i: i,
                }));
                const isIT = (o) => o.prefisso.replace(/\s/g, '') === '+39';
                const it = mapped.filter(isIT);
                // preferisci Italia se presente più di un +39
                const first = it.find(o => o.paese === 'Italia') || it[0];
                const rest = mapped
                    .filter(o => o !== first)
                    .sort((a, b) => {
                        const byPref = a.prefisso.localeCompare(b.prefisso, 'it', { numeric: true, sensitivity: 'base' });
                        if (byPref !== 0) return byPref;
                        return a.paese.localeCompare(b.paese, 'it', { sensitivity: 'base' });
                    });
                return first ? [first, ...rest] : rest;
            });
        return this._dataPromise;
    }

    static async create(el, cfg = {}) {
        const options = await this.loadData();
        return new TelefonoField(el, options, cfg);
    }

    static digitsOnly(s) {
        return String(s || '').replace(/\D/g, '');
    }

    /** +39: XXX.XXXX … (3 cifre, punto, 4 cifre, spazio, resto) */
    static formatIT(digits) {
        const d = TelefonoField.digitsOnly(digits);
        if (d.length <= 3) return d;
        const head = d.slice(0, 3) + '.';
        const rest = d.slice(3);
        if (rest.length <= 4) return head + rest;
        return head + rest.slice(0, 4) + ' ' + rest.slice(4);
    }

    static formatNumber(prefisso, raw) {
        const digits = TelefonoField.digitsOnly(raw);
        if ((prefisso || '').replace(/\s/g, '') === '+39') {
            return TelefonoField.formatIT(digits);
        }
        return digits;
    }

    static formatDisplay(prefisso, numero) {
        const n = (numero || '').trim();
        if (!n) return '';
        const p = (prefisso || '').trim();
        if (!p) return n;
        return `${p} ${n}`;
    }

    constructor(el, options, cfg = {}) {
        this.el = typeof el === 'string' ? document.querySelector(el) : el;
        if (!this.el) return;
        this.options = options;
        this.onChange = cfg.onChange || (() => {});
        this.el.classList.add('tel-field');
        this.el._telefono = this;

        this.el.innerHTML = `
            <div class="tel-row">
                <div class="tel-prefisso csel csel-prefisso"></div>
                <input type="tel" class="tel-numero" inputmode="numeric" autocomplete="tel-national" placeholder="">
            </div>
        `;

        const defaultOpt = this.options.find(o => o.prefisso === TelefonoField.DEFAULT_PREFISSO)
            || this.options[0];
        this._prefissoKey = defaultOpt ? defaultOpt.value : '';

        this.prefCs = new CustomSelect(
            this.el.querySelector('.tel-prefisso'),
            this.options,
            (value) => {
                // svuota il numero solo quando viene scelto un prefisso (non durante la ricerca)
                if (value) {
                    this.numInput.value = '';
                }
                this._syncPaesePlaceholder();
                this.onChange(this.getValue());
            },
            {
                placeholder: 'Prefisso',
                showImages: false,
                searchable: true,
                showBtnSublabel: false,
                showOptionSublabel: false,
                value: this._prefissoKey,
            }
        );
        this._fitPrefissoWidth();

        this.numInput = this.el.querySelector('.tel-numero');
        // Collega la label al campo numero (non al prefisso, primo focusable)
        if (this.el.id) {
            this.numInput.id = this.el.id + 'Numero';
            const label = document.querySelector(`label[for="${this.el.id}"]`);
            if (label) label.setAttribute('for', this.numInput.id);
        }
        this.numInput.addEventListener('input', () => this._onNumeroInput());
        this.numInput.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            this._applyDigits(TelefonoField.digitsOnly(text));
        });
        this.numInput.addEventListener('keydown', (e) => {
            // consenti controlli / frecce / tab
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const ok = ['Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
                'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key);
            if (ok) return;
            if (!/^\d$/.test(e.key)) e.preventDefault();
        });

        if (cfg.value) this.setValue(cfg.value);
        else this._syncPaesePlaceholder();
    }

    _currentOpt() {
        const key = this.prefCs.getValue();
        return this.options.find(o => o.value === key) || null;
    }

    _currentPrefisso() {
        const opt = this._currentOpt();
        return opt ? opt.prefisso : TelefonoField.DEFAULT_PREFISSO;
    }

    _syncPaesePlaceholder() {
        const opt = this._currentOpt();
        this.numInput.placeholder = opt ? opt.paese : 'Numero';
    }

    /** Larghezza = prefisso più lungo + freccia / padding */
    _fitPrefissoWidth() {
        const wrap = this.el.querySelector('.tel-prefisso');
        if (!wrap) return;
        const maxLen = this.options.reduce((m, o) => Math.max(m, String(o.label || '').length), 3);
        // ch ≈ larghezza carattere monospazio; + freccia e padding del bottone
        const w = `calc(${maxLen}ch + 2.25rem)`;
        wrap.style.width = w;
        wrap.style.flexBasis = w;
        wrap.style.minWidth = w;
    }

    _reformatNumero() {
        const digits = TelefonoField.digitsOnly(this.numInput.value);
        this.numInput.value = TelefonoField.formatNumber(this._currentPrefisso(), digits);
    }

    _applyDigits(digits) {
        this.numInput.value = TelefonoField.formatNumber(this._currentPrefisso(), digits);
        this.onChange(this.getValue());
    }

    _onNumeroInput() {
        const el = this.numInput;
        const start = el.selectionStart;
        const before = el.value;
        const digitsBefore = TelefonoField.digitsOnly(before.slice(0, start)).length;
        const formatted = TelefonoField.formatNumber(this._currentPrefisso(), before);
        el.value = formatted;
        // riposiziona cursore in base alle cifre
        let pos = 0;
        let seen = 0;
        while (pos < formatted.length && seen < digitsBefore) {
            if (/\d/.test(formatted[pos])) seen++;
            pos++;
        }
        el.setSelectionRange(pos, pos);
        this.onChange(this.getValue());
    }

    getValue() {
        // rileggi sempre dal DOM (evita riferimenti stale)
        const input = this.numInput || this.el.querySelector('.tel-numero');
        const telefonoPrefisso = this._currentPrefisso();
        const telefono = TelefonoField.formatNumber(telefonoPrefisso, input ? input.value : '');
        return { telefonoPrefisso, telefono };
    }

    setValue(data) {
        const d = data || {};
        let prefisso = String(d.telefonoPrefisso || '').trim() || TelefonoField.DEFAULT_PREFISSO;
        prefisso = prefisso.replace(/\s/g, '');
        // se manca la chiave paese, prendi la prima con quel prefisso (Italia per +39)
        let opt = this.options.find(o => o.value === d.telefonoPrefissoKey)
            || this.options.find(o => o.prefisso.replace(/\s/g, '') === prefisso && o.paese === 'Italia')
            || this.options.find(o => o.prefisso.replace(/\s/g, '') === prefisso)
            || this.options[0];
        if (opt) {
            this.prefCs.setValue(opt.value);
        }
        this.numInput.value = TelefonoField.formatNumber(
            opt ? opt.prefisso : prefisso,
            d.telefono || ''
        );
        this._syncPaesePlaceholder();
    }
}
