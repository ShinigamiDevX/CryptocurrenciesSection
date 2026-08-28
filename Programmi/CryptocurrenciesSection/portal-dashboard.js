(function () {
    function fmtPrice(n) {
        if (n == null || !isFinite(n)) return '-';
        const abs = Math.abs(n);
        if (abs >= 1000) return n.toFixed(2);
        if (abs >= 1) return n.toFixed(4);
        return n.toFixed(8);
    }

    function fmtPct(p) {
        if (p == null || !isFinite(p)) return '-';
        const sign = p >= 0 ? '+' : '';
        return sign + p.toFixed(2) + '%';
    }

    function getCtxCanvas(id) {
        const canvas = document.getElementById(id);
        if (!canvas) return null;
        return canvas;
    }

    function setupCanvasSizing(canvas) {
        const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(320, Math.round(rect.width));
        const h = Math.max(160, Math.round(rect.height));
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx, w, h };
    }

    function drawGrid(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        // Subtle glow background
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(0, 200, 255, 0.16)');
        g.addColorStop(1, 'rgba(0, 200, 255, 0.02)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.10)';
        ctx.lineWidth = 1;
        const rows = 4;
        for (let i = 1; i <= rows; i++) {
            const y = (h / (rows + 1)) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawSeries(ctx, w, h, series, color) {
        if (!Array.isArray(series) || series.length < 2) return;
        const values = series.map(p => p.y);
        let min = Math.min.apply(null, values);
        let max = Math.max.apply(null, values);
        if (min === max) {
            min = min * 0.999;
            max = max * 1.001;
        }
        const pad = (max - min) * 0.08;
        min -= pad;
        max += pad;

        const xStep = w / (series.length - 1);

        function xAt(i) {
            return i * xStep;
        }
        function yAt(y) {
            return h - ((y - min) / (max - min)) * h;
        }

        // Fill under line
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xAt(0), yAt(series[0].y));
        for (let i = 1; i < series.length; i++) ctx.lineTo(xAt(i), yAt(series[i].y));
        ctx.lineTo(xAt(series.length - 1), h);
        ctx.lineTo(xAt(0), h);
        ctx.closePath();
        const fill = ctx.createLinearGradient(0, 0, 0, h);
        fill.addColorStop(0, 'rgba(0, 200, 255, 0.22)');
        fill.addColorStop(1, 'rgba(0, 200, 255, 0.02)');
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.restore();

        // Line
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(xAt(0), yAt(series[0].y));
        for (let i = 1; i < series.length; i++) ctx.lineTo(xAt(i), yAt(series[i].y));
        ctx.stroke();

        // Glow dot at end
        const last = series[series.length - 1];
        const lx = xAt(series.length - 1);
        const ly = yAt(last.y);
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(lx, ly, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    async function fetchJson(url) {
        const res = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
    }

    async function fetchPrices() {
        // Binance public API (returns CORS headers in many setups; if blocked, we fallback to simulation)
        const [btc, eth] = await Promise.all([
            fetchJson('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'),
            fetchJson('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT')
        ]);
        return {
            btc: parseFloat(btc.price),
            eth: parseFloat(eth.price)
        };
    }

    function startSimulatedPrices(seedBtc, seedEth) {
        let btc = seedBtc;
        let eth = seedEth;
        const driftBtc = 0.00001; // tiny drift
        const driftEth = 0.00002;

        return function step() {
            btc = btc * (1 + driftBtc + (Math.random() - 0.5) * 0.002);
            eth = eth * (1 + driftEth + (Math.random() - 0.5) * 0.003);
            return { btc, eth };
        };
    }

    function initPortalDashboard() {
        // Sidebar collapse/expand
        const sidebar = document.getElementById('portalSidebar');
        const toggleBtn = document.getElementById('portalSidebarToggleBtn');
        if (sidebar && toggleBtn) {
            const saved = localStorage.getItem('portalSidebarCollapsed');
            const collapsed = saved === '1';
            sidebar.classList.toggle('portal-sidebar--collapsed', collapsed);
            toggleBtn.addEventListener('click', function () {
                const next = !sidebar.classList.contains('portal-sidebar--collapsed');
                sidebar.classList.toggle('portal-sidebar--collapsed', next);
                localStorage.setItem('portalSidebarCollapsed', next ? '1' : '0');
            });
        }

        const canvas = getCtxCanvas('btcChartCanvas');
        const chartWrap = document.getElementById('btcChartWrap');
        const btcMeta = document.getElementById('btcRealtimeMeta');
        const tickerEl = document.getElementById('cryptoTicker');
        const pulseEl = document.getElementById('cryptoPulseFill');
        const pulseLabel = document.getElementById('cryptoPulseLabel');
        const statusEl = document.getElementById('portalRealtimeStatus');

        if (!canvas) return;

        const MAX_POINTS = 90;
        const UPDATE_MS = 2500;

        let series = [];
        let ethSeries = [];
        let prevBtc = null;
        let baseBtc = null;
        let simStep = null;
        let lastGoodTs = 0;

        let setup = setupCanvasSizing(canvas);
        let ctx = setup.ctx;
        let w = setup.w;
        let h = setup.h;

        function render() {
            const s = series;
            drawGrid(ctx, w, h);
            drawSeries(ctx, w, h, s, 'rgba(0, 200, 255, 0.95)');
        }

        function renderTicker(btc, eth, prev) {
            if (!tickerEl) return;
            const deltaPct = prev ? ((btc - prev) / prev) * 100 : 0;
            if (prevBtc == null) prevBtc = btc;

            const overall = baseBtc ? ((btc - baseBtc) / baseBtc) * 100 : 0;
            const cls = deltaPct >= 0 ? 'portal-change--pos' : 'portal-change--neg';

            tickerEl.innerHTML = [
                '<div class="portal-ticker-row">',
                '  <div class="portal-ticker-left">',
                '    <div class="portal-ticker-asset"><span class="portal-ticker-sym">BTC</span> / BTCUSD</div>',
                '  </div>',
                '  <div class="portal-ticker-price">' + fmtPrice(btc) + '</div>',
                '  <div class="portal-change ' + cls + '">' + fmtPct(deltaPct) + '</div>',
                '</div>',
                '<div class="portal-ticker-row">',
                '  <div class="portal-ticker-left">',
                '    <div class="portal-ticker-asset"><span class="portal-ticker-sym">ETH</span> / ETHUSD</div>',
                '  </div>',
                '  <div class="portal-ticker-price">' + fmtPrice(eth) + '</div>',
                '  <div class="portal-change portal-change--pos" style="opacity:0.9;">Base: ' + fmtPct(overall) + '</div>',
                '</div>'
            ].join('');
        }

        function renderPulse(btc) {
            if (!pulseEl || !pulseLabel) return;
            if (!baseBtc) return;
            const pct = ((btc - baseBtc) / baseBtc);
            const pos = pct >= 0;
            const width = Math.max(6, Math.min(100, Math.round(50 + pct * 25000)));
            pulseEl.style.width = width + '%';
            pulseLabel.textContent = 'Momentum: ' + (pos ? 'UP' : 'DOWN') + ' (' + fmtPct(pct * 100) + ')';
            pulseEl.style.background = pos
                ? 'linear-gradient(90deg, rgba(0, 200, 255, 0.95), rgba(0, 230, 118, 0.95))'
                : 'linear-gradient(90deg, rgba(255, 71, 87, 0.95), rgba(0, 200, 255, 0.95))';
        }

        async function tick() {
            const t = Date.now();

            let prices = null;
            try {
                prices = simStep ? simStep() : await fetchPrices();
                lastGoodTs = t;
                if (!simStep && statusEl) statusEl.textContent = 'Realtime aggiornamento: attivo';
            } catch (e) {
                if (!simStep) {
                    // CORS / rete bloccata: fallback simulato per non lasciare la dashboard vuota
                    const seedBtc = series.length ? series[series.length - 1].y : (prevBtc || 65000);
                    const seedEth = ethSeries.length ? ethSeries[ethSeries.length - 1].y : 3500;
                    simStep = startSimulatedPrices(seedBtc, seedEth);
                    if (statusEl) statusEl.textContent = 'Realtime esterno bloccato: simulazione attiva';
                }
                prices = simStep();
            }

            const btc = prices.btc;
            const eth = prices.eth;

            if (baseBtc == null) baseBtc = btc;

            const now = new Date(t);
            series.push({ t: now, y: btc });
            ethSeries.push({ t: now, y: eth });

            if (series.length > MAX_POINTS) series = series.slice(series.length - MAX_POINTS);
            if (ethSeries.length > MAX_POINTS) ethSeries = ethSeries.slice(ethSeries.length - MAX_POINTS);

            // Update meta UI
            const prevPrice = prevBtc == null ? btc : prevBtc;
            if (btcMeta) {
                const delta = ((btc - prevPrice) / prevPrice) * 100;
                btcMeta.textContent = 'Ultimo: ' + fmtPrice(btc) + ' | Δ ' + fmtPct(delta);
            }

            render();
            renderTicker(btc, eth, prevPrice);
            renderPulse(btc);
            prevBtc = btc;
        }

        // Initial draw
        render();
        tick();
        setInterval(tick, UPDATE_MS);

        // Keep canvas sizing correct after resize (redraw only)
        let resizeRaf = null;
        window.addEventListener('resize', function () {
            if (resizeRaf) cancelAnimationFrame(resizeRaf);
            resizeRaf = requestAnimationFrame(function () {
                const s = setupCanvasSizing(canvas);
                if (!s || !s.ctx) return;
                ctx = s.ctx;
                w = s.w;
                h = s.h;
                render();
            });
        });

        // Placeholder click support
        document.querySelectorAll('.portal-side-link[href="#"][data-placeholder]').forEach(function (a) {
            a.addEventListener('click', function (e) {
                e.preventDefault();
                const msg = a.getAttribute('data-placeholder') || 'Funzionalita non disponibile.';
                if (statusEl) statusEl.textContent = msg;
                if (chartWrap) chartWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        });
    }

    window.initPortalDashboard = initPortalDashboard;
})();

