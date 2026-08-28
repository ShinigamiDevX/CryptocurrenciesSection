module.exports = {
  apps: [{
    name: 'cluster',
    script: 'cluster.js',
    interpreter: process.execPath,
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    windowsHide: true,
  }],
};
