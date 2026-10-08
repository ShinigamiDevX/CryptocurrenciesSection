const SIZE_KEY = 'holdertrack.monitor.window';
const COLS_KEY = 'holdertrack.monitor.cols';

function copy(el) {
  const full = el.getAttribute('data-address') || el.textContent.trim();
  if (!full) return;

  const done = () => {
    if (window.toastr) {
      toastr.success('Indirizzo copiato');
    } else if (window.Swal) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Indirizzo copiato',
        showConfirmButton: false,
        timer: 1500
      });
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(full).then(done).catch(() => fallbackCopy(full, done));
  } else {
    fallbackCopy(full, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    done();
  } catch (e) {
    console.error(e);
  }
  document.body.removeChild(ta);
}

function toast(message, type = 'success') {
  if (window.toastr) {
    toastr[type](message);
    return;
  }
  if (window.Swal) {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: type === 'error' ? 'error' : 'success',
      title: message,
      showConfirmButton: false,
      timer: 1800
    });
  }
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
  if (chain === 'ETH') return `https://ethplorer.io/address/${encodeURIComponent(address)}`;
  return `https://www.blockchain.com/btc/address/${encodeURIComponent(address)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rowHtml(row) {
  const chain = String(row.blockchain || 'BTC').toUpperCase();
  const address = row.indirizzo;
  const nome = row.nome || 'Sconosciuto';
  const balance = formatBalance(row.balance);
  const giorni = row.giorni == null ? '-' : String(row.giorni);
  const explorer = explorerUrl(chain, address);
  const chainClass = chain === 'ETH' ? 'bg-primary' : 'bg-warning';
  const icon = chain === 'ETH' ? 'fa-ethereum' : 'fa-btc';

  return `<tr data-id="${row.id}">
    <td class="col-live"><div class="bubble-wrap"><div class="bubble"><span class="bubble-outer-dot"><span class="bubble-inner-dot"></span></span></div></div></td>
    <td class="col-name"><span class="badge rounded-pill bg-secondary name-badge" title="${escapeHtml(nome)}" data-full="${escapeHtml(nome)}">${escapeHtml(nome)}</span></td>
    <td class="col-chain text-center"><a href="${escapeHtml(explorer)}" target="_blank" rel="noopener noreferrer" class="badge rounded-pill ${chainClass}" title="Apri Explorer">${escapeHtml(chain)}</a></td>
    <td class="col-bal"><span class="badge rounded-pill bg-secondary bal-badge"><i class="fa ${icon}" aria-hidden="true"></i> ${escapeHtml(balance)}</span></td>
    <td class="col-addr"><h6 class="addr-text" onclick="copy(this)" data-address="${escapeHtml(address)}" data-full="${escapeHtml(address)}" title="Clicca per copiare">${escapeHtml(address)}</h6></td>
    <td class="col-days text-center"><span class="badge rounded-pill bg-secondary" title="Giorni dalla data registrata">${escapeHtml(giorni)}</span></td>
    <td class="col-actions text-center"><button type="button" class="btn-icon btn-del" title="Rimuovi dal monitoraggio" data-id="${row.id}" data-address="${escapeHtml(address)}"><i class="fa fa-trash" aria-hidden="true"></i></button></td>
  </tr>`;
}

let measureCanvas = null;

function measureTextWidth(text, font) {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
}

function fitEndEllipsis(full, maxWidth, font) {
  if (!full) return '';
  if (measureTextWidth(full, font) <= maxWidth) return full;
  const ell = '…';
  let lo = 0;
  let hi = full.length;
  let best = ell;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = full.slice(0, mid) + ell;
    if (measureTextWidth(candidate, font) <= maxWidth) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function fitMiddleEllipsis(full, maxWidth, font) {
  if (!full) return '';
  if (measureTextWidth(full, font) <= maxWidth) return full;
  const sep = ' … ';
  if (measureTextWidth(sep, font) >= maxWidth) return '…';
  let best = '…';
  let left = 1;
  let right = 1;
  while (left + right < full.length) {
    const candidate = full.slice(0, left) + sep + full.slice(full.length - right);
    if (measureTextWidth(candidate, font) > maxWidth) break;
    best = candidate;
    if (left <= right) left += 1;
    else right += 1;
  }
  return best;
}

function refreshVisibleText() {
  document.querySelectorAll('.name-badge[data-full]').forEach((el) => {
    const full = el.getAttribute('data-full') || '';
    const style = getComputedStyle(el);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const maxWidth = Math.max(24, (el.parentElement?.clientWidth || el.clientWidth) - 4);
    el.textContent = fitEndEllipsis(full, Math.max(24, maxWidth - pad), font);
  });

  document.querySelectorAll('.addr-text[data-full]').forEach((el) => {
    const full = el.getAttribute('data-full') || el.getAttribute('data-address') || '';
    const style = getComputedStyle(el);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const maxWidth = Math.max(40, (el.parentElement?.clientWidth || el.clientWidth) - 8);
    el.textContent = fitMiddleEllipsis(full, maxWidth, font);
  });
}

function updateMeta(rows) {
  const btc = rows.filter((r) => String(r.blockchain).toUpperCase() === 'BTC').length;
  const eth = rows.filter((r) => String(r.blockchain).toUpperCase() === 'ETH').length;
  const el = document.getElementById('monitorMeta');
  if (el) {
    el.textContent = `${rows.length} indirizzi attivi · ${eth} ETH · ${btc} BTC · aggiornamento automatico ogni 60s`;
  }
}

let cachedRows = [];
let sortState = { key: null, dir: 'asc' };

function compareValues(a, b, key) {
  if (key === 'balance' || key === 'giorni' || key === 'id') {
    const na = Number(a[key]);
    const nb = Number(b[key]);
    const va = Number.isFinite(na) ? na : 0;
    const vb = Number.isFinite(nb) ? nb : 0;
    return va - vb;
  }
  const sa = String(a[key] ?? '').toLocaleLowerCase('it');
  const sb = String(b[key] ?? '').toLocaleLowerCase('it');
  return sa.localeCompare(sb, 'it', { sensitivity: 'base', numeric: true });
}

function getSortedRows(rows) {
  if (!sortState.key) return rows.slice();
  const dir = sortState.dir === 'desc' ? -1 : 1;
  return rows.slice().sort((a, b) => compareValues(a, b, sortState.key) * dir);
}

function updateSortIndicators() {
  document.querySelectorAll('.col-label[data-sort]').forEach((label) => {
    const ind = label.querySelector('.sort-ind');
    const active = label.dataset.sort === sortState.key;
    label.classList.toggle('is-sorted', active);
    if (!ind) return;
    if (!active) {
      ind.textContent = '';
      return;
    }
    ind.textContent = sortState.dir === 'asc' ? '▲' : '▼';
  });
}

function renderCachedRows() {
  const rows = getSortedRows(cachedRows);
  const body = document.getElementById('monitorBody');
  if (body) body.innerHTML = rows.map(rowHtml).join('');
  updateMeta(cachedRows);
  updateSortIndicators();
  requestAnimationFrame(refreshVisibleText);
}

function portalHomeUrl() {
  return document.body.getAttribute('data-portal-home') || '/';
}

function showSessionLost() {
  toast('Sessione scaduta. Riapri Monitoring dal portale.', 'error');
  const meta = document.getElementById('monitorMeta');
  if (meta && !meta.dataset.sessionLost) {
    meta.dataset.sessionLost = '1';
    meta.innerHTML = 'Sessione assente: <a href="' + escapeHtml(portalHomeUrl()) + '" style="color:#58a6ff">riapri dal portale</a> (gli indirizzi non sono stati cancellati)';
  }
}

async function reloadTable() {
  const res = await fetch('/holdertrack/api/monitored', { credentials: 'same-origin' });
  if (res.status === 401 || res.status === 403) {
    showSessionLost();
    return;
  }
  if (!res.ok) return;
  const data = await res.json().catch(() => ({}));
  if (!Array.isArray(data.addresses)) return;
  cachedRows = data.addresses;
  const meta = document.getElementById('monitorMeta');
  if (meta) delete meta.dataset.sessionLost;
  renderCachedRows();
}

function initColumnSort() {
  document.querySelectorAll('.col-label[data-sort]').forEach((label) => {
    label.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = label.dataset.sort;
      if (sortState.key === key) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.key = key;
        sortState.dir = 'asc';
      }
      renderCachedRows();
    });
  });
}

function restoreWindowSize() {
  const win = document.getElementById('monitorWindow');
  if (!win) return;
  try {
    const saved = JSON.parse(localStorage.getItem(SIZE_KEY) || '{}');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(saved.width || 640, 280), vw);
    const height = Math.min(Math.max(saved.height || Math.round(vh * 0.72), 180), vh);
    const left = Math.min(Math.max(saved.left ?? 16, 0), Math.max(0, vw - width));
    const top = Math.min(Math.max(saved.top ?? 16, 0), Math.max(0, vh - height));
    win.style.width = `${width}px`;
    win.style.height = `${height}px`;
    win.style.left = `${left}px`;
    win.style.top = `${top}px`;
  } catch (e) {
    win.style.left = '16px';
    win.style.top = '16px';
  }
}

function saveWindowSize() {
  const win = document.getElementById('monitorWindow');
  if (!win) return;
  const rect = win.getBoundingClientRect();
  localStorage.setItem(SIZE_KEY, JSON.stringify({
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    left: Math.round(rect.left),
    top: Math.round(rect.top)
  }));
}

function cursorForEdge(edge) {
  switch (edge) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
    default:
      return '';
  }
}

function isMoveBlockedTarget(target) {
  return Boolean(
    target.closest(
      'button, a, input, select, textarea, label, .col-resizer, .col-label, .edge-hit, .btn-icon, .btn-tool, .btn-del, .btn-add, .addr-text, h6, .monitor-table tbody'
    )
  );
}

function initWindowResize() {
  const win = document.getElementById('monitorWindow');
  const panel = document.getElementById('monitorPanel');
  if (!win || !panel) return;

  win.querySelectorAll('.edge-hit').forEach((el) => el.remove());
  ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach((edge) => {
    const hit = document.createElement('div');
    hit.className = 'edge-hit';
    hit.dataset.edge = edge;
    win.appendChild(hit);
  });

  restoreWindowSize();

  const minW = 280;
  const minH = 180;
  let mode = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let startW = 0;
  let startH = 0;
  let pending = null;
  let rafId = 0;
  let activePointerId = null;

  const applyPending = () => {
    rafId = 0;
    if (!pending) return;
    win.style.left = `${pending.left}px`;
    win.style.top = `${pending.top}px`;
    win.style.width = `${pending.width}px`;
    win.style.height = `${pending.height}px`;
    pending = null;
    refreshVisibleText();
  };

  const queueLayout = (left, top, width, height) => {
    pending = { left, top, width, height };
    if (!rafId) rafId = requestAnimationFrame(applyPending);
  };

  const beginInteract = (e, nextMode) => {
    e.preventDefault();
    e.stopPropagation();

    mode = nextMode;
    activePointerId = e.pointerId;
    const rect = win.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    startW = rect.width;
    startH = rect.height;

    win.classList.toggle('is-resizing', nextMode !== 'move');
    win.classList.toggle('is-moving', nextMode === 'move');
    panel.classList.add('resizing');
    document.body.style.cursor = nextMode === 'move' ? 'grabbing' : cursorForEdge(nextMode);
    document.body.style.userSelect = 'none';

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  };

  const onDragMove = (e) => {
    if (!mode) return;
    if (activePointerId != null && e.pointerId !== activePointerId) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = startLeft;
    let top = startTop;
    let width = startW;
    let height = startH;

    if (mode === 'move') {
      left = Math.max(0, Math.min(startLeft + dx, vw - startW));
      top = Math.max(0, Math.min(startTop + dy, vh - startH));
      queueLayout(left, top, width, height);
      return;
    }

    if (mode.includes('e')) {
      width = Math.min(vw - startLeft, Math.max(minW, startW + dx));
    }
    if (mode.includes('s')) {
      height = Math.min(vh - startTop, Math.max(minH, startH + dy));
    }
    if (mode.includes('w')) {
      const maxDx = startW - minW;
      const clampedDx = Math.max(-startLeft, Math.min(maxDx, dx));
      left = startLeft + clampedDx;
      width = startW - clampedDx;
      if (left + width > vw) width = vw - left;
    }
    if (mode.includes('n')) {
      const maxDy = startH - minH;
      const clampedDy = Math.max(-startTop, Math.min(maxDy, dy));
      top = startTop + clampedDy;
      height = startH - clampedDy;
      if (top + height > vh) height = vh - top;
    }

    left = Math.max(0, Math.min(left, vw - minW));
    top = Math.max(0, Math.min(top, vh - minH));
    width = Math.max(minW, Math.min(width, vw - left));
    height = Math.max(minH, Math.min(height, vh - top));
    queueLayout(left, top, width, height);
  };

  const onDragUp = (e) => {
    if (!mode) return;
    if (activePointerId != null && e && e.pointerId != null && e.pointerId !== activePointerId) return;

    mode = null;
    activePointerId = null;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (pending) applyPending();
    win.classList.remove('is-resizing', 'is-moving');
    panel.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    win.style.cursor = '';
    saveWindowSize();
  };

  win.querySelectorAll('.edge-hit').forEach((hit) => {
    hit.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || mode) return;
      beginInteract(e, hit.dataset.edge);
    });
  });

  win.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || mode) return;
    if (e.target.closest('.edge-hit')) return;
    if (isMoveBlockedTarget(e.target)) return;
    beginInteract(e, 'move');
  });

  window.addEventListener('pointermove', onDragMove, true);
  window.addEventListener('pointerup', onDragUp, true);
  window.addEventListener('pointercancel', onDragUp, true);
  window.addEventListener('blur', () => onDragUp());

  window.addEventListener('resize', () => {
    const rect = win.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(rect.width, vw);
    const height = Math.min(rect.height, vh);
    const left = Math.min(Math.max(0, rect.left), Math.max(0, vw - width));
    const top = Math.min(Math.max(0, rect.top), Math.max(0, vh - height));
    win.style.width = `${width}px`;
    win.style.height = `${height}px`;
    win.style.left = `${left}px`;
    win.style.top = `${top}px`;
    saveWindowSize();
    refreshVisibleText();
  });
}

function restoreCols() {
  const cols = document.querySelectorAll('#monitorCols col');
  try {
    const saved = JSON.parse(localStorage.getItem(COLS_KEY) || '[]');
    saved.forEach((width, i) => {
      if (cols[i] && width) cols[i].style.width = `${width}px`;
    });
  } catch (e) {
    /* ignore */
  }
}

function saveCols() {
  const widths = [...document.querySelectorAll('#monitorCols col')].map((c) =>
    Math.round(parseFloat(c.style.width) || c.getBoundingClientRect().width)
  );
  localStorage.setItem(COLS_KEY, JSON.stringify(widths));
}

function measureElementContentWidth(el) {
  if (!el) return 0;
  const clone = el.cloneNode(true);
  clone.style.cssText = [
    'position:absolute',
    'visibility:hidden',
    'display:inline-block',
    'max-width:none',
    'width:auto',
    'height:auto',
    'white-space:nowrap',
    'left:-10000px',
    'top:0',
    'pointer-events:none'
  ].join(';');
  document.body.appendChild(clone);
  const width = clone.getBoundingClientRect().width;
  document.body.removeChild(clone);
  return width;
}

function autoFitColumn(index) {
  const table = document.getElementById('monitorTable');
  const cols = document.querySelectorAll('#monitorCols col');
  const col = cols[index];
  if (!table || !col) return;

  const headerCell = table.querySelector(`thead th:nth-child(${index + 1})`);
  const label = headerCell?.querySelector('.col-label');
  const cellPad = 16; // padding cell + piccolo margine
  let maxWidth = 40;

  if (label) {
    // Solo il nome colonna, senza freccia sort
    const raw = Array.from(label.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join('') || label.textContent.replace(/[▲▼]/g, '').trim();
    const style = getComputedStyle(label);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    maxWidth = Math.max(maxWidth, measureTextWidth(raw, font) + cellPad);
  }

  table.querySelectorAll(`tbody tr td:nth-child(${index + 1})`).forEach((td) => {
    const fullEl = td.querySelector('[data-full]');
    if (fullEl) {
      const style = getComputedStyle(fullEl);
      const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const full = fullEl.getAttribute('data-full') || '';
      const pad =
        (parseFloat(style.paddingLeft) || 0) +
        (parseFloat(style.paddingRight) || 0) +
        cellPad;
      maxWidth = Math.max(maxWidth, measureTextWidth(full, font) + pad);
      return;
    }

    const content = td.querySelector('.bal-badge, .name-badge, .badge, button, a, span');
    if (content) {
      maxWidth = Math.max(maxWidth, measureElementContentWidth(content) + cellPad);
      return;
    }

    maxWidth = Math.max(maxWidth, measureElementContentWidth(td) + 4);
  });

  const fitted = Math.max(40, Math.ceil(maxWidth));
  col.style.width = `${fitted}px`;
  saveCols();
  requestAnimationFrame(refreshVisibleText);
}

function initColumnResize() {
  restoreCols();
  const cols = document.querySelectorAll('#monitorCols col');

  document.querySelectorAll('.col-resizer').forEach((resizer) => {
    resizer.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      autoFitColumn(Number(resizer.dataset.col));
    });

    resizer.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.detail > 1) return;
      e.preventDefault();
      e.stopPropagation();

      const index = Number(resizer.dataset.col);
      const col = cols[index];
      if (!col) return;

      const startX = e.clientX;
      const startW = col.getBoundingClientRect().width;
      let rafId = 0;
      let nextWidth = startW;
      const pointerId = e.pointerId;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      try {
        resizer.setPointerCapture(pointerId);
      } catch (_) {
        /* ignore */
      }

      const onMove = (ev) => {
        if (ev.pointerId !== pointerId) return;
        nextWidth = Math.max(48, startW + (ev.clientX - startX));
        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            col.style.width = `${nextWidth}px`;
            refreshVisibleText();
            rafId = 0;
          });
        }
      };

      const onUp = (ev) => {
        if (ev && ev.pointerId != null && ev.pointerId !== pointerId) return;
        if (rafId) cancelAnimationFrame(rafId);
        col.style.width = `${nextWidth}px`;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        resizer.removeEventListener('pointermove', onMove);
        resizer.removeEventListener('pointerup', onUp);
        resizer.removeEventListener('pointercancel', onUp);
        saveCols();
        refreshVisibleText();
      };

      resizer.addEventListener('pointermove', onMove);
      resizer.addEventListener('pointerup', onUp);
      resizer.addEventListener('pointercancel', onUp);
    });
  });
}

function openModal() {
  const modal = document.getElementById('addModal');
  if (modal) modal.hidden = false;
}

function closeModal() {
  const modal = document.getElementById('addModal');
  if (modal) modal.hidden = true;
  const results = document.getElementById('searchResults');
  if (results) results.innerHTML = '';
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
}

async function loadOwners() {
  const select = document.getElementById('newOwner');
  if (!select) return;
  const res = await fetch('/holdertrack/api/owners');
  const data = await res.json();
  const owners = data.owners || [];
  select.innerHTML = '<option value="">Seleziona proprietario...</option>' +
    owners.map((o) => `<option value="${o.id}">${escapeHtml(o.nome)}</option>`).join('');
}

async function enableById(id) {
  const res = await fetch('/holdertrack/api/monitor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Errore');
  await reloadTable();
  toast('Indirizzo aggiunto al monitoraggio');
  closeModal();
}

async function renderSearch(q) {
  const box = document.getElementById('searchResults');
  if (!box) return;
  if (q.trim().length < 2) {
    box.innerHTML = '';
    return;
  }
  const res = await fetch(`/holdertrack/api/search?q=${encodeURIComponent(q.trim())}`);
  const data = await res.json();
  const results = data.results || [];
  if (!results.length) {
    box.innerHTML = '<div class="search-item"><div class="meta"><strong>Nessun risultato</strong></div></div>';
    return;
  }

  box.innerHTML = results.map((r) => {
    const already = Number(r.monitoring) === 1;
    return `<div class="search-item ${already ? 'already' : ''}">
      <div class="meta">
        <strong>${escapeHtml(r.nome)} · ${escapeHtml(r.blockchain || '')}</strong>
        <span>${escapeHtml(r.indirizzo)}</span>
      </div>
      ${already
        ? '<span class="badge bg-secondary">Già monitorato</span>'
        : `<button type="button" class="btn-tool btn-add btn-enable" data-id="${r.id}">Monitora</button>`}
    </div>`;
  }).join('');
}

async function askDeleteConfirm(address, id) {
  const label = address || `ID ${id}`;

  if (window.Swal) {
    const result = await Swal.fire({
      title: 'Confermi l\'eliminazione?',
      html: `L'indirizzo verrà rimosso dal monitoraggio:<br><code style="color:#58a6ff;word-break:break-all;">${escapeHtml(label)}</code>`,
      icon: 'warning',
      showCancelButton: true,
      focusCancel: true,
      confirmButtonText: 'Sì, rimuovi',
      cancelButtonText: 'Annulla',
      confirmButtonColor: '#d14529',
      cancelButtonColor: '#6e7681',
      reverseButtons: true,
      heightAuto: false,
      customClass: {
        container: 'monitor-swal'
      }
    });
    return Boolean(result.isConfirmed);
  }

  return window.confirm(`Confermi l'eliminazione dal monitoraggio?\n\n${label}`);
}

async function removeMonitored(id, address) {
  const ok = await askDeleteConfirm(address, id);
  if (!ok) return;

  const res = await fetch(`/holdertrack/api/monitor/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) {
    toast(data.error || 'Errore rimozione', 'error');
    return;
  }
  await reloadTable();
  toast('Indirizzo rimosso dal monitoraggio');
}

function initActions() {
  document.getElementById('btnAdd')?.addEventListener('click', async () => {
    openModal();
    await loadOwners();
  });
  document.getElementById('btnCloseModal')?.addEventListener('click', closeModal);
  document.getElementById('btnCancelModal')?.addEventListener('click', closeModal);

  document.getElementById('addModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'addModal') closeModal();
  });

  let searchTimer = null;
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      renderSearch(e.target.value).catch((err) => console.error(err));
    }, 250);
  });

  document.getElementById('searchResults')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-enable');
    if (!btn) return;
    try {
      await enableById(Number(btn.dataset.id));
    } catch (err) {
      toast(err.message || 'Errore', 'error');
    }
  });

  document.getElementById('btnCreateMonitor')?.addEventListener('click', async () => {
    const indirizzo = document.getElementById('newAddress')?.value.trim();
    const blockchain = document.getElementById('newChain')?.value;
    const proid = document.getElementById('newOwner')?.value;
    const note = document.getElementById('newNote')?.value.trim();
    if (!indirizzo || !proid) {
      toast('Indirizzo e proprietario obbligatori', 'error');
      return;
    }
    try {
      const res = await fetch('/holdertrack/api/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indirizzo, blockchain, proid: Number(proid), note })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore');
      await reloadTable();
      toast(data.created ? 'Nuovo indirizzo creato e monitorato' : 'Indirizzo già presente: monitoraggio attivato');
      closeModal();
    } catch (err) {
      toast(err.message || 'Errore', 'error');
    }
  });

  document.getElementById('monitorBody')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-del');
    if (!btn) return;
    await removeMonitored(Number(btn.dataset.id), btn.dataset.address);
  });
}

function seedRowsFromDom() {
  const rows = [];
  document.querySelectorAll('#monitorBody tr[data-id]').forEach((tr) => {
    const addrEl = tr.querySelector('.addr-text');
    const nameEl = tr.querySelector('.name-badge');
    const giorniRaw = (tr.querySelector('.col-days .badge')?.textContent || '').trim();
    const giorni = giorniRaw === '-' || giorniRaw === '' ? null : Number(giorniRaw);
    rows.push({
      id: Number(tr.getAttribute('data-id')),
      indirizzo: addrEl?.getAttribute('data-address') || addrEl?.getAttribute('data-full') || '',
      nome: nameEl?.getAttribute('data-full') || nameEl?.textContent || '',
      blockchain: (tr.querySelector('.col-chain a, .col-chain .badge')?.textContent || '').trim(),
      balance: parseFloat(String(tr.querySelector('.bal-badge')?.textContent || '').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0,
      giorni: Number.isFinite(giorni) ? giorni : null,
    });
  });
  if (rows.length) cachedRows = rows;
}

document.addEventListener('DOMContentLoaded', () => {
  initWindowResize();
  initColumnResize();
  initColumnSort();
  initActions();
  seedRowsFromDom();
  setTimeout(() => {
    reloadTable().catch((err) => console.error(err));
  }, 1500);
  setInterval(() => {
    reloadTable().catch((err) => console.error(err));
  }, 60000);
});
