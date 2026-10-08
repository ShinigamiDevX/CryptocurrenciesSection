const { connectDb } = require('./db');
const { PORTAL_HOME } = require('./portalAuth');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shortName(name, max = 12) {
  const n = String(name || 'Sconosciuto');
  return n.length > max ? `${n.slice(0, max - 3)}...` : n;
}

function shortAddress(address) {
  const a = String(address || '');
  if (a.length <= 22) return a;
  return `${a.slice(0, 10)} ... ${a.slice(-10)}`;
}

function formatBalance(balance) {
  const n = Number(balance);
  if (!Number.isFinite(n)) return '0.00';
  if (n === 0) return '0.00';
  if (n < 0.01) return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return n.toFixed(2);
}

function explorerUrl(chain, address) {
  if (chain === 'ETH') {
    return `https://ethplorer.io/address/${encodeURIComponent(address)}`;
  }
  return `https://www.blockchain.com/btc/address/${encodeURIComponent(address)}`;
}

function chainBadgeClass(chain) {
  return chain === 'ETH' ? 'bg-primary' : 'bg-warning';
}

function chainIcon(chain) {
  return chain === 'ETH' ? 'fa-ethereum' : 'fa-btc';
}

function nameBadgeStyle(name) {
  const n = String(name || '');
  if (n.length <= 10) {
    return 'padding-left:25px; padding-right:25px;';
  }
  return '';
}

async function getMonitoredAddresses() {
  const connection = await connectDb();
  try {
    const [rows] = await connection.execute(`
      SELECT
        i.id,
        i.indirizzo,
        i.blockchain,
        i.balance,
        i.note,
        i.data,
        p.nome,
        DATEDIFF(CURDATE(), i.data) AS giorni
      FROM indirizzi AS i
      JOIN proprietari AS p ON i.proid = p.id
      WHERE i.monitoring = 1
      ORDER BY COALESCE(DATEDIFF(CURDATE(), i.data), 0) DESC, i.balance DESC
    `);
    return rows;
  } finally {
    await connection.end();
  }
}

async function searchAddresses(query) {
  const connection = await connectDb();
  try {
    const q = `%${query}%`;
    const [rows] = await connection.execute(`
      SELECT
        i.id,
        i.indirizzo,
        i.blockchain,
        i.balance,
        i.monitoring,
        i.note,
        p.nome
      FROM indirizzi AS i
      JOIN proprietari AS p ON i.proid = p.id
      WHERE i.indirizzo LIKE ? OR p.nome LIKE ? OR i.note LIKE ?
      ORDER BY i.monitoring DESC, p.nome ASC
      LIMIT 40
    `, [q, q, q]);
    return rows;
  } finally {
    await connection.end();
  }
}

async function getOwners() {
  const connection = await connectDb();
  try {
    const [rows] = await connection.execute(
      'SELECT id, nome FROM proprietari ORDER BY nome ASC LIMIT 2000'
    );
    return rows;
  } finally {
    await connection.end();
  }
}

async function setMonitoring(id, enabled) {
  const connection = await connectDb();
  try {
    const [result] = await connection.execute(
      'UPDATE indirizzi SET monitoring = ? WHERE id = ?',
      [enabled ? 1 : 0, id]
    );
    return result.affectedRows > 0;
  } finally {
    await connection.end();
  }
}

async function createAndMonitor({ indirizzo, blockchain, proid, note }) {
  const connection = await connectDb();
  try {
    const chain = String(blockchain || 'BTC').toUpperCase();
    const addr = String(indirizzo || '').trim();
    const ownerId = Number(proid);
    if (!addr || !ownerId) {
      throw new Error('Indirizzo e proprietario obbligatori');
    }

    const [existing] = await connection.execute(
      'SELECT id, monitoring FROM indirizzi WHERE indirizzo = ? LIMIT 1',
      [addr]
    );
    if (existing.length) {
      await connection.execute('UPDATE indirizzi SET monitoring = 1 WHERE id = ?', [existing[0].id]);
      return { id: existing[0].id, created: false };
    }

    const [result] = await connection.execute(
      `INSERT INTO indirizzi (indirizzo, blockchain, note, data, proid, monitoring, balance)
       VALUES (?, ?, ?, CURDATE(), ?, 1, 0)`,
      [addr, chain, note || '', ownerId]
    );
    return { id: result.insertId, created: true };
  } finally {
    await connection.end();
  }
}

function renderRows(rows) {
  return rows.map((row) => {
    const chain = String(row.blockchain || 'BTC').toUpperCase();
    const address = row.indirizzo;
    const nome = row.nome || 'Sconosciuto';
    const balance = formatBalance(row.balance);
    const giorni = row.giorni == null ? '-' : String(row.giorni);
    const explorer = explorerUrl(chain, address);

    return `<tr data-id="${row.id}">
      <td class="col-live">
        <div class="bubble-wrap">
          <div class="bubble">
            <span class="bubble-outer-dot"><span class="bubble-inner-dot"></span></span>
          </div>
        </div>
      </td>
      <td class="col-name"><span class="badge rounded-pill bg-secondary name-badge" title="${escapeHtml(nome)}" data-full="${escapeHtml(nome)}">${escapeHtml(nome)}</span></td>
      <td class="col-chain text-center">
        <a href="${escapeHtml(explorer)}" target="_blank" rel="noopener noreferrer" class="badge rounded-pill ${chainBadgeClass(chain)}" title="Apri Explorer">${escapeHtml(chain)}</a>
      </td>
      <td class="col-bal"><span class="badge rounded-pill bg-secondary bal-badge"><i class="fa ${chainIcon(chain)}" aria-hidden="true"></i> ${escapeHtml(balance)}</span></td>
      <td class="col-addr"><h6 class="addr-text" onclick="copy(this)" data-address="${escapeHtml(address)}" data-full="${escapeHtml(address)}" title="Clicca per copiare">${escapeHtml(address)}</h6></td>
      <td class="col-days text-center"><span class="badge rounded-pill bg-secondary" title="Giorni dalla data registrata">${escapeHtml(giorni)}</span></td>
      <td class="col-actions text-center">
        <button type="button" class="btn-icon btn-del" title="Rimuovi dal monitoraggio" data-id="${row.id}" data-address="${escapeHtml(address)}">
          <i class="fa fa-trash" aria-hidden="true"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
}

function renderMonitorPage(rows) {
  const count = rows.length;
  const btc = rows.filter((r) => String(r.blockchain).toUpperCase() === 'BTC').length;
  const eth = rows.filter((r) => String(r.blockchain).toUpperCase() === 'ETH').length;

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/holdertrack/live.css">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-EVSTQN3/azprG1Anm3QDgpJLIm9Nao0Yz1ztcQTwFspd3yD65VohhpuuCOmLASjC" crossorigin="anonymous">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/css/toastr.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.5.0/jquery.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/js/toastr.min.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/sweetalert2@10.10.1/dist/sweetalert2.min.css">
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@10.10.1/dist/sweetalert2.all.min.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/fork-awesome@1.2.0/css/fork-awesome.min.css" integrity="sha256-XoaMnoYC5TH6/+ihMEnospgm0J1PM/nioxbOUdnM8HY=" crossorigin="anonymous">
  <title>HolderTrack</title>
</head>
<body data-portal-home="${escapeHtml(PORTAL_HOME)}">
  <div class="monitor-stage">
    <div class="monitor-map">
      <iframe src="https://coin360.com/widget/map?utm_source=embed_map" frameborder="0" title="Coin360.com: Cryptocurrency Market State"></iframe>
    </div>
    <div class="monitor-foreground" id="monitorPanel">
      <div class="riquadro" id="monitorWindow">
        <div class="riquadro-header">
          <div>
            <h4 class="titolo">Stai monitorando:</h4>
            <p class="monitor-meta" id="monitorMeta">${count} indirizzi attivi · ${eth} ETH · ${btc} BTC · aggiornamento automatico ogni 60s</p>
          </div>
          <div class="header-actions">
            <button type="button" class="btn-tool btn-add" id="btnAdd" title="Aggiungi indirizzo">
              <i class="fa fa-plus" aria-hidden="true"></i> Aggiungi
            </button>
          </div>
        </div>
        <div class="monitor-scroll">
          <table class="table table-borderless monitor-table" id="monitorTable">
            <colgroup id="monitorCols">
              <col class="c-live" style="width:36px">
              <col class="c-name" style="width:120px">
              <col class="c-chain" style="width:70px">
              <col class="c-bal" style="width:110px">
              <col class="c-addr" style="width:180px">
              <col class="c-days" style="width:70px">
              <col class="c-actions" style="width:44px">
            </colgroup>
            <thead>
              <tr class="col-resizers">
                <th></th>
                <th><span class="col-label" data-sort="nome">Nome<span class="sort-ind"></span></span><span class="col-resizer" data-col="1"></span></th>
                <th><span class="col-label" data-sort="blockchain">Chain<span class="sort-ind"></span></span><span class="col-resizer" data-col="2"></span></th>
                <th><span class="col-label" data-sort="balance">Balance<span class="sort-ind"></span></span><span class="col-resizer" data-col="3"></span></th>
                <th><span class="col-label" data-sort="indirizzo">Indirizzo<span class="sort-ind"></span></span><span class="col-resizer" data-col="4"></span></th>
                <th><span class="col-label" data-sort="giorni">Giorni<span class="sort-ind"></span></span><span class="col-resizer" data-col="5"></span></th>
                <th></th>
              </tr>
            </thead>
            <tbody id="monitorBody">
              ${renderRows(rows)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div class="modal-backdrop" id="addModal" hidden>
    <div class="modal-card">
      <div class="modal-head">
        <h5>Aggiungi al monitoraggio</h5>
        <button type="button" class="btn-icon" id="btnCloseModal" title="Chiudi"><i class="fa fa-times"></i></button>
      </div>
      <div class="modal-body">
        <label class="form-label">Cerca indirizzo esistente</label>
        <input type="text" class="form-control dark-input" id="searchInput" placeholder="Indirizzo, nome o nota...">
        <div class="search-results" id="searchResults"></div>
        <hr class="modal-sep">
        <p class="modal-hint">Oppure crea un nuovo indirizzo:</p>
        <div class="row g-2">
          <div class="col-12">
            <input type="text" class="form-control dark-input" id="newAddress" placeholder="Indirizzo wallet">
          </div>
          <div class="col-4">
            <select class="form-select dark-input" id="newChain">
              <option value="BTC">BTC</option>
              <option value="ETH">ETH</option>
            </select>
          </div>
          <div class="col-8">
            <select class="form-select dark-input" id="newOwner">
              <option value="">Seleziona proprietario...</option>
            </select>
          </div>
          <div class="col-12">
            <input type="text" class="form-control dark-input" id="newNote" placeholder="Nota (opzionale)">
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn-tool" id="btnCancelModal">Annulla</button>
        <button type="button" class="btn-tool btn-add" id="btnCreateMonitor">Aggiungi nuovo</button>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/js/bootstrap.bundle.min.js" integrity="sha384-MrcW6ZMFYlzcLA8Nl+NtUVF0sA7MsXsP1UyJoMp4YLEuNSfAP+JcXn/tWtIaxVXM" crossorigin="anonymous"></script>
  <script>
    (function () {
      try {
        var u = new URL(window.location.href);
        if (u.searchParams.has('sso') || u.searchParams.has('_pe')) {
          u.searchParams.delete('sso');
          u.searchParams.delete('_pe');
          var clean = u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '');
          window.history.replaceState({}, '', clean);
        }
      } catch (e) {}
    })();
  </script>
  <script src="/holdertrack/jsmon.js?v=6"></script>
</body>
</html>`;
}

async function monitorPageHandler(req, res) {
  try {
    const rows = await getMonitoredAddresses();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderMonitorPage(rows));
  } catch (error) {
    console.error('Failed to render monitor page:', error);
    res.status(500).send('Errore nel caricamento della pagina di monitoraggio.');
  }
}

async function monitoredApiHandler(req, res) {
  try {
    const rows = await getMonitoredAddresses();
    res.json({ count: rows.length, addresses: rows });
  } catch (error) {
    console.error('Failed to fetch monitored addresses:', error);
    res.status(500).json({ error: 'Errore nel recupero degli indirizzi monitorati.' });
  }
}

async function searchApiHandler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ results: [] });
    }
    const results = await searchAddresses(q);
    res.json({ results });
  } catch (error) {
    console.error('Failed to search addresses:', error);
    res.status(500).json({ error: 'Errore nella ricerca.' });
  }
}

async function ownersApiHandler(req, res) {
  try {
    const owners = await getOwners();
    res.json({ owners });
  } catch (error) {
    console.error('Failed to fetch owners:', error);
    res.status(500).json({ error: 'Errore nel recupero proprietari.' });
  }
}

async function enableMonitorHandler(req, res) {
  try {
    const { id, indirizzo, blockchain, proid, note } = req.body || {};
    if (id) {
      const ok = await setMonitoring(Number(id), true);
      if (!ok) return res.status(404).json({ error: 'Indirizzo non trovato.' });
      return res.json({ ok: true, id: Number(id) });
    }
    const result = await createAndMonitor({ indirizzo, blockchain, proid, note });
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('Failed to enable monitoring:', error);
    res.status(400).json({ error: error.message || 'Errore abilitazione monitoraggio.' });
  }
}

async function disableMonitorHandler(req, res) {
  try {
    const id = Number(req.params.id);
    const ok = await setMonitoring(id, false);
    if (!ok) return res.status(404).json({ error: 'Indirizzo non trovato.' });
    res.json({ ok: true });
  } catch (error) {
    console.error('Failed to disable monitoring:', error);
    res.status(500).json({ error: 'Errore rimozione monitoraggio.' });
  }
}

module.exports = {
  monitorPageHandler,
  monitoredApiHandler,
  searchApiHandler,
  ownersApiHandler,
  enableMonitorHandler,
  disableMonitorHandler,
  getMonitoredAddresses,
  renderRows
};
