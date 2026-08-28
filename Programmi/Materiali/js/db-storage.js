(function () {
  const DATA_PREFIXES = [
    'fondi_database',
    'materiale_informatico',
    'licenze_database',
    'personale_database',
    'materiali_barcode_catalog'
  ];

  function isManagedKey(key) {
    if (!key || typeof key !== 'string') return false;
    return DATA_PREFIXES.some((prefix) => key === prefix || key.indexOf(prefix + '_') === 0);
  }

  function parseMaybeJson(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return raw;
    }
  }

  function syncRequest(method, url, body) {
    const xhr = new XMLHttpRequest();
    try {
      xhr.open(method, url, false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      const payload = body === undefined ? null : JSON.stringify(body);
      xhr.send(payload);
      if (xhr.status === 200) {
        return JSON.parse(xhr.responseText);
      }
      if (xhr.status === 204) {
        return { ok: true };
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  const DBStorage = {
    get: function (key, fallbackValue) {
      if (!isManagedKey(key)) return false;
      const response = syncRequest('GET', '/api/storage/' + encodeURIComponent(key));
      if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) return fallbackValue;
      return response.value;
    },

    getArray: function (key) {
      const value = this.get(key, []);
      return Array.isArray(value) ? value : [];
    },

    getObject: function (key) {
      const value = this.get(key, {});
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    },

    set: function (key, value) {
      if (!isManagedKey(key)) return false;
      const parsed = parseMaybeJson(value);
      const response = syncRequest('PUT', '/api/storage/' + encodeURIComponent(key), { value: parsed });
      return !!(response && response.ok);
    },

    remove: function (key) {
      if (!isManagedKey(key)) return false;
      const response = syncRequest('DELETE', '/api/storage/' + encodeURIComponent(key));
      return !!(response && response.ok);
    },

    getKeysByPrefix: function (prefix) {
      const response = syncRequest('GET', '/api/storage/keys?prefix=' + encodeURIComponent(prefix || ''));
      if (!response || !Array.isArray(response.keys)) return [];
      return response.keys;
    }
  };

  window.DBStorage = DBStorage;
})();
