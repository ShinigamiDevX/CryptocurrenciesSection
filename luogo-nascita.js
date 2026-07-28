/**
 * LuogoGeo — tipo Italia/Estero + provincia/comune (ricercabili) oppure stato
 * Opzionale: indirizzo + civico (residenza / domicilio)
 *
 * Gerarchia svuotamento (residenza/domicilio):
 *   civico     → nulla
 *   indirizzo  → civico
 *   comune     → indirizzo + civico
 *   provincia  → comune + indirizzo + civico
 *
 * Luogo di nascita: solo provincia → comune (niente indirizzo/civico)
 */
class LuogoGeo {
    static _dataPromise = null;

    static loadData() {
        if (this._dataPromise) return this._dataPromise;
        this._dataPromise = Promise.all([
            fetch('/files/province.json').then(r => r.json()),
            fetch('/files/comuni.json').then(r => r.json()),
            fetch('/files/stati.json').then(r => r.json()),
        ]).then(([province, comuni, stati]) => ({
            province,
            comuni,
            stati: stati.filter(s => s.sigla !== 'ITA'),
            comuniBySigla: comuni.reduce((acc, c) => {
                (acc[c.sigla] || (acc[c.sigla] = [])).push(c);
                return acc;
            }, {}),
        }));
        return this._dataPromise;
    }

    static async create(el, cfg = {}) {
        const data = await this.loadData();
        return new LuogoGeo(el, data, cfg);
    }

    /** Minuscole + iniziale maiuscola per ogni parola */
    static titleCase(s) {
        return String(s || '')
            .toLocaleLowerCase('it')
            .replace(/(^|[\s'/.-])(\S)/g, (_, a, b) => a + b.toLocaleUpperCase('it'));
    }

    constructor(el, data, cfg = {}) {
        this.el = typeof el === 'string' ? document.querySelector(el) : el;
        if (!this.el) return;
        this.data = data;
        this.prefix = cfg.prefix || 'luogoNascita';
        this.withAddress = !!cfg.withAddress;
        this.onChange = cfg.onChange || (() => {});
        this.ariaLabel = cfg.ariaLabel || 'Tipo luogo';
        this.el.classList.add('lnasc');
        this.el._lnasc = this;
        this.el._luogoGeo = this;

        this._tipo = '';
        this._provincia = '';
        this._comune = '';
        this._stato = '';
        this._indirizzo = '';
        this._civico = '';
        this._ready = false;

        const addrHtml = this.withAddress ? `
            <div class="lnasc-addr">
                <div class="lnasc-row">
                    <div class="lnasc-field lnasc-indirizzo">
                        <label>Indirizzo</label>
                        <input type="text" class="lnasc-input lnasc-indirizzo-input" autocomplete="street-address" placeholder="Via, piazza…">
                    </div>
                    <div class="lnasc-field lnasc-civico">
                        <label>Civico</label>
                        <input type="text" class="lnasc-input lnasc-civico-input" autocomplete="off" placeholder="N°">
                    </div>
                </div>
            </div>
        ` : '';

        this.el.innerHTML = `
            <div class="lnasc-tipo" role="group" aria-label="${this.ariaLabel}">
                <button type="button" class="lnasc-chip" data-tipo="IT">Italia</button>
                <button type="button" class="lnasc-chip" data-tipo="ESTERO">Estero</button>
            </div>
            <div class="lnasc-it" hidden>
                <div class="lnasc-row">
                    <div class="lnasc-field">
                        <label>Provincia</label>
                        <div class="lnasc-provincia csel"></div>
                    </div>
                    <div class="lnasc-field">
                        <label>Comune</label>
                        <div class="lnasc-comune csel"></div>
                    </div>
                </div>
            </div>
            <div class="lnasc-estero" hidden>
                <div class="lnasc-field">
                    <label>Stato</label>
                    <div class="lnasc-stato csel"></div>
                </div>
            </div>
            ${addrHtml}
        `;

        this.itBox = this.el.querySelector('.lnasc-it');
        this.esteroBox = this.el.querySelector('.lnasc-estero');
        this.chips = [...this.el.querySelectorAll('.lnasc-chip')];
        this.indirizzoInput = this.el.querySelector('.lnasc-indirizzo-input');
        this.civicoInput = this.el.querySelector('.lnasc-civico-input');

        this.provCs = new CustomSelect(
            this.el.querySelector('.lnasc-provincia'),
            this.data.province.map(p => ({ value: p.sigla, label: p.label })),
            (sigla) => {
                if (!sigla) return; // ricerca in corso
                if (sigla === this._provincia) return;
                this._onProvinciaChange(sigla);
            },
            { placeholder: 'Cerca provincia…', showImages: false, searchable: true }
        );

        this.comuneCs = new CustomSelect(
            this.el.querySelector('.lnasc-comune'),
            [],
            (comune) => {
                if (!comune) return;
                if (comune === this._comune) return;
                this._onComuneChange(comune);
            },
            { placeholder: 'Cerca comune…', showImages: false, searchable: true }
        );

        this.statoCs = new CustomSelect(
            this.el.querySelector('.lnasc-stato'),
            this.data.stati.map(s => ({ value: s.sigla, label: s.nome })),
            (sigla) => {
                if (!sigla) return;
                if (sigla === this._stato) return;
                this._stato = sigla;
                this.onChange(this.getValue());
            },
            { placeholder: 'Cerca stato…', showImages: false, searchable: true }
        );

        if (this.withAddress && this.indirizzoInput && this.civicoInput) {
            this.indirizzoInput.addEventListener('input', () => {
                const next = this.indirizzoInput.value;
                if (this._ready && next !== this._indirizzo) {
                    this._clearCivico();
                }
                this._indirizzo = next;
                this.onChange(this.getValue());
            });
            this.indirizzoInput.addEventListener('blur', () => {
                const normalized = LuogoGeo.titleCase(this.indirizzoInput.value.trim());
                this.indirizzoInput.value = normalized;
                this._indirizzo = normalized;
                this.onChange(this.getValue());
            });
            this.civicoInput.addEventListener('input', () => {
                this._civico = this.civicoInput.value.trim();
                this.onChange(this.getValue());
            });
        }

        this.chips.forEach(btn => {
            btn.addEventListener('click', () => {
                const t = btn.getAttribute('data-tipo');
                this.setTipo(this._tipo === t ? '' : t);
            });
        });

        if (cfg.value) this.setValue(cfg.value);
        else this.setTipo('');
        this._ready = true;
    }

    /** Svuota solo il civico */
    _clearCivico() {
        if (!this.withAddress) return;
        this._civico = '';
        const el = this.el.querySelector('.lnasc-civico-input');
        if (el) {
            this.civicoInput = el;
            el.value = '';
        }
    }

    /** Svuota indirizzo + civico */
    _clearIndirizzoECivico() {
        if (!this.withAddress) return;
        this._indirizzo = '';
        this._civico = '';
        const ind = this.el.querySelector('.lnasc-indirizzo-input');
        const civ = this.el.querySelector('.lnasc-civico-input');
        if (ind) {
            this.indirizzoInput = ind;
            ind.value = '';
        }
        if (civ) {
            this.civicoInput = civ;
            civ.value = '';
        }
    }

    /** Cambio provincia → comune + indirizzo + civico */
    _onProvinciaChange(sigla) {
        this._provincia = sigla || '';
        this._comune = '';
        const list = (this.data.comuniBySigla[sigla] || [])
            .map(c => ({ value: c.comune, label: c.comune }));
        this.comuneCs.setOptions(list, '');
        if (this._ready) this._clearIndirizzoECivico();
        this.onChange(this.getValue());
    }

    /** Cambio comune → indirizzo + civico */
    _onComuneChange(comune) {
        this._comune = comune || '';
        if (this._ready) this._clearIndirizzoECivico();
        this.onChange(this.getValue());
    }

    setTipo(tipo) {
        this._tipo = tipo === 'IT' || tipo === 'ESTERO' ? tipo : '';
        this.chips.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tipo') === this._tipo);
        });
        this.itBox.hidden = this._tipo !== 'IT';
        this.esteroBox.hidden = this._tipo !== 'ESTERO';
        if (this._tipo !== 'IT') {
            this._provincia = '';
            this._comune = '';
            this.provCs.setValue('');
            this.comuneCs.setOptions([], '');
            if (this._ready) this._clearIndirizzoECivico();
        }
        if (this._tipo !== 'ESTERO') {
            this._stato = '';
            this.statoCs.setValue('');
        }
        this.onChange(this.getValue());
    }

    getValue() {
        const p = this.prefix;
        const display = this._composeDisplay();
        const out = {
            [p]: display,
            [`${p}Tipo`]: this._tipo,
            [`${p}Provincia`]: this._tipo === 'IT' ? this._provincia : '',
            [`${p}Comune`]: this._tipo === 'IT' ? this._comune : '',
            [`${p}Stato`]: this._tipo === 'ESTERO' ? this._stato : '',
        };
        if (this.withAddress) {
            out[`${p}Indirizzo`] = LuogoGeo.titleCase(String(this._indirizzo || '').trim());
            out[`${p}Civico`] = String(this._civico || '').trim();
        }
        return out;
    }

    setValue(data) {
        const d = data || {};
        const p = this.prefix;
        const wasReady = this._ready;
        this._ready = false;
        try {
            const tipo = d[`${p}Tipo`] || '';
            this.setTipo(tipo);
            if (tipo === 'IT') {
                const sigla = d[`${p}Provincia`] || '';
                this._provincia = sigla;
                this.provCs.setValue(sigla);
                const list = (this.data.comuniBySigla[sigla] || [])
                    .map(c => ({ value: c.comune, label: c.comune }));
                this._comune = d[`${p}Comune`] || '';
                this.comuneCs.setOptions(list, this._comune);
            } else if (tipo === 'ESTERO') {
                this._stato = d[`${p}Stato`] || '';
                this.statoCs.setValue(this._stato);
            }
            if (this.withAddress) {
                this._indirizzo = d[`${p}Indirizzo`] || '';
                this._civico = d[`${p}Civico`] || '';
                const ind = this.el.querySelector('.lnasc-indirizzo-input');
                const civ = this.el.querySelector('.lnasc-civico-input');
                this.indirizzoInput = ind;
                this.civicoInput = civ;
                if (ind) ind.value = this._indirizzo;
                if (civ) civ.value = this._civico;
            }
        } finally {
            this._ready = wasReady;
        }
    }

    _composeDisplay() {
        let geo = '';
        if (this._tipo === 'IT') {
            if (this._comune) {
                geo = this._provincia ? `${this._comune} (${this._provincia})` : this._comune;
            }
        } else if (this._tipo === 'ESTERO') {
            if (this._stato) {
                const found = this.data.stati.find(s => s.sigla === this._stato);
                geo = found ? found.nome : this._stato;
            }
        }
        if (this.withAddress) {
            const addr = [LuogoGeo.titleCase(this._indirizzo), String(this._civico || '').trim()]
                .filter(Boolean).join(' ');
            if (addr && geo) return `${addr}, ${geo}`;
            if (addr) return addr;
        }
        return geo;
    }
}

/** Compatibilità con il nome precedente */
class LuogoNascita {
    static loadData() { return LuogoGeo.loadData(); }
    static async create(el, cfg = {}) {
        return LuogoGeo.create(el, { ...cfg, prefix: 'luogoNascita', ariaLabel: 'Tipo luogo di nascita' });
    }
}
