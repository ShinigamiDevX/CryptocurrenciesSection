import Database from 'better-sqlite3';

const db = new Database('./backups/crypto_monitor.db');

// Istruzioni per l'uso:
// 1. Modifica i valori in questo array con i prezzi storici REALI per ogni mese.
// 2. L'assetId deve coincidere con l'id su coingecko (es. 'bitcoin', 'tether', 'ethereum').
// 3. Esegui lo script con: node set_historical_prices.js

const historicalData = [
    // --- BITCOIN (BTC) ---
    { assetId: 'bitcoin', date: '2025-11', priceEur: 78311.60, priceUsd: 90841.45 },
    { assetId: 'bitcoin', date: '2025-12', priceEur: 76219.51, priceUsd: 88414.63 },
    { assetId: 'bitcoin', date: '2026-01', priceEur: 72536.02, priceUsd: 84141.78 },
    { assetId: 'bitcoin', date: '2026-02', priceEur: 56796.54, priceUsd: 65883.99 },

    // --- TETHER (USDT) ---
    { assetId: 'tether', date: '2025-11', priceEur: 0.86, priceUsd: 1.0003 },
    { assetId: 'tether', date: '2025-12', priceEur: 0.86, priceUsd: 0.9990 },
    { assetId: 'tether', date: '2026-01', priceEur: 0.86, priceUsd: 0.9985 },
    { assetId: 'tether', date: '2026-02', priceEur: 0.86, priceUsd: 1.0000 },

    // --- BNB CHAIN (BNB) ---
    { assetId: 'binancecoin', date: '2025-11', priceEur: 753.24, priceUsd: 873.76 },
    { assetId: 'binancecoin', date: '2025-12', priceEur: 741.67, priceUsd: 860.34 },
    { assetId: 'binancecoin', date: '2026-01', priceEur: 739.11, priceUsd: 857.37 },
    { assetId: 'binancecoin', date: '2026-02', priceEur: 529.28, priceUsd: 613.97 },

    // --- ETHEREUM (ETH) ---
    { assetId: 'ethereum', date: '2025-11', priceEur: 2578.65, priceUsd: 2991.23 },
    { assetId: 'ethereum', date: '2025-12', priceEur: 2560.40, priceUsd: 2970.06 },
    { assetId: 'ethereum', date: '2026-01', priceEur: 2329.66, priceUsd: 2702.41 },
    { assetId: 'ethereum', date: '2026-02', priceEur: 1664.93, priceUsd: 1931.32 },

    // --- AVALANCHE (AVAX) ---
    { assetId: 'avalanche-2', date: '2025-11', priceEur: 12.28, priceUsd: 14.25 },
    { assetId: 'avalanche-2', date: '2025-12', priceEur: 10.83, priceUsd: 12.56 },
    { assetId: 'avalanche-2', date: '2026-01', priceEur: 9.38, priceUsd: 10.88 },
    { assetId: 'avalanche-2', date: '2026-02', priceEur: 7.72, priceUsd: 8.96 },

    // --- MONERO (XMR) ---
    { assetId: 'monero', date: '2025-11', priceEur: 356.36, priceUsd: 413.38 },
    { assetId: 'monero', date: '2025-12', priceEur: 378.22, priceUsd: 438.74 },
    { assetId: 'monero', date: '2026-01', priceEur: 397.38, priceUsd: 460.96 },
    { assetId: 'monero', date: '2026-02', priceEur: 291.01, priceUsd: 337.57 },

    // --- WETH ---
    { assetId: 'weth', date: '2025-11', priceEur: 2579.31, priceUsd: 2992.00 },
    { assetId: 'weth', date: '2025-12', priceEur: 2560.22, priceUsd: 2969.85 },
    { assetId: 'weth', date: '2026-01', priceEur: 2329.71, priceUsd: 2702.47 },
    { assetId: 'weth', date: '2026-02', priceEur: 1666.08, priceUsd: 1932.65 },

    // --- POLYGON (MATIC) ---
    { assetId: 'polygon-ecosystem-token', date: '2025-11', priceEur: 0.115, priceUsd: 0.1337 },
    { assetId: 'polygon-ecosystem-token', date: '2025-12', priceEur: 0.089, priceUsd: 0.1028 },
    { assetId: 'polygon-ecosystem-token', date: '2026-01', priceEur: 0.096, priceUsd: 0.1117 },
    { assetId: 'polygon-ecosystem-token', date: '2026-02', priceEur: 0.094, priceUsd: 0.1090 },

    // --- DOGECOIN (DOGE) ---
    { assetId: 'dogecoin', date: '2025-11', priceEur: 0.128, priceUsd: 0.1486 },
    { assetId: 'dogecoin', date: '2025-12', priceEur: 0.106, priceUsd: 0.1233 },
    { assetId: 'dogecoin', date: '2026-01', priceEur: 0.100, priceUsd: 0.1157 },
    { assetId: 'dogecoin', date: '2026-02', priceEur: 0.080, priceUsd: 0.0933 },

    // --- BINANCE USD (BUSDT) ---
    { assetId: 'binance-usd', date: '2025-11', priceEur: 0.86, priceUsd: 0.9985 },
    { assetId: 'binance-usd', date: '2025-12', priceEur: 0.86, priceUsd: 0.9986 },
    { assetId: 'binance-usd', date: '2026-01', priceEur: 0.86, priceUsd: 0.9992 },
    { assetId: 'binance-usd', date: '2026-02', priceEur: 0.85, priceUsd: 0.9904 },

    // --- TRON (TRX) ---
    { assetId: 'tron', date: '2025-11', priceEur: 0.242, priceUsd: 0.2810 },
    { assetId: 'tron', date: '2025-12', priceEur: 0.247, priceUsd: 0.2862 },
    { assetId: 'tron', date: '2026-01', priceEur: 0.253, priceUsd: 0.2937 },
    { assetId: 'tron', date: '2026-02', priceEur: 0.244, priceUsd: 0.2829 },

    // --- EOS ---
    { assetId: 'eos', date: '2025-11', priceEur: 0.172, priceUsd: 0.1998 },
    { assetId: 'eos', date: '2025-12', priceEur: 0.139, priceUsd: 0.1609 },
    { assetId: 'eos', date: '2026-01', priceEur: 0.086, priceUsd: 0.1004 },
    { assetId: 'eos', date: '2026-02', priceEur: 0.069, priceUsd: 0.0798 },

    // --- DAI ---
    { assetId: 'dai', date: '2025-11', priceEur: 0.86, priceUsd: 0.9993 },
    { assetId: 'dai', date: '2025-12', priceEur: 0.86, priceUsd: 0.9995 },
    { assetId: 'dai', date: '2026-01', priceEur: 0.86, priceUsd: 0.9986 },
    { assetId: 'dai', date: '2026-02', priceEur: 0.86, priceUsd: 1.0001 },

    // --- LITECOIN (LTC) ---
    { assetId: 'litecoin', date: '2025-11', priceEur: 72.54, priceUsd: 84.15 },
    { assetId: 'litecoin', date: '2025-12', priceEur: 67.88, priceUsd: 78.74 },
    { assetId: 'litecoin', date: '2026-01', priceEur: 56.32, priceUsd: 65.33 },
    { assetId: 'litecoin', date: '2026-02', priceEur: 46.99, priceUsd: 54.51 },

    // --- ETHENA (ENA) ---
    { assetId: 'ethena', date: '2025-11', priceEur: 0.244, priceUsd: 0.2836 },
    { assetId: 'ethena', date: '2025-12', priceEur: 0.175, priceUsd: 0.2036 },
    { assetId: 'ethena', date: '2026-01', priceEur: 0.132, priceUsd: 0.1536 },
    { assetId: 'ethena', date: '2026-02', priceEur: 0.088, priceUsd: 0.1025 },

    // --- USD COIN (USDC) ---
    { assetId: 'usd-coin', date: '2025-11', priceEur: 0.86, priceUsd: 0.9998 },
    { assetId: 'usd-coin', date: '2025-12', priceEur: 0.86, priceUsd: 0.9999 },
    { assetId: 'usd-coin', date: '2026-01', priceEur: 0.86, priceUsd: 0.9997 },
    { assetId: 'usd-coin', date: '2026-02', priceEur: 0.86, priceUsd: 1.0000 },

    // --- DEFI HUNTERS DAO (DDAO) ---
    { assetId: 'defi-hunters-dao', date: '2025-11', priceEur: 0.0099, priceUsd: 0.0115 },
    { assetId: 'defi-hunters-dao', date: '2025-12', priceEur: 0.0097, priceUsd: 0.0112 },
    { assetId: 'defi-hunters-dao', date: '2026-01', priceEur: 0.0000, priceUsd: 0.0000 },
    { assetId: 'defi-hunters-dao', date: '2026-02', priceEur: 0.0062, priceUsd: 0.0071 }
];

console.log('--- Crypto Monitor Storico Prezzi ---');

try {
    const insertStmt = db.prepare('INSERT INTO historical_prices (assetId, priceEur, priceUsd, date) VALUES (?, ?, ?, ?)');
    const updateStmt = db.prepare('UPDATE historical_prices SET priceEur = ?, priceUsd = ?, timestamp = CURRENT_TIMESTAMP WHERE id = ?');
    const checkStmt = db.prepare('SELECT id FROM historical_prices WHERE assetId = ? AND date = ?');
    const assetCheckStmt = db.prepare('SELECT id FROM assets WHERE id = ?');

    const transaction = db.transaction((data) => {
        let added = 0;
        let updated = 0;
        let skipped = 0;

        for (const entry of data) {
            // Verifica se l'asset esiste in portafoglio
            const assetExists = assetCheckStmt.get(entry.assetId);
            if (!assetExists) {
                console.warn(`[SKIP] L'asset '${entry.assetId}' non è presente nel database.`);
                skipped++;
                continue;
            }

            const existing = checkStmt.get(entry.assetId, entry.date);
            if (existing) {
                updateStmt.run(entry.priceEur, entry.priceUsd, existing.id);
                updated++;
            } else {
                insertStmt.run(entry.assetId, entry.priceEur, entry.priceUsd, entry.date);
                added++;
            }
        }

        console.log(`Operazione completata!`);
        console.log(`- Nuovi record creati: ${added}`);
        console.log(`- Record aggiornati: ${updated}`);
        console.log(`- Ignorati (asset non in cassa): ${skipped}`);
        console.log(`\nOra ricarica la pagina web per vedere il grafico aggiornato!`);
    });

    transaction(historicalData);

} catch (error) {
    console.error('Errore durante il salvataggio:', error.message);
} finally {
    db.close();
}
