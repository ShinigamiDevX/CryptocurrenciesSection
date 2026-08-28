// Avvia server HTTPS in rete (porta 5174, accessibile da tutti i PC)
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

const root = path.join(__dirname, '..');
const sslDir = path.join(root, 'ssl');
const certPath = path.join(sslDir, 'cert.pem');
const keyPath = path.join(sslDir, 'key.pem');

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.log('Creazione certificato SSL...');
  execSync('node scripts/create-cert.js', { stdio: 'inherit', cwd: root });
}

const PORT = process.env.PORT || '5174';
const HOST = process.env.HOST || '0.0.0.0';
console.log('Server HTTPS in ascolto su tutte le interfacce (rete locale)');
console.log('  Da questo PC:    https://localhost:' + PORT + '/home.html');
console.log('  Da altri PC:    https://192.168.4.80:' + PORT + '/home.html');
const child = spawn('npx', ['http-server', '-p', PORT, '-a', HOST, '-S', '-C', 'ssl/cert.pem', '-K', 'ssl/key.pem', '-c-1'], {
  stdio: 'inherit',
  shell: true,
  cwd: root
});
child.on('error', (err) => { console.error(err); process.exit(1); });
child.on('exit', (code) => process.exit(code || 0));
