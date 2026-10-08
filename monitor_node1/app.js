const path = require('path');
const express = require('express');
const { scheduleJob } = require('node-schedule');
const { fetchAddresses } = require('./utils');
const {
  monitorPageHandler,
  monitoredApiHandler,
  searchApiHandler,
  ownersApiHandler,
  enableMonitorHandler,
  disableMonitorHandler
} = require('./monitorPage');
const { requirePortalAccess, portalSsoHandler, PORTAL_HOME } = require('./portalAuth');
require('dotenv').config();

const app = express();

app.use((req, res, next) => {
  if (req.url.includes('//')) {
    req.url = req.url.replace(/\/{2,}/g, '/');
  }
  next();
});

app.use(express.json());

app.get('/', (req, res) => {
  res.redirect(PORTAL_HOME);
});

// Vecchi bookmark senza /holdertrack/
app.get(['/monitor.php', '/monitor'], (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(302, `/holdertrack/monitor.php${q}`);
});

// Consume SSO (POST) prima del gate, come CryptoMonitor
app.post('/holdertrack/api/portal-sso', portalSsoHandler);

app.use('/holdertrack', express.static(path.join(__dirname, 'public', 'holdertrack'), {
  etag: false,
  index: false,
  setHeaders(res, filePath) {
    if (/\.(js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

app.use('/holdertrack', requirePortalAccess);

app.get(['/holdertrack/monitor.php', '/holdertrack/monitor'], monitorPageHandler);
app.get('/holdertrack/api/monitored', monitoredApiHandler);
app.get('/holdertrack/api/search', searchApiHandler);
app.get('/holdertrack/api/owners', ownersApiHandler);
app.post('/holdertrack/api/monitor', enableMonitorHandler);
app.delete('/holdertrack/api/monitor/:id', disableMonitorHandler);

scheduleJob('*/9 * * * *', function () {
  console.log('Scheduled job started at:', new Date());
  fetchAddresses();
});

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Monitor page (solo dal portale): http://localhost:${PORT}/holdertrack/monitor.php`);
  fetchAddresses();
});
