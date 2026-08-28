import selfsigned from 'selfsigned';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certsDir = path.join(__dirname, '..', 'certs');

if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
}

const attrs = [{ name: 'commonName', value: 'localhost' }];
const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, value: '127.0.0.1' }
];

const staticIp = process.env.STATIC_IP;
if (staticIp) {
    altNames.push({ type: 7, value: staticIp });
}

async function generate() {
    console.log('[Security] Generating SSL certificates...');
    try {
        // selfsigned v5+ can be async
        const pems = await selfsigned.generate(attrs, {
            days: 365,
            extensions: [{ name: 'subjectAltName', altNames }]
        });

        if (pems && pems.private && pems.cert) {
            fs.writeFileSync(path.join(certsDir, 'server.key'), pems.private);
            fs.writeFileSync(path.join(certsDir, 'server.cert'), pems.cert);
            console.log('[Security] Self-signed certificates generated in ./certs/');
        } else {
            console.error('[Error] Failed to generate certificates.');
            process.exit(1);
        }
    } catch (err) {
        console.error('[Error] Generation failed:', err);
        process.exit(1);
    }
}

generate();
