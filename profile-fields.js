'use strict';
/**
 * Helper condiviso per campi anagrafici utente.
 * Obbligatori: grado, nome, cognome (email gestita a parte).
 */

function readGeo(elId) {
    const el = document.getElementById(elId);
    if (el && el._lnasc && typeof el._lnasc.getValue === 'function') {
        return el._lnasc.getValue();
    }
    return null;
}

function fillGeo(elId, data) {
    const el = document.getElementById(elId);
    if (el && el._lnasc && typeof el._lnasc.setValue === 'function') {
        el._lnasc.setValue(data);
        return true;
    }
    return false;
}

function readTelefono(elId) {
    const el = document.getElementById(elId);
    if (el && el._telefono && typeof el._telefono.getValue === 'function') {
        return el._telefono.getValue();
    }
    const nested = el && el.querySelector && el.querySelector('.tel-numero');
    if (nested) {
        return { telefonoPrefisso: '+39', telefono: String(nested.value || '').trim() };
    }
    const input = el && el.tagName === 'INPUT' ? el : null;
    if (input) return { telefonoPrefisso: '+39', telefono: String(input.value || '').trim() };
    return { telefonoPrefisso: '+39', telefono: '' };
}

function fillTelefono(elId, data) {
    const el = document.getElementById(elId);
    if (el && el._telefono && typeof el._telefono.setValue === 'function') {
        el._telefono.setValue(data);
        return true;
    }
    if (el && el.tagName === 'INPUT') {
        el.value = data && data.telefono ? data.telefono : '';
        return true;
    }
    return false;
}

function formatTelefonoDisplay(data) {
    if (!data) return '';
    const n = String(data.telefono || '').trim();
    if (!n) return '';
    if (typeof TelefonoField !== 'undefined' && TelefonoField.formatDisplay) {
        return TelefonoField.formatDisplay(data.telefonoPrefisso, data.telefono);
    }
    const p = (data.telefonoPrefisso || '').trim();
    if (!p) return n;
    return `${p} ${n}`;
}

function collectProfileFields(ids, getGrado) {
    const v = (id) => {
        const el = document.getElementById(id);
        if (!el) return '';
        if (el._cdate && typeof el._cdate.getValue === 'function') {
            return String(el._cdate.getValue() || '').trim();
        }
        if (el._lnasc || el._telefono) return '';
        return String(el.value || '').trim();
    };

    const comeEl = document.getElementById(ids.domicilioComeResidenza);
    const domicilioComeResidenza = !!(comeEl && comeEl.checked);
    const tel = readTelefono(ids.telefono);

    const base = {
        nome: v(ids.nome),
        cognome: v(ids.cognome),
        grado: typeof getGrado === 'function' ? (getGrado() || '') : '',
        dataNascita: v(ids.dataNascita),
        telefono: tel.telefono,
        telefonoPrefisso: tel.telefonoPrefisso,
        domicilioComeResidenza,
        luogoNascita: '',
        luogoNascitaTipo: '',
        luogoNascitaProvincia: '',
        luogoNascitaComune: '',
        luogoNascitaStato: '',
        residenza: '',
        residenzaTipo: '',
        residenzaProvincia: '',
        residenzaComune: '',
        residenzaStato: '',
        residenzaIndirizzo: '',
        residenzaCivico: '',
        domicilio: '',
        domicilioTipo: '',
        domicilioProvincia: '',
        domicilioComune: '',
        domicilioStato: '',
        domicilioIndirizzo: '',
        domicilioCivico: '',
    };

    Object.assign(base, readGeo(ids.luogoNascita) || { luogoNascita: v(ids.luogoNascita) });
    Object.assign(base, readGeo(ids.residenza) || { residenza: v(ids.residenza) });

    if (domicilioComeResidenza) {
        base.domicilio = base.residenza;
        base.domicilioTipo = base.residenzaTipo;
        base.domicilioProvincia = base.residenzaProvincia;
        base.domicilioComune = base.residenzaComune;
        base.domicilioStato = base.residenzaStato;
        base.domicilioIndirizzo = base.residenzaIndirizzo;
        base.domicilioCivico = base.residenzaCivico;
    } else {
        Object.assign(base, readGeo(ids.domicilio) || { domicilio: v(ids.domicilio) });
    }
    return base;
}

function validateRequiredProfile(p) {
    if (!p.nome || !p.cognome || !p.grado) {
        return 'Compila grado, nome e cognome.';
    }
    return null;
}

/** Controlla eventuali CustomDate collegati agli id del form. */
function validateProfileDates(ids) {
    const el = document.getElementById(ids.dataNascita);
    if (el && el._cdate && typeof el._cdate.getValidationError === 'function') {
        return el._cdate.getValidationError();
    }
    return null;
}

function fillProfileFields(ids, data, setGrado) {
    const d = data || {};
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el._cdate && typeof el._cdate.setValue === 'function') {
            el._cdate.setValue(val || '');
            return;
        }
        if (el._lnasc || el._telefono) return;
        el.value = val || '';
    };
    set(ids.nome, d.nome);
    set(ids.cognome, d.cognome);
    set(ids.dataNascita, d.dataNascita);
    fillTelefono(ids.telefono, d);

    fillGeo(ids.luogoNascita, d);
    fillGeo(ids.residenza, d);

    const comeEl = document.getElementById(ids.domicilioComeResidenza);
    if (comeEl) comeEl.checked = !!d.domicilioComeResidenza;

    if (!d.domicilioComeResidenza) {
        fillGeo(ids.domicilio, d);
    }
    if (typeof setGrado === 'function') setGrado(d.grado || '');
    syncDomicilioField(ids);
}

function syncDomicilioField(ids) {
    const comeEl = document.getElementById(ids.domicilioComeResidenza);
    const wrap = document.getElementById(ids.domicilioWrap || (ids.domicilio + 'Wrap'));
    const domEl = document.getElementById(ids.domicilio);
    if (!comeEl) return;
    const same = comeEl.checked;
    if (wrap) wrap.style.display = same ? 'none' : '';
    else if (domEl) {
        const field = domEl.closest('.field, .edit-field, .lnasc') || domEl;
        field.style.display = same ? 'none' : '';
    }
}

function wireDomicilioSync(ids) {
    const comeEl = document.getElementById(ids.domicilioComeResidenza);
    if (comeEl) {
        comeEl.addEventListener('change', () => syncDomicilioField(ids));
    }
    syncDomicilioField(ids);
}

function formatDateIT(iso) {
    if (!iso) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    return `${m[3]}/${m[2]}/${m[1]}`;
}

function dash(v) {
    return (v && String(v).trim()) ? v : '—';
}
