// Genera certificato autofirmato per HTTPS in locale (localhost)
const fs = require('fs');
const path = require('path');

let selfsigned;
try {
  selfsigned = require('selfsigned');
} catch (_) {
  console.log('Installazione pacchetto selfsigned...');
  require('child_process').execSync('npm install selfsigned --no-save', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  selfsigned = require('selfsigned');
}

async function main() {
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const extensions = [
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },   // DNS
        { type: 7, ip: '127.0.0.1' },      // IP
        { type: 7, ip: '192.168.4.80' },   // IP LAN
      ],
    },
  ];
  const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048, extensions });

  const dir = path.join(__dirname, '..', 'ssl');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, 'cert.pem'), pems.cert);
  fs.writeFileSync(path.join(dir, 'key.pem'), pems.private);

  console.log('Certificato creato in ssl/cert.pem e ssl/key.pem');
  console.log('SAN: localhost, 127.0.0.1, 192.168.4.80');
  console.log('Avvia con: npm run start:https');
}

main().catch((err) => { console.error(err); process.exit(1); });
