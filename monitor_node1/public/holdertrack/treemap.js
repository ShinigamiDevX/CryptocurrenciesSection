/**
 * Squarified treemap (Bruls et al.) — keeps tiles closer to square.
 */
function worstAspect(row, w) {
  if (!row.length) return Infinity;
  let s = 0;
  let max = 0;
  let min = Infinity;
  for (const item of row) {
    s += item.area;
    max = Math.max(max, item.area);
    min = Math.min(min, item.area);
  }
  const s2 = s * s;
  const w2 = w * w;
  return Math.max((w2 * max) / s2, s2 / (w2 * min));
}

function layoutRow(row, x, y, w, h, horizontal) {
  const total = row.reduce((sum, item) => sum + item.area, 0);
  if (horizontal) {
    const rowHeight = total / w;
    let cx = x;
    for (const item of row) {
      const cw = item.area / rowHeight;
      item.x = cx;
      item.y = y;
      item.w = cw;
      item.h = rowHeight;
      cx += cw;
    }
    return { x, y: y + rowHeight, w, h: h - rowHeight };
  }

  const rowWidth = total / h;
  let cy = y;
  for (const item of row) {
    const ch = item.area / rowWidth;
    item.x = x;
    item.y = cy;
    item.w = rowWidth;
    item.h = ch;
    cy += ch;
  }
  return { x: x + rowWidth, y, w: w - rowWidth, h };
}

function squarify(items, bounds) {
  const nodes = items
    .filter((item) => item.value > 0)
    .map((item) => ({ ...item }))
    .sort((a, b) => b.value - a.value);

  const totalValue = nodes.reduce((sum, n) => sum + n.value, 0);
  if (!totalValue || bounds.w <= 0 || bounds.h <= 0) return [];

  const scale = (bounds.w * bounds.h) / totalValue;
  nodes.forEach((n) => {
    n.area = n.value * scale;
  });

  const result = [];
  let remaining = nodes.slice();
  let box = { ...bounds };

  while (remaining.length) {
    const horizontal = box.w >= box.h;
    const side = horizontal ? box.w : box.h;
    const row = [remaining.shift()];

    while (remaining.length) {
      const next = remaining[0];
      const withNext = row.concat(next);
      if (worstAspect(withNext, side) <= worstAspect(row, side)) {
        row.push(remaining.shift());
      } else {
        break;
      }
    }

    box = layoutRow(row, box.x, box.y, box.w, box.h, horizontal);
    result.push(...row);
  }

  return result;
}

function changeColor(change) {
  const c = Number(change) || 0;
  const intensity = Math.min(1, Math.abs(c) / 12);
  if (c > 0.05) {
    const g = Math.round(90 + 90 * intensity);
    return `rgb(20, ${g}, 55)`;
  }
  if (c < -0.05) {
    const r = Math.round(120 + 90 * intensity);
    return `rgb(${r}, 45, 45)`;
  }
  return 'rgb(70, 75, 85)';
}

function formatPrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n)) return '-';
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}

function formatChange(change) {
  const n = Number(change);
  if (!Number.isFinite(n)) return '';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

class CryptoTreemap {
  constructor(container) {
    this.container = container;
    this.data = [];
    this.tiles = [];
    this._ro = null;
  }

  setData(coins) {
    this.data = (coins || []).map((c) => ({
      id: c.id,
      symbol: String(c.symbol || '').toUpperCase(),
      name: c.name || c.symbol,
      value: Number(c.market_cap) || 0,
      price: c.current_price,
      change: c.price_change_percentage_24h
    }));
    this.render();
  }

  render() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const gap = 2;

    this.tiles = squarify(this.data, {
      x: gap / 2,
      y: gap / 2,
      w: width - gap,
      h: height - gap
    });

    const html = this.tiles.map((tile) => {
      const w = Math.max(0, tile.w - gap);
      const h = Math.max(0, tile.h - gap);
      const area = w * h;
      const showPrice = area > 4200 && w > 70 && h > 48;
      const showChange = area > 7000 && w > 90 && h > 64;
      const fontSize = Math.max(10, Math.min(28, Math.sqrt(area) / 7.5));
      const bg = changeColor(tile.change);
      const changeCls = Number(tile.change) >= 0 ? 'up' : 'down';

      return `<div class="tm-tile" style="left:${tile.x}px;top:${tile.y}px;width:${w}px;height:${h}px;background:${bg};font-size:${fontSize}px" title="${escapeAttr(tile.name)} · ${formatPrice(tile.price)} · ${formatChange(tile.change)}">
        <div class="tm-label">
          <strong>${escapeHtml(tile.symbol)}</strong>
          ${showPrice ? `<span class="tm-price">${formatPrice(tile.price)}</span>` : ''}
          ${showChange ? `<span class="tm-change ${changeCls}">${formatChange(tile.change)}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    this.container.innerHTML = html || '<div class="tm-empty">Caricamento mercato...</div>';
  }

  start() {
    this.render();
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.render());
      this._ro.observe(this.container);
    } else {
      window.addEventListener('resize', () => this.render());
    }
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

window.CryptoTreemap = CryptoTreemap;
