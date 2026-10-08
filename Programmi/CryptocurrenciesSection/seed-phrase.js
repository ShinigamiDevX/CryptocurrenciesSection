(function () {
    const CARD = 'seed-phrase';
    const TOTAL_WORDS = 24;
    const MIN_PARTICIPANTS = 1;
    const MAX_PARTICIPANTS = 24;
    const DEFAULT_PARTICIPANTS = 2;
    const DEFAULT_LUOGO = 'Comando Carabinieri Antifalsificazione Monetaria - Sezione Criptovalute';
    const BIP39_URL = '/files/bip39words.json?v=1';
    const GENERATE_URL = '/api/auth/seed-phrase/generate';

    let bip39Set = new Set();
    let bip39Options = [];
    let wordSelects = [];
    let currentRanges = [];
    let compDate = null;
    let profile = { nome: '', cognome: '' };

    function token() { return typeof getAuthToken === 'function' ? getAuthToken() : ''; }
    function logout() {
        if (typeof clearAuth === 'function') clearAuth();
        window.location.replace('/login');
    }
    window.logout = logout;

    function pad2(n) { return String(n).padStart(2, '0'); }

    function todayParts() {
        const d = new Date();
        return {
            iso: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
            pin: `${pad2(d.getDate())}${pad2(d.getMonth() + 1)}${d.getFullYear()}`,
            dateIt: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`,
            time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
        };
    }

    function titleCaseIt(s) {
        return String(s || '').trim().toLocaleLowerCase('it')
            .replace(/(^|[\s'/.-])(\S)/g, (_, a, b) => a + b.toLocaleUpperCase('it'));
    }

    function signerLabel() {
        const c = String(profile.cognome || '').trim().toUpperCase();
        const n = titleCaseIt(profile.nome);
        if (c && n) return `${c} ${n}`;
        return c || n || '—';
    }

    function updateSignerPreview() {
        const el = document.getElementById('signerPreview');
        if (el) el.textContent = signerLabel();
    }

    /** Suddivide 24 parole tra n persone nel modo più equo possibile (interi). */
    function splitWordRanges(participants, total = TOTAL_WORDS) {
        const n = Math.max(MIN_PARTICIPANTS, Math.min(MAX_PARTICIPANTS, Math.floor(Number(participants) || 1)));
        const base = Math.floor(total / n);
        const rem = total % n;
        const ranges = [];
        let start = 1;
        for (let i = 0; i < n; i += 1) {
            const size = base + (i < rem ? 1 : 0);
            const end = start + size - 1;
            ranges.push({ index: i + 1, start, end, size });
            start = end + 1;
        }
        return ranges;
    }

    function formatRangeLabel(range) {
        if (range.size === 1) return `Parola ${range.start}`;
        return `Parole ${range.start} – ${range.end}`;
    }

    function participantCount() {
        const el = document.getElementById('participantCount');
        let n = Math.floor(Number(el && el.value));
        if (!Number.isFinite(n)) n = DEFAULT_PARTICIPANTS;
        return Math.max(MIN_PARTICIPANTS, Math.min(MAX_PARTICIPANTS, n));
    }

    function selectedRange() {
        const v = document.querySelector('input[name="wordRange"]:checked');
        const start = v ? Number(v.value) : NaN;
        return currentRanges.find((r) => r.start === start) || currentRanges[0] || null;
    }

    function showMsg(text, ok) {
        const el = document.getElementById('formMsg');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'sp-msg' + (text ? (ok ? ' ok' : ' err') : '');
    }

    function applyDefaults() {
        const t = todayParts();
        document.getElementById('pin').value = t.pin;
        document.getElementById('compTime').value = t.time;
        document.getElementById('testoLibero').value = DEFAULT_LUOGO;
        document.getElementById('passphrase').value = '';
        document.getElementById('codice').value = '';
        document.getElementById('participantCount').value = String(DEFAULT_PARTICIPANTS);
        if (compDate) compDate.setValue(t.iso);
        rebuildRangesAndFields();
        showMsg('');
    }

    async function ensureAuth() {
        const res = await fetch('/api/auth/verify', { headers: { Authorization: 'Bearer ' + token() } });
        const user = await res.json().catch(() => ({}));
        if (!res.ok || !user.valid) {
            window.location.replace('/login');
            return null;
        }
        const cards = user.cards || [];
        if (user.role !== 'superadmin' && !cards.includes(CARD)) {
            window.location.replace('/portal');
            return null;
        }
        document.getElementById('navUserEmail').textContent = user.displayName || user.email || '';
        document.getElementById('authOverlay').style.display = 'none';
        return user;
    }

    async function loadProfile() {
        try {
            const res = await fetch('/api/auth/my-profile', { headers: { Authorization: 'Bearer ' + token() } });
            if (!res.ok) return;
            profile = await res.json();
        } catch { /* ignore */ }
        updateSignerPreview();
    }

    async function loadAssets() {
        const wordsRes = await fetch(BIP39_URL);
        if (!wordsRes.ok) throw new Error('Dizionario BIP39 non disponibile.');
        const words = await wordsRes.json();
        bip39Options = words.map((w) => ({ value: w, label: w }));
        bip39Set = new Set(words);
    }

    function renderRangeOptions(preferStart) {
        const host = document.getElementById('wordRangeOptions');
        host.innerHTML = '';
        const keep = preferStart != null
            ? preferStart
            : (document.querySelector('input[name="wordRange"]:checked')
                ? Number(document.querySelector('input[name="wordRange"]:checked').value)
                : null);

        let checkedStart = currentRanges[0] ? currentRanges[0].start : 1;
        if (keep != null && currentRanges.some((r) => r.start === keep)) checkedStart = keep;

        currentRanges.forEach((range) => {
            const lab = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'wordRange';
            input.value = String(range.start);
            if (range.start === checkedStart) input.checked = true;
            input.addEventListener('change', () => buildWordFields());
            lab.appendChild(input);
            lab.appendChild(document.createTextNode(' ' + formatRangeLabel(range)));
            host.appendChild(lab);
        });

        // Una sola persona: nascondi i radio (c'è un solo intervallo 1–24)
        host.style.display = currentRanges.length <= 1 ? 'none' : '';
    }

    function updatePanelTitle() {
        const title = document.getElementById('wordsPanelTitle');
        const r = selectedRange();
        if (!title || !r) return;
        if (r.size === TOTAL_WORDS) title.textContent = `Parole seed (${TOTAL_WORDS})`;
        else if (r.size === 1) title.textContent = `Parola seed ${r.start}`;
        else title.textContent = `Parole seed (${r.start}–${r.end})`;
    }

    function buildWordFields() {
        const host = document.getElementById('wordFields');
        host.innerHTML = '';
        wordSelects = [];
        const range = selectedRange();
        const count = range ? range.size : TOTAL_WORDS;
        const start = range ? range.start : 1;

        for (let i = 0; i < count; i += 1) {
            const wrap = document.createElement('div');
            wrap.className = 'sp-field';
            const lab = document.createElement('label');
            lab.textContent = `Parola ${start + i}`;
            lab.setAttribute('for', 'wordSlot' + i);
            const slot = document.createElement('div');
            slot.id = 'wordSlot' + i;
            wrap.appendChild(lab);
            wrap.appendChild(slot);
            host.appendChild(wrap);
            const cs = new CustomSelect(slot, bip39Options, () => {}, {
                placeholder: 'Cerca parola BIP39…',
                searchable: true,
                showImages: false,
            });
            wordSelects.push(cs);
        }
        updatePanelTitle();
    }

    function rebuildRangesAndFields(preferStart) {
        const n = participantCount();
        const el = document.getElementById('participantCount');
        if (el && String(el.value) !== String(n)) el.value = String(n);
        currentRanges = splitWordRanges(n);
        renderRangeOptions(preferStart);
        buildWordFields();
    }

    function collectWords() {
        return wordSelects.map((cs) => String(cs.getValue() || '').trim().toLowerCase());
    }

    function validateForm() {
        const range = selectedRange();
        if (!range) return 'Seleziona l\'intervallo di parole.';
        const words = collectWords();
        if (words.length !== range.size) return `Servono esattamente ${range.size} parole.`;
        for (let i = 0; i < words.length; i += 1) {
            if (!words[i]) return `Inserisci la parola ${range.start + i}.`;
            if (!bip39Set.has(words[i])) return `Parola non valida (BIP39): «${words[i]}».`;
        }
        const pin = String(document.getElementById('pin').value || '').trim();
        if (!pin) return 'Inserisci il PIN.';
        if (!/^\d{8}$/.test(pin)) return 'Il PIN deve essere 8 cifre (formato ddmmaaaa).';
        if (!compDate || !compDate.getValue()) return 'Inserisci la data di compilazione.';
        const dateErr = compDate.getValidationError ? compDate.getValidationError() : null;
        if (dateErr) return dateErr;
        const time = String(document.getElementById('compTime').value || '').trim();
        if (!time) return 'Inserisci l\'ora di compilazione.';
        if (!/^\d{2}:\d{2}$/.test(time)) return 'Ora non valida (usa hh:mm).';
        const testoLibero = String(document.getElementById('testoLibero').value || '').trim();
        if (!testoLibero) return 'Inserisci il comando / luogo.';
        const codice = String(document.getElementById('codice').value || '').trim();
        if (!codice) return 'Inserisci il codice alfanumerico della busta.';
        const signer = signerLabel();
        if (!signer || signer === '—') {
            return 'Nome e cognome mancanti nel profilo: aggiorna il profilo prima di generare il PDF.';
        }
        return '';
    }

    async function generatePdf() {
        const err = validateForm();
        if (err) {
            showMsg(err, false);
            return;
        }
        showMsg('Generazione PDF dal modello Word in corso…', true);
        const btn = document.getElementById('btnGenerate');
        btn.disabled = true;
        try {
            const pin = String(document.getElementById('pin').value || '').trim();
            const iso = compDate ? compDate.getValue() : '';
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
            const dataIt = m ? `${m[3]}/${m[2]}/${m[1]}` : todayParts().dateIt;
            const range = selectedRange();

            const res = await fetch(GENERATE_URL, {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer ' + token(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    participants: participantCount(),
                    wordRangeStart: range.start,
                    words: collectWords(),
                    passphrase: String(document.getElementById('passphrase').value || '').trim(),
                    pin,
                    dataIt,
                    ora: String(document.getElementById('compTime').value || '').trim(),
                    testoLibero: String(document.getElementById('testoLibero').value || '').trim(),
                    codice: String(document.getElementById('codice').value || '').trim().toUpperCase(),
                    signer: signerLabel(),
                }),
            });

            if (!res.ok) {
                let msg = 'Errore durante la generazione del PDF.';
                try {
                    const j = await res.json();
                    if (j && j.error) msg = j.error;
                } catch { /* ignore */ }
                throw new Error(msg);
            }

            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `seed-phrase-${pin}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            showMsg('PDF generato dal modello Word. Controlla il download.', true);
        } catch (e) {
            showMsg(e.message || 'Errore durante la generazione del PDF.', false);
        } finally {
            btn.disabled = false;
        }
    }

    document.getElementById('seedForm').addEventListener('submit', (e) => {
        e.preventDefault();
        generatePdf();
    });
    document.getElementById('btnReset').addEventListener('click', applyDefaults);

    document.getElementById('codice').addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });

    const participantEl = document.getElementById('participantCount');
    function stepParticipants(delta) {
        const next = Math.max(
            MIN_PARTICIPANTS,
            Math.min(MAX_PARTICIPANTS, participantCount() + delta)
        );
        participantEl.value = String(next);
        rebuildRangesAndFields();
    }
    document.getElementById('participantUp').addEventListener('click', () => stepParticipants(1));
    document.getElementById('participantDown').addEventListener('click', () => stepParticipants(-1));
    participantEl.addEventListener('change', () => rebuildRangesAndFields());
    participantEl.addEventListener('input', () => {
        const n = Math.floor(Number(participantEl.value));
        if (!Number.isFinite(n)) return;
        if (n < MIN_PARTICIPANTS || n > MAX_PARTICIPANTS) return;
        rebuildRangesAndFields();
    });

    (async function init() {
        const user = await ensureAuth();
        if (!user) return;
        const t = todayParts();
        compDate = new CustomDate(document.getElementById('compDate'), {
            value: t.iso,
            placeholder: 'gg.mm.aaaa',
        });
        try {
            await loadAssets();
            document.getElementById('participantCount').value = String(DEFAULT_PARTICIPANTS);
            rebuildRangesAndFields();
            await loadProfile();
            applyDefaults();
        } catch (e) {
            showMsg(e.message || 'Impossibile caricare lo strumento.', false);
            document.getElementById('authOverlay').style.display = 'none';
        }
    })();
})();
