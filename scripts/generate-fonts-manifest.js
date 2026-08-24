#!/usr/bin/env node
/**
 * Scansiona /Fonts e genera:
 *   corsi/fonts/manifest.json  — elenco per il menu dell'editor
 *   corsi/fonts/editor-fonts.css — @font-face verso /Fonts/…
 *
 * Richiede `fc-scan` (pacchetto fontconfig).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FONT_DIR = path.join(ROOT, 'Fonts');
const OUT_DIR = path.join(ROOT, 'corsi', 'fonts');

const SKIP = new Set([
    'marlett.ttf', 'symbol.ttf', 'webdings.ttf', 'wingding.ttf', 'wingdng2.ttf', 'wingdng3.ttf',
    'segmdl2.ttf', 'seguiemj.ttf', 'segoeicons.ttf', 'simsunb.ttf', 'simsunextg.ttf',
    'msyh.ttc', 'msyhl.ttc', 'msjh.ttc', 'msjhbd.ttc', 'mingliub.ttc', 'yugothm.ttc',
    'sansserifcollection.ttf', 'desktop.ini',
]);

function cssEscapeFamily(name) {
    return `"${String(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'font';
}

function genericForFamily(family) {
    const f = family.toLowerCase();
    if (/mono|console|courier|code|lucida sans typewriter/i.test(f)) return 'monospace';
    if (/serif|times|georgia|garamond|baskerville|cambria|calibri light/i.test(f) && !/sans/i.test(f)) return 'serif';
    return 'sans-serif';
}

function styleFlags(style, slant, weight) {
    const s = String(style || '').toLowerCase();
    const w = Number(weight) || 400;
    let fontStyle = Number(slant) > 0 || /italic|oblique|corsivo|cursiva|kursiv/i.test(s) ? 'italic' : 'normal';
    let fontWeight = w >= 600 || /bold|grassetto|negreta|fett|semibold|demi|heavy|black/i.test(s) ? 700 : 400;
    if (/black|heavy|extrabold|ultrabold/i.test(s)) fontWeight = 900;
    else if (/semibold|demi|medium/i.test(s) && fontWeight < 700) fontWeight = 600;
    return { fontStyle, fontWeight };
}

function formatForFile(file) {
    return /\.otf$/i.test(file) ? 'opentype' : 'truetype';
}

function pickPrimary(variants) {
    const score = (v) => {
        let s = 0;
        if (v.fontWeight === 400) s += 20;
        if (v.fontStyle === 'normal') s += 10;
        if (/\.ttf$/i.test(v.file)) s += 2;
        return s;
    };
    return [...variants].sort((a, b) => score(b) - score(a))[0];
}

function main() {
    const files = fs.readdirSync(FONT_DIR)
        .filter((f) => /\.(ttf|otf|ttc)$/i.test(f))
        .sort((a, b) => a.localeCompare(b, 'it'));

    const byFamily = new Map();
    const faces = [];

    for (const file of files) {
        if (SKIP.has(file.toLowerCase())) continue;
        const full = path.join(FONT_DIR, file);
        let family = '';
        let weight = '400';
        let slant = '0';
        let style = '';
        try {
            const out = execFileSync('fc-scan', ['--format', '%{family}|%{weight}|%{slant}|%{style}', full], { encoding: 'utf8' }).trim();
            [family, weight, slant, style] = out.split('|');
        } catch {
            continue;
        }
        if (!family) continue;

        const flags = styleFlags(style, slant, weight);
        const url = '/Fonts/' + encodeURIComponent(file);
        const fmt = formatForFile(file);
        if (!byFamily.has(family)) byFamily.set(family, []);
        byFamily.get(family).push({ file, url, ...flags });
        faces.push({ family, url, format: fmt, weight: flags.fontWeight, style: flags.fontStyle });
    }

    const fonts = [...byFamily.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'it'))
        .map(([family, variants]) => {
            const primary = pickPrimary(variants);
            const cssFamily = cssEscapeFamily(family);
            const generic = genericForFamily(family);
            return {
                id: slug(family),
                label: family,
                family: `${cssFamily}, ${generic}`,
                cssFamily: family,
                file: primary.url,
            };
        });

    const manifest = {
        generatedAt: new Date().toISOString(),
        source: '/Fonts',
        fonts,
    };

    const css = [
        '/* Font locali da /Fonts — generato da scripts/generate-fonts-manifest.js */',
        ...faces.map((f) => {
            const fam = cssEscapeFamily(f.family);
            return `@font-face{font-family:${fam};font-style:${f.style};font-weight:${f.weight};font-display:swap;src:url('${f.url}') format('${f.format}');}`;
        }),
    ].join('\n');

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'editor-fonts.css'), css);
    console.log(`OK: ${fonts.length} famiglie, ${faces.length} @font-face → corsi/fonts/`);
}

main();
