/**
 * GELATO LAN wrapper.
 * The bundled UI calls crypto.randomUUID(), which browsers expose only in a
 * secure context (HTTPS or localhost). Opening http://192.168.4.80:5005 is
 * neither, so React never mounts and the page stays white.
 * This process runs the vendor exe on loopback and injects a polyfill into HTML.
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PUBLIC_HOST = process.env.GELATO_PUBLIC_HOST || '0.0.0.0';
const PUBLIC_PORT = Number(process.env.PORT || 5005);
const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = Number(process.env.GELATO_BACKEND_PORT || 5006);
const EXE_NAME = 'gelato2.1_win.exe';

const POLYFILL = `<script>
(function () {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID === 'function') return;
  crypto.randomUUID = function randomUUID() {
    var bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  };
})();
</script>`;

function killTree(pid) {
  if (!pid) return;
  spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
    windowsHide: true,
    stdio: 'ignore',
  });
}

const exe = spawn(path.join(__dirname, EXE_NAME), [], {
  cwd: __dirname,
  windowsHide: true,
  stdio: ['ignore', 'inherit', 'inherit'],
  env: {
    ...process.env,
    VITE_ENVIRONMENT: process.env.VITE_ENVIRONMENT || 'docker',
    PORT: String(BACKEND_PORT),
  },
});

exe.on('exit', (code, signal) => {
  console.error(`GELATO exe exited code=${code} signal=${signal}`);
  process.exit(code || 1);
});

function proxyRequest(req, res) {
  const hopByHop = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
  ]);
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!hopByHop.has(key.toLowerCase())) headers[key] = value;
  }
  headers.host = `${BACKEND_HOST}:${BACKEND_PORT}`;

  const upstream = http.request(
    {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (incoming) => {
      const contentType = String(incoming.headers['content-type'] || '');
      const isHtml = contentType.includes('text/html');
      if (!isHtml) {
        res.writeHead(incoming.statusCode || 502, incoming.headers);
        incoming.pipe(res);
        return;
      }
      const chunks = [];
      incoming.on('data', (chunk) => chunks.push(chunk));
      incoming.on('end', () => {
        let html = Buffer.concat(chunks).toString('utf8');
        if (!html.includes('crypto.randomUUID')) {
          html = html.replace(/<head([^>]*)>/i, `<head$1>${POLYFILL}`);
        }
        const outHeaders = { ...incoming.headers };
        delete outHeaders['content-length'];
        delete outHeaders['transfer-encoding'];
        res.writeHead(incoming.statusCode || 200, outHeaders);
        res.end(html);
      });
    }
  );

  upstream.on('error', (err) => {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('GELATO backend non disponibile. Riprova tra qualche secondo.');
    console.error('GELATO proxy error:', err.message);
  });

  req.pipe(upstream);
}

const server = http.createServer(proxyRequest);
server.listen(PUBLIC_PORT, PUBLIC_HOST, () => {
  console.log(`GELATO proxy http://${PUBLIC_HOST}:${PUBLIC_PORT} -> ${BACKEND_HOST}:${BACKEND_PORT}`);
});

function shutdown() {
  server.close();
  killTree(exe.pid);
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => killTree(exe.pid));
