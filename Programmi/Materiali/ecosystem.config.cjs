module.exports = {
  apps: [{
    name: 'materiali',
    script: 'scripts/start-https.js',
    interpreter: process.execPath,
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    windowsHide: true,
    env: {
      PORT: '5174',
      HOST: '0.0.0.0'
    }
  }]
};
