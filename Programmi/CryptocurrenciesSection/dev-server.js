'use strict';
// Server di sviluppo locale: replica il routing di nginx.conf senza Docker.
// Uso: node dev-server.js   (richiede il servizio auth attivo su porta 4000)
// Poi apri https://192.168.4.80:5200  (HTTP :5201 reindirizza a HTTPS)

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const HTTP_PORT  = 5201;
const HTTPS_PORT = 5200;
const ROOT      = __dirname;
const AUTH_PORT = 4000;
const CLUSTER_PORT = 3000;
const ANALISI_PORT = 5001;

// Route "pulite" come in nginx.conf
const PAGE_ROUTES = {
    '/':                '/index.html',
    '/login':           '/login.html',
    '/register':        '/register.html',
    '/portal':          '/portal.html',
    '/gestione-utenti': '/gestione-utenti.html',
    '/profilo':         '/profilo.html',
    '/corsi':           '/corsi.html',
    '/corsi-storico':   '/corsi-storico.html',
    '/corsi-gestione':  '/corsi-gestione.html',
    '/analisi-report':  '/analisi-report.html',
};

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.pdf':  'application/pdf',
    '.csv':  'text/csv',
};

function proxy(req, res, targetPort, rewritePath) {
    const options = {
        host: '127.0.0.1',
        port: targetPort,
        path: rewritePath,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
    };
    const upstream = http.request(options, (upRes) => {
        res.writeHead(upRes.statusCode, upRes.headers);
        upRes.pipe(res);
    });
    upstream.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Servizio sulla porta ${targetPort} non raggiungibile.` }));
    });
    req.pipe(upstream);
}

function serveStatic(req, res, urlPath) {
    const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }
    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
    });
}

function handleRequest(req, res) {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);

    if (urlPath.startsWith('/api/auth/')) {
        proxy(req, res, AUTH_PORT, req.url);
        return;
    }
    if (urlPath.startsWith('/cluster/')) {
        proxy(req, res, CLUSTER_PORT, req.url.replace(/^\/cluster/, '') || '/');
        return;
    }
    if (urlPath.startsWith('/api/analisi/')) {
        proxy(req, res, ANALISI_PORT, req.url);
        return;
    }
    serveStatic(req, res, PAGE_ROUTES[urlPath] || urlPath);
}

const certCandidates = [
    path.join(ROOT, 'certs', 'server.cert'),
    path.join(ROOT, '..', 'crypto-monitor', 'certs', 'server.cert'),
];
const certPath = certCandidates.find((p) => fs.existsSync(p));
const keyPath  = certPath ? certPath.replace(/\.cert$/i, '.key') : '';

if (!certPath || !fs.existsSync(keyPath)) {
    console.error('[DEV] Certificati HTTPS non trovati. Avvio solo HTTP.');
    http.createServer(handleRequest).listen(HTTP_PORT, '0.0.0.0', () => {
        console.log(`[DEV] Portale disponibile su http://localhost:${HTTP_PORT}`);
        console.log(`[DEV] Proxy /api/auth/ -> :${AUTH_PORT}, /cluster/ -> :${CLUSTER_PORT}, /api/analisi/ -> :${ANALISI_PORT}`);
    });
} else {
    https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, handleRequest)
        .listen(HTTPS_PORT, '0.0.0.0', () => {
            console.log(`[DEV] Portale HTTPS su https://192.168.4.80:${HTTPS_PORT} (cert: ${certPath})`);
            console.log(`[DEV] Proxy /api/auth/ -> :${AUTH_PORT}, /cluster/ -> :${CLUSTER_PORT}, /api/analisi/ -> :${ANALISI_PORT}`);
        });
    http.createServer((req, res) => {
        const host = (req.headers.host || `192.168.4.80:${HTTP_PORT}`).replace(/:\d+$/, `:${HTTPS_PORT}`);
        res.writeHead(301, { Location: `https://${host}${req.url}` });
        res.end();
    }).listen(HTTP_PORT, '0.0.0.0', () => {
        console.log(`[DEV] HTTP :${HTTP_PORT} reindirizza a HTTPS :${HTTPS_PORT}`);
    });
}
