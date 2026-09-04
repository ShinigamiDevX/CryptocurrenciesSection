/**
 * Guida di primo accesso al portale (ruoli Utente / Admin).
 * Uso: PortalOnboarding.maybeShow(user) | PortalOnboarding.show(role, { fromProfile, nome })
 */
(function (global) {
    'use strict';

    const STYLE_ID = 'portal-onboarding-style';
    const ROOT_ID = 'portalOnboardingRoot';

    const ROLE_LABEL = {
        user: 'Utente',
        admin: 'Admin',
        superadmin: 'Super Admin',
    };

    /** Testo ufficiale: panoramica del portale + funzioni del ruolo (+ categorie aggiuntive). */
    const CONTENT = {
        user: {
            intro:
                'Il Portale Operativo CryptocurrenciesSection costituisce l’ambiente unico di accesso agli strumenti e ai servizi informatizzati messi a disposizione dell’organizzazione. Attraverso la dashboard è possibile raggiungere le applicazioni autorizzate, consultare le comunicazioni e gestire i dati del proprio account.',
            sections: [
                {
                    h: 'Funzioni del ruolo Utente',
                    items: [
                        'Utilizzo degli strumenti e delle schede espressamente assegnati al proprio profilo.',
                        'Consultazione dei dati anagrafici in «Il mio profilo» e invio di richieste di aggiornamento, sottoposte all’esame di un amministratore.',
                        'Modifica autonoma della password di accesso.',
                        'Consultazione delle notifiche relative all’account e alle richieste inoltrate.',
                    ],
                },
            ],
        },
        admin: {
            intro:
                'Il Portale Operativo CryptocurrenciesSection costituisce l’ambiente unico di accesso agli strumenti e ai servizi informatizzati messi a disposizione dell’organizzazione. Il ruolo Admin abilita, oltre alle funzioni operative ordinarie, le attività di amministrazione degli utenti e delle autorizzazioni.',
            sections: [
                {
                    h: 'Funzioni del ruolo Admin',
                    items: [
                        'Utilizzo degli strumenti assegnati e aggiornamento del proprio profilo e della password da «Il mio profilo».',
                        'Accesso a «Gestione Utenti» per l’invito di nuovi utenti, con assegnazione di ruolo e schede del portale.',
                        'Modifica di anagrafica, ruolo (nei limiti del proprio livello), schede e categoria Docente degli utenti di livello inferiore.',
                        'Eliminazione degli account (revoca della visibilità e delle credenziali) e sblocco degli accessi bloccati per tentativi OTP.',
                        'Gestione massiva delle autorizzazioni dalla scheda Autorizzazioni.',
                        'Esame, approvazione o rifiuto delle richieste di modifica profilo presentate dagli utenti.',
                    ],
                },
            ],
        },
    };

    /** Sezioni aggiuntive per categorie/utenze cumulate (es. Docente oltre al ruolo base). */
    const EXTRA_SECTIONS = {
        docente: {
            h: 'Funzioni della categoria Docente',
            items: [
                'Accesso alle funzioni di gestione della sezione Corsi del portale.',
                'Creazione, modifica, ordinamento ed eliminazione di contenuti e materiali didattici.',
                'Caricamento di file e gestione delle versioni dei contenuti, con possibilità di ripristino.',
                'Esportazione dei pacchetti didattici e aggiornamento delle impostazioni della sezione Corsi.',
                'Collaborazione con gli altri docenti sulle modifiche ai contenuti, nel rispetto delle revisioni in corso.',
            ],
        },
    };

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function displayNome(opts, role) {
        const raw = (opts && opts.nome) ? String(opts.nome).trim() : '';
        if (raw) return raw;
        if (role === 'superadmin') return 'Super Admin';
        return '';
    }

    function roleKey(role) {
        if (role === 'admin' || role === 'superadmin') return 'admin';
        if (role === 'user') return 'user';
        return null;
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 5000;
  display: flex; align-items: center; justify-content: center;
  padding: 1.25rem; background: rgba(3, 14, 28, 0.78);
  backdrop-filter: blur(4px);
}
#${ROOT_ID} .ob-box {
  width: min(640px, 100%); max-height: min(88vh, 820px);
  display: flex; flex-direction: column;
  background: #071525; border: 1px solid rgba(0, 200, 255, 0.28);
  border-radius: 14px; box-shadow: 0 24px 64px rgba(0,0,0,0.55);
  overflow: hidden;
}
#${ROOT_ID} .ob-head {
  padding: 1.15rem 1.35rem 0.85rem; border-bottom: 1px solid rgba(0,200,255,0.12);
}
#${ROOT_ID} .ob-head h2 {
  margin: 0 0 0.35rem; color: #00C8FF; font-size: 1.15rem; font-weight: 700;
  letter-spacing: 0.01em;
}
#${ROOT_ID} .ob-head p {
  margin: 0; color: #7ACCE0; font-size: 0.88rem; font-weight: 600;
}
#${ROOT_ID} .ob-body {
  padding: 1rem 1.35rem; overflow: auto; flex: 1;
  color: #C8F0E8; font-size: 0.9rem; line-height: 1.55;
  text-align: justify; hyphens: auto;
}
#${ROOT_ID} .ob-intro {
  margin: 0 0 0.85rem; color: #A8D8E0; font-size: 0.88rem; line-height: 1.55;
  text-align: justify;
}
#${ROOT_ID} .ob-sec {
  margin: 0 0 0.7rem; padding: 0; text-align: left;
}
#${ROOT_ID} .ob-sec:last-child { margin-bottom: 0; }
#${ROOT_ID} .ob-sec h3 {
  margin: 0 0 0.35rem; color: #00C8FF; font-size: 0.92rem; font-weight: 650;
  text-transform: uppercase; letter-spacing: 0.04em;
  text-align: left;
}
#${ROOT_ID} .ob-sec ul {
  margin: 0; padding-left: 1.15rem;
  list-style: disc;
  text-align: justify;
}
#${ROOT_ID} .ob-sec li { margin: 0.28rem 0; text-align: justify; }
#${ROOT_ID} .ob-sec li:last-child { margin-bottom: 0; }
#${ROOT_ID} .ob-foot {
  padding: 0.95rem 1.35rem 1.15rem; border-top: 1px solid rgba(0,200,255,0.12);
  display: flex; flex-direction: column; gap: 0.75rem;
}
#${ROOT_ID} .ob-checks { display: flex; flex-direction: column; gap: 0.55rem; }
#${ROOT_ID} .ob-check {
  display: flex; align-items: flex-start; gap: 0.55rem;
  color: #A8D8E0; font-size: 0.86rem; cursor: pointer; user-select: none;
}
#${ROOT_ID} .ob-check input {
  margin-top: 0.15rem; accent-color: #00C8FF; width: 1rem; height: 1rem; flex-shrink: 0;
}
#${ROOT_ID} .ob-actions { display: flex; justify-content: flex-end; gap: 0.6rem; }
#${ROOT_ID} .ob-btn {
  padding: 0.55rem 1.15rem; border-radius: 8px; font-weight: 650;
  font-size: 0.88rem; font-family: inherit; cursor: pointer; border: 1px solid transparent;
}
#${ROOT_ID} .ob-btn:disabled { opacity: 0.45; cursor: not-allowed; }
#${ROOT_ID} .ob-btn-primary {
  background: #00C8FF; color: #030E1C; border-color: #00C8FF;
}
#${ROOT_ID} .ob-btn-primary:hover:not(:disabled) { background: #33d4ff; }
html.light-theme #${ROOT_ID} { background: rgba(40, 28, 12, 0.45); }
html.light-theme #${ROOT_ID} .ob-box {
  background: #fffaf3; border-color: rgba(204, 120, 40, 0.35);
  box-shadow: 0 18px 48px rgba(80, 40, 0, 0.18);
}
html.light-theme #${ROOT_ID} .ob-head { border-bottom-color: rgba(204, 120, 40, 0.18); }
html.light-theme #${ROOT_ID} .ob-head h2 { color: #CC5000; }
html.light-theme #${ROOT_ID} .ob-head p,
html.light-theme #${ROOT_ID} .ob-check,
html.light-theme #${ROOT_ID} .ob-intro { color: #7A5A28; }
html.light-theme #${ROOT_ID} .ob-body { color: #2C1A00; }
html.light-theme #${ROOT_ID} .ob-sec h3 { color: #B84800; }
html.light-theme #${ROOT_ID} .ob-foot { border-top-color: rgba(204, 120, 40, 0.18); }
html.light-theme #${ROOT_ID} .ob-btn-primary {
  background: #CC5000; color: #fff; border-color: #CC5000;
}
html.light-theme #${ROOT_ID} .ob-check input { accent-color: #CC5000; }
`;
        document.head.appendChild(s);
    }

    function closeRoot() {
        const el = document.getElementById(ROOT_ID);
        if (el) el.remove();
    }

    async function persistDismiss(permanent) {
        const token = (typeof getAuthToken === 'function') ? getAuthToken() : null;
        if (!token) return;
        try {
            await fetch('/api/auth/onboarding-dismiss', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ permanent: !!permanent }),
            });
        } catch { /* ignore */ }
    }

    function show(role, opts) {
        const key = roleKey(role);
        if (!key) return false;
        const data = CONTENT[key];
        if (!data) return false;
        ensureStyles();
        closeRoot();

        const fromProfile = !!(opts && opts.fromProfile);
        const nome = displayNome(opts, role);
        const titleText = nome ? ('Ciao ' + nome) : 'Informativa di accesso';

        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'obTitle');

        const sections = data.sections.slice();
        if (opts && opts.docente && EXTRA_SECTIONS.docente) {
            sections.push(EXTRA_SECTIONS.docente);
        }

        const sectionsHtml = sections.map((sec) => `
            <div class="ob-sec">
                <h3>${escapeHtml(sec.h)}</h3>
                <ul>${sec.items.map((it) => `<li>${escapeHtml(it)}</li>`).join('')}</ul>
            </div>
        `).join('');

        const checksHtml = fromProfile ? '' : `
                    <div class="ob-checks">
                        <label class="ob-check">
                            <input type="checkbox" id="obReadAck">
                            <span>Confermo di aver letto la presente informativa</span>
                        </label>
                        <label class="ob-check">
                            <input type="checkbox" id="obDontShow">
                            <span>Non mostrare più questo messaggio ai prossimi accessi</span>
                        </label>
                    </div>`;

        root.innerHTML = `
            <div class="ob-box">
                <div class="ob-head">
                    <h2 id="obTitle">${escapeHtml(titleText)}</h2>
                </div>
                <div class="ob-body">
                    <p class="ob-intro">${escapeHtml(data.intro)}</p>
                    ${sectionsHtml}
                </div>
                <div class="ob-foot">
                    ${checksHtml}
                    <div class="ob-actions">
                        <button type="button" class="ob-btn ob-btn-primary" id="obContinue"${fromProfile ? '' : ' disabled'}>${fromProfile ? 'Chiudi' : 'Continua'}</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(root);

        const btn = root.querySelector('#obContinue');
        if (!fromProfile) {
            const ack = root.querySelector('#obReadAck');
            const sync = () => { btn.disabled = !ack.checked; };
            ack.addEventListener('change', sync);
        }

        btn.addEventListener('click', async () => {
            if (fromProfile) {
                closeRoot();
                return;
            }
            const ack = root.querySelector('#obReadAck');
            const dont = root.querySelector('#obDontShow');
            if (!ack || !ack.checked) return;
            btn.disabled = true;
            const permanent = !!(dont && dont.checked);
            await persistDismiss(permanent);
            if (opts && typeof opts.onComplete === 'function') {
                opts.onComplete({ permanent });
            }
            closeRoot();
        });

        return true;
    }

    async function maybeShow(user, opts) {
        if (!user || user.accountType === 'strumento') return false;
        if (user.onboardingDismissed) return false;
        if (!roleKey(user.role)) return false;
        let nome = opts && opts.nome;
        if (!nome) {
            try {
                const token = (typeof getAuthToken === 'function') ? getAuthToken() : null;
                if (token) {
                    const res = await fetch('/api/auth/my-profile', {
                        headers: { 'Authorization': 'Bearer ' + token },
                    });
                    if (res.ok) {
                        const p = await res.json();
                        nome = (p.nome || '').trim();
                    }
                }
            } catch { /* ignore */ }
        }
        return show(user.role, {
            nome,
            docente: !!user.docente,
            onComplete: ({ permanent }) => {
                if (permanent) user.onboardingDismissed = true;
            },
        });
    }

    global.PortalOnboarding = { show, maybeShow, roleKey };
})(typeof window !== 'undefined' ? window : globalThis);
