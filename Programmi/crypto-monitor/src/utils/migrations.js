import { mapToCoinGeckoId } from '../services/blockchain';

export const migrateLegacyAssets = (parsedAssets) => {
    if (!Array.isArray(parsedAssets)) return [];

    // Phase 1: Remap IDs and Normalize
    const remappedAssets = parsedAssets.map(a => {
        let updated = { ...a };

        // 1. Fix Legacy Holdings Structure
        if (updated.amount !== undefined && !updated.holdings) {
            updated.holdings = [{
                id: Date.now().toString() + Math.random(),
                amount: updated.amount,
                blockchain: 'Unknown',
                label: 'Legacy Import',
                date: updated.acquisitionDate || new Date().toISOString()
            }];
        }

        // 2. Fix CoinGecko IDs
        let needsRemap = false;
        if (updated.id && !updated.id.startsWith('bitcoin')) {
            if (updated.id.includes('-')) needsRemap = true;
            if (['polygon', 'matic', 'matic-network', 'ethena', 'ena', 'usde', 'btt', 'bttc'].includes(updated.id.toLowerCase())) needsRemap = true;
            if (updated.symbol && ['matic', 'pol', 'ena', 'usde', 'btt'].includes(updated.symbol.toLowerCase())) needsRemap = true;
        }

        if (needsRemap) {
            let symbol = updated.symbol || updated.id.split('-')[0];
            let chain = 'common';
            if (updated.id.includes('-')) {
                const parts = updated.id.split('-');
                if (parts.length >= 2) chain = parts[1];
            }
            const mapped = mapToCoinGeckoId(symbol, chain);

            if (symbol.toLowerCase() === 'matic' || symbol.toLowerCase() === 'pol') updated.id = 'polygon-ecosystem-token';
            else if (symbol.toLowerCase() === 'ena') updated.id = 'ethena';
            else if (symbol.toLowerCase() === 'usde') updated.id = 'ethena-usde';
            else if (symbol.toLowerCase() === 'btt') updated.id = 'bittorrent';
            else if (symbol.toLowerCase() === 'ltc') updated.id = 'litecoin';
            else if (symbol.toLowerCase() === 'xrp') updated.id = 'ripple';
            else if (symbol.toLowerCase() === 'sol') updated.id = 'solana';
            else if (symbol.toLowerCase() === 'bch') updated.id = 'bitcoin-cash';
            else if (mapped !== updated.id) {
                updated.id = mapped;
            }
        }

        if (updated.id === 'USDT' || updated.id === 'usdt') updated.id = 'tether';
        if (updated.id === 'USDC' || updated.id === 'usdc') updated.id = 'usd-coin';

        // Special Fix for "Ethereum BTTC-Bridged" (ETHB) on Tron
        if (updated.symbol === 'ETHB' || (updated.name && updated.name.includes('BTTC-Bridged'))) {
            updated.id = 'ethereum';
            updated.name = 'Ethereum';
            updated.symbol = 'ETH';

            if (updated.holdings) {
                updated.holdings = updated.holdings.map(h => ({
                    ...h,
                    blockchain: 'Tron (TRC20)'
                }));
            }
        }

        return updated;
    });

    // Phase 2: Merge Assets with Same ID
    const mergedMap = new Map();
    remappedAssets.forEach(asset => {
        if (mergedMap.has(asset.id)) {
            const existing = mergedMap.get(asset.id);
            // Merge holdings
            existing.holdings = [...(existing.holdings || []), ...(asset.holdings || [])];
        } else {
            mergedMap.set(asset.id, asset);
        }
    });

    // Phase 3: Deduplicate Holdings & Backfill Dates
    return Array.from(mergedMap.values()).map(asset => {
        if (asset.holdings && Array.isArray(asset.holdings)) {
            const seen = new Set();
            asset.holdings = asset.holdings.filter(h => {
                // Backfill missing date
                if (!h.date) {
                    h.date = h.acquisitionDate || h.timestamp || new Date().toISOString().split('T')[0];
                }
                if (!h.proceeding && h.legalProceeding) {
                    h.proceeding = h.legalProceeding;
                }

                // Normalize fields for comparison
                const addr = (h.walletAddress || '').toLowerCase().trim();
                const chain = (h.blockchain || '').toLowerCase().trim();
                const amt = parseFloat(h.amount).toFixed(6);
                let dateStr = '';
                try {
                    dateStr = h.date.split('T')[0];
                } catch (e) { dateStr = h.date; }

                const key = `${addr}|${amt}|${chain}|${dateStr}`;

                if (seen.has(key)) return false;

                seen.add(key);
                return true;
            });
        }
        return asset;
    });
};
