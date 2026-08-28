module.exports = {
  apps: [{
    name: 'cryptomonitor',
    script: 'server.js',
    interpreter: process.execPath,
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    windowsHide: true,
    env: {
      NODE_ENV: 'production',
    },
  }],
};
