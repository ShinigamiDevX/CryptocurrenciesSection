(function () {
    const API = '/api/auth/corsi/export-bundle';
    const OFFLINE_ASSETS = {
        css: '/corsi-offline/assets/viewer.css',
        viewer: '/corsi-offline/assets/viewer.js',
        chart: '/corsi-offline/assets/chart.umd.min.js',
        highlight: '/corsi-offline/assets/highlight.min.js',
        logo: '/immagini/logo.png',
    };

    function authHeaders(extra) {
        if (typeof authHeader === 'function') return authHeader(extra);
        const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        return Object.assign({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, extra || {});
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function looksLikeHtml(raw) {
        return /<(p|div|table|h[1-6]|ul|ol|li|img|span|blockquote|pre|figure|thead|tbody|tr|td|th)\b/i.test(raw || '');
    }

    function unwrapWholeDocumentFence(md) {
        const s = String(md || '').trim();
        const m = s.match(/^```([a-zA-Z0-9_-]*)[ \t]*\n([\s\S]*?)\n```$/);
        if (!m) return md;
        const lang = (m[1] || '').toLowerCase();
        if (lang && lang !== 'text' && lang !== 'plain') return md;
        return m[2];
    }

    function extractTitleStyle(raw) {
        const s = String(raw || '');
        const m = s.match(/^<!--corsi-title-style:([^>]*?)-->\s*/);
        if (!m) return { style: '', body: s };
        let style = '';
        try { style = decodeURIComponent(m[1]); } catch (_) { style = ''; }
        return { style, body: s.slice(m[0].length) };
    }

    function renderMarkdown(md) {
        if (typeof marked !== 'undefined' && marked.parse) return marked.parse(md, { breaks: false });
        return '<pre>' + escapeHtml(md) + '</pre>';
    }

    function contentToPresentationBody(raw) {
        const body = unwrapWholeDocumentFence(raw || '');
        const wrap = document.createElement('div');
        wrap.innerHTML = looksLikeHtml(body) ? body : (renderMarkdown(body) || '');
        wrap.querySelectorAll('.code-block-theme-bar').forEach((el) => el.remove());
        wrap.querySelectorAll('.chart-edit-block').forEach((el) => {
            const block = document.createElement('div');
            block.className = 'chart-block';
            block.setAttribute('data-chart', el.getAttribute('data-chart') || '{}');
            block.innerHTML = '<canvas></canvas>';
            el.replaceWith(block);
        });
        wrap.querySelectorAll('pre > code.language-chart').forEach((code) => {
            const block = document.createElement('div');
            block.className = 'chart-block';
            block.setAttribute('data-chart', code.textContent.trim());
            block.innerHTML = '<canvas></canvas>';
            code.parentElement.replaceWith(block);
        });
        wrap.querySelectorAll('pre').forEach((pre) => {
            pre.classList.add('code-theme-light');
            if (!pre.querySelector('code')) {
                const code = document.createElement('code');
                code.textContent = pre.textContent;
                pre.textContent = '';
                pre.appendChild(code);
            }
        });
        return wrap.innerHTML;
    }

    function cleanNav(nodes) {
        return (nodes || [])
            .filter((n) => n && n.type !== 'divider')
            .map((n) => ({
                id: n.id,
                title: n.title,
                type: n.type,
                children: cleanNav(n.children),
            }));
    }

    function buildSectionPage(node, itemsById, depth) {
        const row = itemsById.get(node.id);
        if (!row) return '';
        const split = extractTitleStyle(row.content || '');
        const title = row.title || node.title || node.id;
        const tag = depth <= 0 ? 'h1' : (depth === 1 ? 'h2' : 'h3');
        const titleClass = depth <= 0 ? 'post-title' : 'post-title nest-title';
        const titleStyleAttr = split.style ? ` style="${escapeHtml(split.style)}"` : '';
        let html = `<section class="corsi-section depth-${depth}" id="sec-${escapeHtml(node.id)}">`;
        html += `<${tag} class="${titleClass}"${titleStyleAttr}>${escapeHtml(title)}</${tag}>`;
        html += `<div class="corsi-section-body">${contentToPresentationBody(split.body)}</div>`;
        html += '</section>';
        return html;
    }

    function buildPresentationPages(manifest, items) {
        const itemsById = new Map((items || []).map((row) => [row.id, row]));
        const pages = {};
        function walk(node, depth) {
            if (!node || node.type === 'divider') return;
            pages[node.id] = buildSectionPage(node, itemsById, depth);
            cleanNav(node.children).forEach((kid) => walk(kid, depth + 1));
        }
        cleanNav(manifest.nav || []).forEach((node) => walk(node, 0));
        return pages;
    }

    function buildPresentationIndex(manifest, pages) {
        const payload = JSON.stringify({
            title: manifest.title || 'Corsi',
            description: manifest.description || '',
            nav: cleanNav(manifest.nav || []),
            pages,
        }).replace(/</g, '\\u003c');
        return `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sezione Criptovalute — presentazione</title>
    <link rel="stylesheet" href="assets/viewer.css">
</head>
<body>
    <div class="layout">
        <aside class="sidebar">
            <div class="sidebar-brand">
                <img class="sidebar-brand-logo" src="assets/logo.png" alt="Logo Carabinieri">
                <div class="sidebar-brand-text">
                    <h1>Comando Carabinieri<br>Antifalsificazione Monetaria</h1>
                    <p>Sezione Criptovalute</p>
                </div>
            </div>
            <nav class="nav-tree" id="sidebarNav" aria-label="Navigazione corsi"></nav>
        </aside>
        <main class="content" id="contentRoot"></main>
    </div>
    <script type="application/json" id="corsi-data">${payload}</script>
    <script src="assets/chart.umd.min.js"></script>
    <script src="assets/highlight.min.js"></script>
    <script src="assets/viewer.js"></script>
</body>
</html>
`;
    }

    function serializeTableHtml(table) {
        const clone = table.cloneNode(true);
        clone.querySelectorAll('[data-resize-ghost], .table-resize-guide').forEach((n) => n.remove());
        return clone.outerHTML;
    }

    let _turndown = null;
    function getTurndown() {
        if (_turndown) return _turndown;
        if (typeof TurndownService === 'undefined') return null;
        _turndown = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            bulletListMarker: '-',
        });
        _turndown.addRule('underline', {
            filter: ['u'],
            replacement: (content) => `<u>${content}</u>`,
        });
        _turndown.addRule('coloredSpan', {
            filter: (node) => node.nodeName === 'SPAN' && node.getAttribute('style') && /color\s*:/i.test(node.getAttribute('style')),
            replacement: (content, node) => {
                const m = String(node.getAttribute('style') || '').match(/color\s*:\s*([^;]+)/i);
                const color = m ? m[1].trim() : '';
                return color ? `<span style="color:${color}">${content}</span>` : content;
            },
        });
        _turndown.addRule('fontFamilySpan', {
            filter: (node) => node.nodeName === 'SPAN' && node.getAttribute('style') && /font-family\s*:/i.test(node.getAttribute('style')),
            replacement: (content, node) => {
                const style = String(node.getAttribute('style') || '');
                const fm = style.match(/font-family\s*:\s*([^;]+)/i);
                const cm = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
                const parts = [];
                if (fm) parts.push('font-family:' + fm[1].trim());
                if (cm) parts.push('color:' + cm[1].trim());
                return parts.length ? `<span style="${parts.join(';')}">${content}</span>` : content;
            },
        });
        _turndown.addRule('fontFace', {
            filter: (node) => node.nodeName === 'FONT' && (node.getAttribute('face') || node.getAttribute('color')),
            replacement: (content, node) => {
                const parts = [];
                if (node.getAttribute('face')) parts.push('font-family:' + node.getAttribute('face'));
                if (node.getAttribute('color')) parts.push('color:' + node.getAttribute('color'));
                return parts.length ? `<span style="${parts.join(';')}">${content}</span>` : content;
            },
        });
        _turndown.addRule('fontColor', {
            filter: (node) => node.nodeName === 'FONT' && node.getAttribute('color') && !node.getAttribute('face'),
            replacement: (content, node) => `<span style="color:${node.getAttribute('color')}">${content}</span>`,
        });
        _turndown.addRule('chartBlock', {
            filter: (node) => node.nodeName === 'DIV' && node.classList && node.classList.contains('chart-edit-block'),
            replacement: (_content, node) => {
                let raw = node.getAttribute('data-chart') || '{}';
                try { raw = JSON.stringify(JSON.parse(raw), null, 2); } catch (_) { /* keep */ }
                return `\n\n\`\`\`chart\n${raw}\n\`\`\`\n\n`;
            },
        });
        _turndown.addRule('chartPre', {
            filter: (node) => node.nodeName === 'PRE'
                && node.firstElementChild
                && node.firstElementChild.classList
                && node.firstElementChild.classList.contains('language-chart'),
            replacement: (_content, node) => `\n\n\`\`\`chart\n${node.textContent.trim()}\n\`\`\`\n\n`,
        });
        _turndown.addRule('htmlTable', {
            filter: ['table'],
            replacement: (_content, node) => '\n\n' + serializeTableHtml(node) + '\n\n',
        });
        return _turndown;
    }

    function yamlValue(value) {
        const text = String(value || '');
        if (!text) return '""';
        if (/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(text)) return text;
        return JSON.stringify(text);
    }

    function htmlToMarkdown(html) {
        const raw = String(html || '').trim();
        if (!raw) return '';
        if (!looksLikeHtml(raw)) return raw;
        const td = getTurndown();
        if (!td) return raw;
        return td.turndown(raw).trim();
    }

    function buildMdFile(row) {
        const lines = ['---', `title: ${yamlValue(row.title || row.id)}`];
        if (row.courseDate) lines.push(`date: ${row.courseDate}`);
        lines.push('---', '');
        lines.push(htmlToMarkdown(row.content));
        return lines.join('\n') + '\n';
    }

    function manifestWithFiles(manifest) {
        const walk = (nodes) => (nodes || []).map((node) => {
            if (!node || node.type === 'divider') return node;
            const out = {
                id: node.id,
                title: node.title,
                type: node.type,
                file: `${node.id}.md`,
            };
            if (node.date) out.date = node.date;
            if (node.children && node.children.length) out.children = walk(node.children);
            return out;
        });
        return {
            title: manifest.title || 'Corsi',
            description: manifest.description || '',
            nav: walk(manifest.nav || []),
        };
    }

    async function fetchText(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('File di presentazione mancante: ' + url);
        return res.text();
    }

    async function fetchBinary(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('File di presentazione mancante: ' + url);
        return res.arrayBuffer();
    }

    async function loadOfflineAssets() {
        const [css, viewer, chart, highlight, logo] = await Promise.all([
            fetchText(OFFLINE_ASSETS.css),
            fetchText(OFFLINE_ASSETS.viewer),
            fetchText(OFFLINE_ASSETS.chart),
            fetchText(OFFLINE_ASSETS.highlight),
            fetchBinary(OFFLINE_ASSETS.logo),
        ]);
        return { css, viewer, chart, highlight, logo };
    }

    function buildCourseShortcutBat() {
        return '@echo off\r\nstart "" "%~dp0presentazione\\index.html"\r\n';
    }

    function buildCourseShortcutDesktop() {
        return `[Desktop Entry]
Version=1.0
Type=Application
Name=Corso Criptovalute
Comment=Apri la presentazione del corso
Path=.
Exec=xdg-open presentazione/index.html
Terminal=false
Categories=Education;
`;
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    async function exportMarkdownBackup() {
        const btn = document.getElementById('btnExportMd');
        if (btn) btn.disabled = true;
        try {
            if (typeof JSZip === 'undefined') throw new Error('Impossibile creare l\'archivio: libreria ZIP non disponibile.');
            if (!getTurndown()) throw new Error('Impossibile convertire i contenuti: convertitore Markdown non disponibile.');
            if (typeof marked === 'undefined') throw new Error('Impossibile preparare la presentazione: libreria Markdown non disponibile.');
            const res = await fetch(API, { headers: authHeaders() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 404) {
                    throw new Error('Servizio di export non trovato sul server. Contatta l\'amministratore.');
                }
                throw new Error(data.error || `Export non riuscito (errore ${res.status}).`);
            }
            const assets = await loadOfflineAssets();
            const pages = buildPresentationPages(data.manifest || {}, data.items || []);
            const zip = new JSZip();
            zip.file('Corso Criptovalute.bat', buildCourseShortcutBat());
            zip.file('Corso Criptovalute.desktop', buildCourseShortcutDesktop());
            zip.file('presentazione/index.html', buildPresentationIndex(data.manifest || {}, pages));
            zip.file('presentazione/assets/viewer.css', assets.css);
            zip.file('presentazione/assets/viewer.js', assets.viewer);
            zip.file('presentazione/assets/chart.umd.min.js', assets.chart);
            zip.file('presentazione/assets/highlight.min.js', assets.highlight);
            zip.file('presentazione/assets/logo.png', assets.logo);
            zip.file('markdown/manifest.json', JSON.stringify(manifestWithFiles(data.manifest || {}), null, 2) + '\n');
            (data.items || []).forEach((row) => {
                zip.file(`markdown/${row.id}.md`, buildMdFile(row));
            });
            const blob = await zip.generateAsync({ type: 'blob' });
            const stamp = (data.exportedAt || new Date().toISOString()).slice(0, 10);
            downloadBlob(blob, `corsi-usb-${stamp}.zip`);
        } catch (err) {
            alert(err.message || 'Export non riuscito.');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function wireExportMdButton(options) {
        const btn = document.getElementById('btnExportMd');
        if (!btn || btn.dataset.wired) return;
        btn.dataset.wired = '1';
        btn.style.display = options && options.show === true ? 'inline' : 'none';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            exportMarkdownBackup();
        });
    }

    window.CorsiExport = {
        getTurndown,
        exportMarkdownBackup,
        wireExportMdButton,
    };
})();
