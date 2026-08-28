const path = require('path');

module.exports = {
  apps: [
    {
      name: 'cryptomonitor',
      script: 'server.js',
      interpreter: process.execPath,
      cwd: path.join(__dirname, 'crypto-monitor'),
      instances: 1,
      autorestart: true,
      watch: false,
      windowsHide: true,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'materiali',
      script: 'scripts/start-https.js',
      interpreter: process.execPath,
      cwd: path.join(__dirname, 'Materiali'),
      instances: 1,
      autorestart: true,
      watch: false,
      windowsHide: true,
      env: {
        PORT: '5174',
        HOST: '0.0.0.0',
      },
    },
    {
      name: 'cluster',
      script: 'cluster.js',
      interpreter: process.execPath,
      cwd: path.join(__dirname, 'cluster', 'dashboard'),
      instances: 1,
      autorestart: true,
      watch: false,
      windowsHide: true,
    },
  ],
};
