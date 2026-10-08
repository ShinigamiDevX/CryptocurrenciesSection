#!/usr/bin/env node
'use strict';
/**
 * Import contatti exchange da Excel in LA BIBBIA 3.1.
 * Uso: node scripts/import-bibbia-xlsx.js "C:\path\LA BIBBIA 3.0 Richieste Exchange.xlsx" [--replace]
 */
const path = require('path');
const { importBibbiaFromXlsxNode } = require('../bibbia-import');

const file = process.argv[2];
const replace = process.argv.includes('--replace');
if (!file) {
    console.error('Uso: node scripts/import-bibbia-xlsx.js <file.xlsx> [--replace]');
    process.exit(1);
}

try {
    const result = importBibbiaFromXlsxNode(path.resolve(file), { replace, actorId: null });
    console.log('Import completato:', result);
} catch (err) {
    console.error(err.message || err);
    process.exit(1);
}
