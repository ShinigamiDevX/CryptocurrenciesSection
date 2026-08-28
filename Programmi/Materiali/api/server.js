const express = require('express');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 3001);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL non configurata');
}

const pool = new Pool({ connectionString: DATABASE_URL });
const app = express();
app.use(express.json({ limit: '1mb' }));

function isValidKey(key) {
  return typeof key === 'string' && /^[a-zA-Z0-9_:-]+$/.test(key) && key.length <= 120;
}

// ─────────────────────── schema ───────────────────────

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_storage (
      key        TEXT PRIMARY KEY,
      value      JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS materiale (
      id               TEXT        NOT NULL,
      anno             TEXT        NOT NULL,
      tipo             TEXT        NOT NULL DEFAULT '',
      nome             TEXT        NOT NULL DEFAULT '',
      seriale          TEXT        NOT NULL DEFAULT '',
      fondo            TEXT        NOT NULL DEFAULT '',
      capitolo         TEXT        NOT NULL DEFAULT '',
      stato            TEXT        NOT NULL DEFAULT '',
      utente           TEXT        NOT NULL DEFAULT '',
      data_acquisto    TEXT        NOT NULL DEFAULT '',
      costo            NUMERIC(12,2) NOT NULL DEFAULT 0,
      garanzia         INTEGER     NOT NULL DEFAULT 1,
      note             TEXT        NOT NULL DEFAULT '',
      data_inserimento TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, anno)
    );

    CREATE TABLE IF NOT EXISTS licenze (
      id               TEXT        NOT NULL,
      anno             TEXT        NOT NULL,
      nome             TEXT        NOT NULL DEFAULT '',
      tipo             TEXT        NOT NULL DEFAULT '',
      account_utente   TEXT        NOT NULL DEFAULT '',
      fondo            TEXT        NOT NULL DEFAULT '',
      capitolo         TEXT        NOT NULL DEFAULT '',
      data_acquisto    TEXT        NOT NULL DEFAULT '',
      data_scadenza    TEXT        NOT NULL DEFAULT '',
      costo            NUMERIC(12,2) NOT NULL DEFAULT 0,
      note             TEXT        NOT NULL DEFAULT '',
      data_inserimento TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, anno)
    );

    CREATE TABLE IF NOT EXISTS fondi (
      id              TEXT          NOT NULL,
      anno            TEXT          NOT NULL,
      nome            TEXT          NOT NULL DEFAULT '',
      capitolo        TEXT          NOT NULL DEFAULT '',
      budget_iniziale NUMERIC(12,2) NOT NULL DEFAULT 0,
      budget_residuo  NUMERIC(12,2) NOT NULL DEFAULT 0,
      PRIMARY KEY (id, anno)
    );

    CREATE TABLE IF NOT EXISTS personale (
      id      TEXT NOT NULL,
      anno    TEXT NOT NULL,
      grado   TEXT NOT NULL DEFAULT '',
      nome    TEXT NOT NULL DEFAULT '',
      cognome TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (id, anno)
    );
  `);
}

// ─────────────────────── table routing ───────────────────────

const TABLE_MAP = {
  materiale_informatico: {
    table: 'materiale',
    toRow: (item, anno) => ({
      id: String(item.id || ''),
      anno,
      tipo: String(item.tipo || ''),
      nome: String(item.nome || ''),
      seriale: String(item.seriale || ''),
      fondo: String(item.fondo || ''),
      capitolo: String(item.capitolo || ''),
      stato: String(item.stato || ''),
      utente: String(item.utente || ''),
      data_acquisto: String(item.dataAcquisto || ''),
      costo: parseFloat(item.costo) || 0,
      garanzia: parseInt(item.garanzia, 10) || 1,
      note: String(item.note || ''),
      data_inserimento: item.dataInserimento || new Date().toISOString(),
    }),
    fromRow: (row) => ({
      id: row.id,
      tipo: row.tipo,
      nome: row.nome,
      seriale: row.seriale,
      fondo: row.fondo,
      capitolo: row.capitolo,
      stato: row.stato,
      utente: row.utente,
      dataAcquisto: row.data_acquisto || '',
      costo: row.costo != null ? String(Number(row.costo)) : '0',
      garanzia: row.garanzia,
      note: row.note,
      dataInserimento: row.data_inserimento,
    }),
    selectFn: (anno) =>
      pool.query('SELECT * FROM materiale WHERE anno=$1 ORDER BY data_inserimento ASC', [anno]),
    deleteFn: (client, anno) =>
      client.query('DELETE FROM materiale WHERE anno=$1', [anno]),
    upsertFn: (client, r) =>
      client.query(
        `INSERT INTO materiale
           (id,anno,tipo,nome,seriale,fondo,capitolo,stato,utente,data_acquisto,costo,garanzia,note,data_inserimento)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id,anno) DO UPDATE SET
           tipo=EXCLUDED.tipo, nome=EXCLUDED.nome, seriale=EXCLUDED.seriale,
           fondo=EXCLUDED.fondo, capitolo=EXCLUDED.capitolo, stato=EXCLUDED.stato,
           utente=EXCLUDED.utente, data_acquisto=EXCLUDED.data_acquisto,
           costo=EXCLUDED.costo, garanzia=EXCLUDED.garanzia, note=EXCLUDED.note,
           data_inserimento=EXCLUDED.data_inserimento`,
        [r.id,r.anno,r.tipo,r.nome,r.seriale,r.fondo,r.capitolo,r.stato,r.utente,
         r.data_acquisto,r.costo,r.garanzia,r.note,r.data_inserimento]
      ),
    keysFn: (prefix) =>
      pool.query(
        "SELECT DISTINCT 'materiale_informatico_'||anno AS key FROM materiale ORDER BY key ASC"
      ).then(({ rows }) => rows.map((r) => r.key).filter((k) => k.startsWith(prefix))),
  },

  licenze_database: {
    table: 'licenze',
    toRow: (item, anno) => ({
      id: String(item.id || ''),
      anno,
      nome: String(item.nome || ''),
      tipo: String(item.tipo || ''),
      account_utente: String(item.accountUtente || ''),
      fondo: String(item.fondo || ''),
      capitolo: String(item.capitolo || ''),
      data_acquisto: String(item.dataAcquisto || ''),
      data_scadenza: String(item.dataScadenza || ''),
      costo: parseFloat(item.costo) || 0,
      note: String(item.note || ''),
      data_inserimento: item.dataInserimento || new Date().toISOString(),
    }),
    fromRow: (row) => ({
      id: row.id,
      nome: row.nome,
      tipo: row.tipo,
      accountUtente: row.account_utente,
      fondo: row.fondo,
      capitolo: row.capitolo,
      dataAcquisto: row.data_acquisto || '',
      dataScadenza: row.data_scadenza || '',
      costo: row.costo != null ? String(Number(row.costo)) : '0',
      note: row.note,
      dataInserimento: row.data_inserimento,
    }),
    selectFn: (anno) =>
      pool.query('SELECT * FROM licenze WHERE anno=$1 ORDER BY data_inserimento ASC', [anno]),
    deleteFn: (client, anno) =>
      client.query('DELETE FROM licenze WHERE anno=$1', [anno]),
    upsertFn: (client, r) =>
      client.query(
        `INSERT INTO licenze
           (id,anno,nome,tipo,account_utente,fondo,capitolo,data_acquisto,data_scadenza,costo,note,data_inserimento)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id,anno) DO UPDATE SET
           nome=EXCLUDED.nome, tipo=EXCLUDED.tipo, account_utente=EXCLUDED.account_utente,
           fondo=EXCLUDED.fondo, capitolo=EXCLUDED.capitolo, data_acquisto=EXCLUDED.data_acquisto,
           data_scadenza=EXCLUDED.data_scadenza, costo=EXCLUDED.costo, note=EXCLUDED.note,
           data_inserimento=EXCLUDED.data_inserimento`,
        [r.id,r.anno,r.nome,r.tipo,r.account_utente,r.fondo,r.capitolo,
         r.data_acquisto,r.data_scadenza,r.costo,r.note,r.data_inserimento]
      ),
    keysFn: (prefix) =>
      pool.query(
        "SELECT DISTINCT 'licenze_database_'||anno AS key FROM licenze ORDER BY key ASC"
      ).then(({ rows }) => rows.map((r) => r.key).filter((k) => k.startsWith(prefix))),
  },

  fondi_database: {
    table: 'fondi',
    toRow: (item, anno) => ({
      id: String(item.id || ''),
      anno,
      nome: String(item.nome || ''),
      capitolo: String(item.capitolo || ''),
      budget_iniziale: parseFloat(item.budgetIniziale) || 0,
      budget_residuo: parseFloat(item.budgetResiduo) || 0,
    }),
    fromRow: (row) => ({
      id: row.id,
      nome: row.nome,
      capitolo: row.capitolo,
      budgetIniziale: row.budget_iniziale != null ? String(Number(row.budget_iniziale)) : '0',
      budgetResiduo: row.budget_residuo != null ? String(Number(row.budget_residuo)) : '0',
    }),
    selectFn: (anno) =>
      pool.query('SELECT * FROM fondi WHERE anno=$1 ORDER BY nome ASC', [anno]),
    deleteFn: (client, anno) =>
      client.query('DELETE FROM fondi WHERE anno=$1', [anno]),
    upsertFn: (client, r) =>
      client.query(
        `INSERT INTO fondi (id,anno,nome,capitolo,budget_iniziale,budget_residuo)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id,anno) DO UPDATE SET
           nome=EXCLUDED.nome, capitolo=EXCLUDED.capitolo,
           budget_iniziale=EXCLUDED.budget_iniziale, budget_residuo=EXCLUDED.budget_residuo`,
        [r.id,r.anno,r.nome,r.capitolo,r.budget_iniziale,r.budget_residuo]
      ),
    keysFn: (prefix) =>
      pool.query(
        "SELECT DISTINCT 'fondi_database_'||anno AS key FROM fondi ORDER BY key ASC"
      ).then(({ rows }) => rows.map((r) => r.key).filter((k) => k.startsWith(prefix))),
  },

  personale_database: {
    table: 'personale',
    toRow: (item, anno) => ({
      id: String(item.id || ''),
      anno,
      grado: String(item.grado || ''),
      nome: String(item.nome || ''),
      cognome: String(item.cognome || ''),
    }),
    fromRow: (row) => ({
      id: row.id,
      grado: row.grado,
      nome: row.nome,
      cognome: row.cognome,
    }),
    selectFn: (anno) =>
      pool.query('SELECT * FROM personale WHERE anno=$1 ORDER BY cognome ASC, nome ASC', [anno]),
    deleteFn: (client, anno) =>
      client.query('DELETE FROM personale WHERE anno=$1', [anno]),
    upsertFn: (client, r) =>
      client.query(
        `INSERT INTO personale (id,anno,grado,nome,cognome)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id,anno) DO UPDATE SET
           grado=EXCLUDED.grado, nome=EXCLUDED.nome, cognome=EXCLUDED.cognome`,
        [r.id,r.anno,r.grado,r.nome,r.cognome]
      ),
    keysFn: (prefix) =>
      pool.query(
        "SELECT DISTINCT 'personale_database_'||anno AS key FROM personale ORDER BY key ASC"
      ).then(({ rows }) => rows.map((r) => r.key).filter((k) => k.startsWith(prefix))),
  },
};

function resolveTable(key) {
  for (const [prefix, config] of Object.entries(TABLE_MAP)) {
    if (key === prefix || key.startsWith(prefix + '_')) {
      const anno = key.length > prefix.length ? key.slice(prefix.length + 1) : null;
      return { config, anno };
    }
  }
  return null;
}

// ─────────────────────── endpoints ───────────────────────

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'db_unavailable' });
  }
});

app.get('/api/storage/keys', async (req, res) => {
  const prefix = String(req.query.prefix || '');
  if (!/^[a-zA-Z0-9_:-]*$/.test(prefix) || prefix.length > 120) {
    return res.status(400).json({ error: 'prefix_non_valido' });
  }

  const allKeys = [];

  // chiavi da app_storage
  const { rows: storageRows } = await pool.query(
    'SELECT key FROM app_storage WHERE key LIKE $1 ORDER BY key ASC',
    [prefix + '%']
  );
  allKeys.push(...storageRows.map((r) => r.key));

  // chiavi dalle tabelle gestite
  for (const config of Object.values(TABLE_MAP)) {
    const keys = await config.keysFn(prefix);
    allKeys.push(...keys);
  }

  const unique = [...new Set(allKeys)].sort();
  return res.json({ keys: unique });
});

app.get('/api/storage/:key', async (req, res) => {
  const key = req.params.key;
  if (!isValidKey(key)) {
    return res.status(400).json({ error: 'key_non_valida' });
  }

  const resolved = resolveTable(key);
  if (resolved) {
    const { config, anno } = resolved;
    const { rows } = await config.selectFn(anno);
    return res.json({ key, value: rows.map(config.fromRow) });
  }

  const { rows } = await pool.query('SELECT value FROM app_storage WHERE key=$1', [key]);
  if (!rows.length) {
    return res.status(404).json({ error: 'not_found' });
  }
  return res.json({ key, value: rows[0].value });
});

app.put('/api/storage/:key', async (req, res) => {
  const key = req.params.key;
  if (!isValidKey(key)) {
    return res.status(400).json({ error: 'key_non_valida' });
  }
  if (typeof req.body !== 'object' || req.body === null ||
      !Object.prototype.hasOwnProperty.call(req.body, 'value')) {
    return res.status(400).json({ error: 'payload_non_valido' });
  }

  const value = req.body.value;
  const resolved = resolveTable(key);

  if (resolved) {
    const { config, anno } = resolved;
    const items = Array.isArray(value) ? value : [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await config.deleteFn(client, anno);
      for (const item of items) {
        await config.upsertFn(client, config.toRow(item, anno));
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return res.json({ ok: true });
  }

  await pool.query(
    `INSERT INTO app_storage (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
    [key, JSON.stringify(value)]
  );
  return res.json({ ok: true });
});

app.delete('/api/storage/:key', async (req, res) => {
  const key = req.params.key;
  if (!isValidKey(key)) {
    return res.status(400).json({ error: 'key_non_valida' });
  }

  const resolved = resolveTable(key);
  if (resolved) {
    const { config, anno } = resolved;
    const client = await pool.connect();
    try {
      await config.deleteFn(client, anno);
    } finally {
      client.release();
    }
    return res.json({ ok: true });
  }

  await pool.query('DELETE FROM app_storage WHERE key=$1', [key]);
  return res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

async function start() {
  await ensureSchema();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API in ascolto sulla porta ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Errore avvio API:', err);
  process.exit(1);
});
