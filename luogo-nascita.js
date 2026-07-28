/**
 * LuogoGeo — tipo Italia/Estero + provincia/comune (ricercabili) oppure stato
 *
 * Uso:
 *   const ln = await LuogoGeo.create(containerEl, { prefix: 'luogoNascita', value });
 *   ln.getValue() // { prefix, prefixTipo, prefixProvincia, prefixComune, prefixStato }
 *   ln.setValue(data)
 *
 * Alias: LuogoNascita = wrapper con prefix 'luogoNascita'
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

    constructor(el, data, cfg = {}) {
        this.el = typeof el === 'string' ? document.querySelector(el) : el;
        if (!this.el) return;
        this.data = data;
        this.prefix = cfg.prefix || 'luogoNascita';
        this.onChange = cfg.onChange || (() => {});
        this.ariaLabel = cfg.ariaLabel || 'Tipo luogo';
        this.el.classList.add('lnasc');
        this.el._lnasc = this;
        this.el._luogoGeo = this;

        this._tipo = '';
        this._provincia = '';
        this._comune = '';
        this._stato = '';

        this.el.innerHTML = `
            <div class="lnasc-tipo" role="group" aria-label="${this.ariaLabel}">
                <button type="button" class="lnasc-chip" data-tipo="IT">Italiano</button>
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
        `;

        this.itBox = this.el.querySelector('.lnasc-it');
        this.esteroBox = this.el.querySelector('.lnasc-estero');
        this.chips = [...this.el.querySelectorAll('.lnasc-chip')];

        this.provCs = new CustomSelect(
            this.el.querySelector('.lnasc-provincia'),
            this.data.province.map(p => ({ value: p.sigla, label: p.label })),
            (sigla) => this._onProvincia(sigla),
            { placeholder: 'Cerca provincia…', showImages: false, searchable: true }
        );

        this.comuneCs = new CustomSelect(
            this.el.querySelector('.lnasc-comune'),
            [],
            (comune) => {
                this._comune = comune || '';
                this.onChange(this.getValue());
            },
            { placeholder: 'Cerca comune…', showImages: false, searchable: true }
        );

        this.statoCs = new CustomSelect(
            this.el.querySelector('.lnasc-stato'),
            this.data.stati.map(s => ({ value: s.sigla, label: s.nome })),
            (sigla) => {
                this._stato = sigla || '';
                this.onChange(this.getValue());
            },
            { placeholder: 'Cerca stato…', showImages: false, searchable: true }
        );

        this.chips.forEach(btn => {
            btn.addEventListener('click', () => {
                const t = btn.getAttribute('data-tipo');
                this.setTipo(this._tipo === t ? '' : t);
            });
        });

        if (cfg.value) this.setValue(cfg.value);
        else this.setTipo('');
    }

    _onProvincia(sigla) {
        this._provincia = sigla || '';
        this._comune = '';
        const list = (this.data.comuniBySigla[sigla] || [])
            .map(c => ({ value: c.comune, label: c.comune }));
        this.comuneCs.setOptions(list, '');
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
        return {
            [p]: display,
            [`${p}Tipo`]: this._tipo,
            [`${p}Provincia`]: this._tipo === 'IT' ? this._provincia : '',
            [`${p}Comune`]: this._tipo === 'IT' ? this._comune : '',
            [`${p}Stato`]: this._tipo === 'ESTERO' ? this._stato : '',
        };
    }

    setValue(data) {
        const d = data || {};
        const p = this.prefix;
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
    }

    _composeDisplay() {
        if (this._tipo === 'IT') {
            if (!this._comune) return '';
            return this._provincia ? `${this._comune} (${this._provincia})` : this._comune;
        }
        if (this._tipo === 'ESTERO') {
            if (!this._stato) return '';
            const found = this.data.stati.find(s => s.sigla === this._stato);
            return found ? found.nome : this._stato;
        }
        return '';
    }
}

/** Compatibilità con il nome precedente */
class LuogoNascita {
    static loadData() { return LuogoGeo.loadData(); }
    static async create(el, cfg = {}) {
        return LuogoGeo.create(el, { ...cfg, prefix: 'luogoNascita', ariaLabel: 'Tipo luogo di nascita' });
    }
}
