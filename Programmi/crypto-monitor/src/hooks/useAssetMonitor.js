import { useEffect, useMemo } from 'react';
import { useAssetStore } from '../store/useAssetStore';

export const useAssetMonitor = (currency = 'eur') => {
    const assets = useAssetStore(state => state.assets);
    const isLoading = useAssetStore(state => state.isLoading);
    const error = useAssetStore(state => state.error);
    const lastUpdated = useAssetStore(state => state.lastUpdated);
    const fetchAssets = useAssetStore(state => state.fetchAssets);
    const setCurrency = useAssetStore(state => state.setCurrency);
    const addAsset = useAssetStore(state => state.addAsset);
    const removeHolding = useAssetStore(state => state.removeHolding);
    const updateHolding = useAssetStore(state => state.updateHolding);
    const removeAsset = useAssetStore(state => state.removeAsset);
    const setManualPrice = useAssetStore(state => state.setManualPrice);
    const refreshPrices = useAssetStore(state => state.refreshPrices);
    const eurUsdRate = useAssetStore(state => state.eurUsdRate);
    const apiError = useAssetStore(state => state.apiError);

    useEffect(() => {
        setCurrency(currency);
    }, [currency, setCurrency]);

    useEffect(() => {
        fetchAssets().then(() => {
            refreshPrices();
        });
    }, [fetchAssets, refreshPrices]);

    // Polling per l'aggiornamento automatico completo (asset dal DB locale + prezzi)
    useEffect(() => {
        const intervalId = setInterval(() => {
            fetchAssets().then(() => {
                refreshPrices();
            });
        }, 1800000); // 30 minuti in millisecondi (30 * 60 * 1000)

        return () => clearInterval(intervalId);
    }, [fetchAssets, refreshPrices]);

    // Derived values calculation logic (transplanted from hook to keep components working)
    const assetsWithValue = useMemo(() => {
        const rateMultiplier = currency === 'usd' ? eurUsdRate : 1;

        return assets.map(asset => {
            const rawPrice = (asset.currentPrice && asset.currentPrice > 0) ? asset.currentPrice : (asset.manualPrice || 0);
            const convertedPrice = rawPrice * rateMultiplier;
            const activeHoldings = asset.holdings ? asset.holdings.filter(h => !h.status || h.status === 'active') : [];
            const totalAmount = activeHoldings.reduce((sum, h) => sum + parseFloat(h.amount), 0);

            return {
                ...asset,
                amount: totalAmount,
                currentPrice: convertedPrice, // Overwrite with converted price for all children
                rawEurPrice: rawPrice, // Keep original if needed elsewhere
                totalValue: convertedPrice * totalAmount,
                confiscatedValue: asset.holdings ? asset.holdings.filter(h => h.status === 'confiscated').reduce((sum, h) => {
                    if (h.historicFiatValueEur) {
                        return sum + (h.historicFiatValueEur * rateMultiplier);
                    }
                    // Se non c'è il valore storico, fallisce usando il prezzo attuale, ma idealmente dovrebbe esserci
                    return sum + (convertedPrice * parseFloat(h.amount));
                }, 0) : 0,
                releasedValue: asset.holdings ? asset.holdings.filter(h => h.status === 'released').reduce((sum, h) => {
                    if (h.historicFiatValueEur) {
                        return sum + (h.historicFiatValueEur * rateMultiplier);
                    }
                    // Se non c'è il valore storico, fallisce usando il prezzo attuale, ma idealmente dovrebbe esserci
                    return sum + (convertedPrice * parseFloat(h.amount));
                }, 0) : 0,
                frozenValue: asset.holdings ? asset.holdings.filter(h => h.status === 'freezing').reduce((sum, h) => {
                    if (h.historicFiatValueEur) {
                        return sum + (h.historicFiatValueEur * rateMultiplier);
                    }
                    return sum + (convertedPrice * parseFloat(h.amount));
                }, 0) : 0
            };
        });
    }, [assets, currency, eurUsdRate]);

    return {
        assets: assetsWithValue,
        historicalPrices: useAssetStore(state => state.historicalPrices),
        totalValue: assetsWithValue.reduce((sum, a) => sum + a.totalValue, 0),
        totalConfiscated: assetsWithValue.reduce((sum, a) => sum + a.confiscatedValue, 0),
        totalReleased: assetsWithValue.reduce((sum, a) => sum + a.releasedValue, 0),
        totalFrozen: assetsWithValue.reduce((sum, a) => sum + a.frozenValue, 0),
        isLoading,
        lastUpdated,
        error,
        addAsset,
        removeHolding,
        removeAsset,
        updateHolding,
        setManualPrice,
        refreshNow: () => refreshPrices(true),
        apiError
    };
};
