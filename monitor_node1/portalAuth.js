'use strict';
/**
 * Accesso a HolderTrack solo dal portale.
 * - Ticket SSO: pagina bridge → POST monouso (come CryptoMonitor)
 * - Cookie firmato (non solo Map in RAM): sopravvive ai riavvii PM2
 * - Refresh / ripristino scheda / API same-origin → ok con cookie valido
 * - Senza cookie, URL digitato → bloccato
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const COOKIE_NAME = 'ht_portal_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Cookie ~10 anni: i profili strumento non scadono lato browser */
const STRUMENTO_COOKIE_MAX_AGE_SEC = 10 * 365 * 24 * 60 * 60;
const SSO_CACHE_TTL_MS = 2 * 60 * 1000;
const SECRET_FILE = path.join(__dirname, 'data', 'session.key');
const CONSUME_URL = (
  process.env.PORTAL_SSO_CONSUME_URL
  || 'https://cryptosection.chainholder.dev/api/auth/sso/consume'
).replace(/\/$/, '');
const PORTAL_HOME = (
  process.env.PORTAL_URL
  || 'https://cryptosection.chainholder.dev'
).replace(/\/$/, '') + '/portal';
const PORTAL_HOSTS = new Set(
  String(process.env.PORTAL_ALLOWED_HOSTS || 'cryptosection.chainholder.dev,192.168.4.80,localhost,127.0.0.1')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
);

function loadSessionSecret() {
  const fromEnv = String(process.env.HT_SESSION_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  try {
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    if (fs.existsSync(SECRET_FILE)) {
      const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
      if (existing) return existing;
    }
    const created = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, created, { encoding: 'utf8', mode: 0o600 });
    return created;
  } catch (e) {
    console.error('[portal-auth] impossibile persistere session.key:', e.message);
    return crypto.randomBytes(32).toString('hex');
  }
}

const SESSION_SECRET = loadSessionSecret();
/** ticketHash → Promise */
const ssoInflight = new Map();
/** ticketHash → { token, email, accountType, exp } */
const ssoRecent = new Map();

function isStrumentoAccountType(accountType, email) {
  if (String(accountType || '').toLowerCase() === 'strumento') return true;
  const em = String(email || '').toLowerCase();
  return em.endsWith('@strumento.local');
}

function sessionExpiry(neverExpire) {
  if (neverExpire) return 0;
  return Date.now() + SESSION_TTL_MS;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function signSession(payload) {
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifySessionToken(token) {
  const raw = String(token || '');
  const dot = raw.lastIndexOf('.');
  if (dot < 1) return null;
  const data = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    const neverExpire = !!payload.neverExpire;
    if (!neverExpire && (!payload.exp || payload.exp <= Date.now())) return null;
    return {
      email: String(payload.email || '').trim(),
      accountType: neverExpire ? 'strumento' : (payload.accountType || 'user'),
      neverExpire,
      exp: neverExpire ? 0 : payload.exp,
    };
  } catch {
    return null;
  }
}

function purgeSessions() {
  const now = Date.now();
  for (const [k, v] of ssoRecent) {
    if (!v || v.exp <= now) ssoRecent.delete(k);
  }
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    let v = part.slice(i + 1).trim();
    if (!k) return;
    try {
      v = decodeURIComponent(v);
    } catch {
      /* valore cookie non encoded */
    }
    out[k] = v;
  });
  return out;
}

function readSession(req) {
  purgeSessions();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifySessionToken(token);
}

function setSessionCookie(res, token, neverExpire = false) {
  const maxAge = neverExpire
    ? STRUMENTO_COOKIE_MAX_AGE_SEC
    : Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function isHtmlEntry(req) {
  const p = req.path || '';
  return p === '/monitor.php' || p === '/monitor' || p.endsWith('/monitor.php') || p.endsWith('/monitor');
}

function refererHost(req) {
  const raw = req.headers.referer || req.headers.referrer || '';
  if (!raw) return '';
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isPortalReferer(req) {
  const host = refererHost(req);
  if (!host) return false;
  if (PORTAL_HOSTS.has(host)) return true;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  return false;
}

function consumePortalTicket(ticket) {
  const body = JSON.stringify({ ticket, tool: 'monitoring' });
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(CONSUME_URL);
    } catch (e) {
      reject(e);
      return;
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        rejectUnauthorized: false,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: null, raw: data.slice(0, 200) });
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
  });
}

function deniedHtml() {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Accesso negato — Monitoring</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      font-family:system-ui,sans-serif;background:#030E1C;color:#C8F0E8;padding:1.5rem;text-align:center}
    a{color:#00C8FF}
    p{max-width:28rem;line-height:1.5;opacity:.9}
  </style>
</head>
<body>
  <div>
    <h1 style="font-size:1.25rem;margin:0 0 .75rem">Accesso solo dal portale</h1>
    <p>La pagina Monitoring non è raggiungibile con un link diretto.
      Aprila dalla dashboard del portale operativo.</p>
    <p><a href="${PORTAL_HOME}">Vai al portale</a></p>
  </div>
</body>
</html>`;
}

function ssoBridgeHtml(ticket) {
  const safe = JSON.stringify(String(ticket || ''));
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Accesso Monitoring…</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      font-family:system-ui,sans-serif;background:#030E1C;color:#C8F0E8}
  </style>
</head>
<body>
  <p id="msg">Accesso dal portale in corso…</p>
  <script>
    (function () {
      var ticket = ${safe};
      var msg = document.getElementById('msg');
      if (!ticket) {
        msg.textContent = 'Ticket mancante. Torna al portale.';
        return;
      }
      fetch('/holdertrack/api/portal-sso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ticket: ticket })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) {
          if (x.ok && x.d && x.d.ok) {
            window.location.replace('/holdertrack/monitor.php');
            return;
          }
          var err = (x.d && x.d.error) ? x.d.error : 'Accesso non riuscito.';
          msg.innerHTML = err + ' <a href="${PORTAL_HOME}" style="color:#00C8FF">Torna al portale</a> e riprova.';
        })
        .catch(function () {
          msg.innerHTML = 'Errore di rete. <a href="${PORTAL_HOME}" style="color:#00C8FF">Torna al portale</a>.';
        });
    })();
  </script>
</body>
</html>`;
}

function establishSession(res, email, accountType) {
  const neverExpire = isStrumentoAccountType(accountType, email);
  const row = {
    exp: sessionExpiry(neverExpire),
    email: String(email || '').trim(),
    accountType: neverExpire ? 'strumento' : (accountType || 'user'),
    neverExpire,
  };
  const token = signSession(row);
  setSessionCookie(res, token, neverExpire);
  return { token, row };
}

async function resolvePortalTicket(ticket) {
  const th = hashToken(ticket);
  purgeSessions();

  const cached = ssoRecent.get(th);
  if (cached && cached.exp > Date.now()) {
    return {
      ok: true,
      email: cached.email,
      accountType: cached.accountType,
      reuseToken: cached.token,
    };
  }

  if (ssoInflight.has(th)) {
    return ssoInflight.get(th);
  }

  const pending = consumePortalTicket(ticket)
    .then((portal) => {
      if (!portal || portal.status !== 200 || !portal.body) {
        return {
          ok: false,
          status: portal && portal.status,
          body: portal && portal.body,
          raw: portal && portal.raw,
        };
      }
      return {
        ok: true,
        email: String(portal.body.email || portal.body.displayName || portal.body.username || '').trim(),
        accountType: String(portal.body.accountType || '').trim(),
      };
    })
    .finally(() => {
      ssoInflight.delete(th);
    });

  ssoInflight.set(th, pending);
  return pending;
}

/** POST /holdertrack/api/portal-sso — fuori dal gate HTML */
async function portalSsoHandler(req, res) {
  const ticket = String((req.body && req.body.ticket) || '').trim();
  if (!ticket) {
    return res.status(400).json({ ok: false, error: 'Ticket mancante.' });
  }
  try {
    const result = await resolvePortalTicket(ticket);
    if (!result.ok) {
      const stale = ssoRecent.get(hashToken(ticket));
      if (stale && stale.exp > Date.now()) {
        const neverExpire = isStrumentoAccountType(stale.accountType, stale.email);
        setSessionCookie(res, stale.token, neverExpire);
        return res.json({ ok: true, email: stale.email, replay: true });
      }
      console.error('[portal-auth] SSO reject:', result.status, result.body || result.raw);
      return res.status(401).json({
        ok: false,
        error: (result.body && result.body.error) || 'Ticket scaduto o non valido.',
      });
    }

    let token;
    let email = result.email;
    const accountType = result.accountType;
    const neverExpire = isStrumentoAccountType(accountType, email);
    if (result.reuseToken) {
      token = result.reuseToken;
      setSessionCookie(res, token, neverExpire);
    } else {
      const established = establishSession(res, email, accountType);
      token = established.token;
      ssoRecent.set(hashToken(ticket), {
        token,
        email,
        accountType: established.row.accountType,
        exp: Date.now() + SSO_CACHE_TTL_MS,
      });
    }
    console.log(
      '[portal-auth] SSO ok for',
      email || '(no email)',
      neverExpire ? '(strumento, no expiry)' : ''
    );
    return res.json({ ok: true, email, accountType: neverExpire ? 'strumento' : accountType || 'user' });
  } catch (e) {
    console.error('[portal-auth] SSO consume failed:', e.message);
    return res.status(502).json({ ok: false, error: 'Portale non raggiungibile.' });
  }
}

function deny(req, res) {
  const isApi = (req.path || '').startsWith('/api/') || (req.path || '').includes('/api/');
  // Non cancellare il cookie sulle API: un 401 sul poll svuotava la pagina kiosk.
  if (!isApi) clearSessionCookie(res);
  if (isApi) {
    return res.status(401).json({ error: 'Apri Monitoring dal portale.' });
  }
  return res.status(403).type('html').send(deniedHtml());
}

async function requirePortalAccess(req, res, next) {
  // Bridge SSO: non consumare su GET (evita doppie richieste del browser)
  const ticket = String((req.query && req.query.sso) || '').trim();
  if (ticket && isHtmlEntry(req) && req.method === 'GET') {
    return res.status(200).type('html').send(ssoBridgeHtml(ticket));
  }

  const session = readSession(req);
  const html = isHtmlEntry(req);

  if (session) {
    if (html) {
      const site = String(req.headers['sec-fetch-site'] || '').toLowerCase();
      if (site === 'cross-site' && !isPortalReferer(req)) {
        return deny(req, res);
      }
    }
    req.portalUser = session;
    return next();
  }

  return deny(req, res);
}

module.exports = {
  requirePortalAccess,
  portalSsoHandler,
  PORTAL_HOME,
};
