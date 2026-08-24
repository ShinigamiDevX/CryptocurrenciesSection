(function () {
    const CHART_PALETTE = ['#0070C0', '#FFC000', '#FF0000'];
    const CHART_TYPES = new Set(['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea']);

    function normalizeHexColor(value, fallback) {
        const raw = String(value || '').trim();
        if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
        if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
            return ('#' + raw[1] + raw[1] + raw[2] + raw[2] + raw[3] + raw[3]).toLowerCase();
        }
        return fallback;
    }

    function defaultSeriesColor(i) {
        return CHART_PALETTE[i % CHART_PALETTE.length];
    }

    function isCircularChartType(type) {
        return type === 'pie' || type === 'doughnut' || type === 'polarArea';
    }

    function withAlpha(hex, alpha) {
        return normalizeHexColor(hex, '#0070C0') + alpha;
    }

    function normalizeChartConfig(cfg) {
        const src = cfg && typeof cfg === 'object' ? cfg : {};
        const type = CHART_TYPES.has(src.type) ? src.type : 'bar';
        const labels = Array.isArray(src.labels) && src.labels.length
            ? src.labels.map(String)
            : ['Gennaio', 'Febbraio', 'Marzo'];
        const datasets = (Array.isArray(src.datasets) && src.datasets.length ? src.datasets : [{ label: 'Serie 1', data: [10, 25, 18] }])
            .map((d, i) => {
                const fallback = defaultSeriesColor(i);
                let color = fallback;
                if (d && d.color) color = normalizeHexColor(d.color, fallback);
                return {
                    label: (d && d.label) ? String(d.label) : `Serie ${i + 1}`,
                    data: Array.isArray(d && d.data) ? d.data.map((n) => Number(n) || 0) : [],
                    color,
                };
            });
        datasets.forEach((d) => {
            while (d.data.length < labels.length) d.data.push(0);
            if (d.data.length > labels.length) d.data = d.data.slice(0, labels.length);
        });
        let categoryColors = Array.isArray(src.categoryColors)
            ? src.categoryColors.map((c, j) => normalizeHexColor(c, defaultSeriesColor(j)))
            : labels.map((_, j) => defaultSeriesColor(j));
        return {
            type,
            title: src.title != null ? String(src.title) : '',
            labels,
            datasets,
            categoryColors,
            legend: src.legend !== false,
        };
    }

    function styleChartDatasets(type, cfg) {
        const circular = isCircularChartType(type);
        const categoryColors = Array.isArray(cfg.categoryColors) ? cfg.categoryColors : [];
        return (Array.isArray(cfg.datasets) ? cfg.datasets : []).map((d, i) => {
            const color = normalizeHexColor(d.color, defaultSeriesColor(i));
            const styled = {
                label: d.label || `Serie ${i + 1}`,
                data: Array.isArray(d.data) ? d.data : [],
                borderWidth: type === 'line' || type === 'radar' ? 2 : 1,
                tension: 0.25,
            };
            if (circular) {
                styled.backgroundColor = styled.data.map((_, j) => normalizeHexColor(categoryColors[j], defaultSeriesColor(j)));
                styled.borderColor = '#ffffff';
            } else {
                styled.backgroundColor = type === 'line' || type === 'radar' ? withAlpha(color, '33') : color;
                styled.borderColor = color;
                if (type === 'radar') styled.fill = true;
            }
            return styled;
        });
    }

    function renderCharts(root) {
        if (!root || typeof Chart === 'undefined') return;
        root.querySelectorAll('.chart-block[data-chart]').forEach((block) => {
            const canvas = block.querySelector('canvas');
            if (!canvas) return;
            let cfg;
            try { cfg = JSON.parse(block.getAttribute('data-chart') || '{}'); } catch (_) { return; }
            const normalized = normalizeChartConfig(cfg);
            new Chart(canvas, {
                type: normalized.type,
                data: {
                    labels: normalized.labels,
                    datasets: styleChartDatasets(normalized.type, normalized),
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        title: { display: !!normalized.title, text: normalized.title || '' },
                        legend: { display: normalized.legend !== false },
                    },
                },
            });
        });
    }

    function highlightCode(root) {
        if (!root || typeof hljs === 'undefined') return;
        root.querySelectorAll('pre code').forEach((code) => {
            if (code.classList.contains('language-chart')) return;
            const text = code.textContent || '';
            if (!text.length) return;
            try {
                const langClass = [...code.classList].find((c) => c.startsWith('language-'));
                if (langClass && hljs.getLanguage(langClass.slice('language-'.length))) {
                    hljs.highlightElement(code);
                } else {
                    const result = hljs.highlightAuto(text);
                    code.innerHTML = result.value;
                    code.className = 'hljs' + (result.language ? ' language-' + result.language : '');
                }
            } catch (_) { code.classList.add('hljs'); }
        });
    }

    function renderNav(navEl, nodes, pages, onSelect, depth) {
        const ul = document.createElement('ul');
        if (depth > 0) ul.className = 'nav-sub';
        (nodes || []).forEach((node) => {
            if (!node || node.type === 'divider') return;
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.className = 'nav-link';
            a.href = '#';
            a.textContent = node.title || node.id;
            a.dataset.id = node.id;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                onSelect(node.id, a);
            });
            li.appendChild(a);
            if (node.children && node.children.length) {
                li.appendChild(renderNav(navEl, node.children, pages, onSelect, depth + 1));
            }
            ul.appendChild(li);
        });
        return ul;
    }

    function boot() {
        const dataEl = document.getElementById('corsi-data');
        const contentRoot = document.getElementById('contentRoot');
        const navHost = document.getElementById('sidebarNav');
        if (!dataEl || !contentRoot || !navHost) return;

        let data;
        try { data = JSON.parse(dataEl.textContent || '{}'); } catch (_) { return; }

        const pages = data.pages || {};
        const nav = data.nav || [];
        let activeLink = null;

        function show(id, link) {
            if (activeLink) activeLink.classList.remove('active');
            activeLink = link || navHost.querySelector(`.nav-link[data-id="${CSS.escape(id)}"]`);
            if (activeLink) activeLink.classList.add('active');
            contentRoot.innerHTML = pages[id] || '<p class="empty-state">Contenuto non disponibile.</p>';
            renderCharts(contentRoot);
            highlightCode(contentRoot);
            if (location.hash.replace(/^#/, '') !== id) {
                try { history.replaceState(null, '', '#' + encodeURIComponent(id)); } catch (_) { /* ignore */ }
            }
        }

        navHost.appendChild(renderNav(navHost, nav, pages, show, 0));

        const firstId = (function pick(nodes) {
            for (const n of nodes || []) {
                if (n && n.type !== 'divider' && pages[n.id]) return n.id;
                const kid = pick(n.children);
                if (kid) return kid;
            }
            return null;
        })(nav);

        const hashId = decodeURIComponent((location.hash || '').replace(/^#/, ''));
        const startId = (hashId && pages[hashId]) ? hashId : firstId;
        if (startId) show(startId);
        else contentRoot.innerHTML = '<p class="empty-state">Nessun contenuto da mostrare.</p>';
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
