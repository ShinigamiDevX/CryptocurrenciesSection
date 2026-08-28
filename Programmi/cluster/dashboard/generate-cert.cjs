const fs = require('fs');
const path = require('path');
const selfsigned = require(path.join(__dirname, '..', '..', 'crypto-monitor', 'node_modules', 'selfsigned'));

(async () => {
  const dir = path.join(__dirname, 'cert');
  fs.mkdirSync(dir, { recursive: true });
  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: '192.168.4.80' }],
    {
      days: 365,
      keySize: 2048,
      extensions: [{
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '192.168.4.80' },
        ],
      }],
    }
  );
  fs.writeFileSync(path.join(dir, 'key.pem'), pems.private);
  fs.writeFileSync(path.join(dir, 'cert.pem'), pems.cert);
  console.log('cluster cert SAN: localhost, 127.0.0.1, 192.168.4.80');
})().catch((e) => { console.error(e); process.exit(1); });
