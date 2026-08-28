import { create } from 'zustand';
import { getAssets, saveAssets, getMarketData, getStoredHistoricalPrices } from '../services/api';

const sanitize = (text) => {
    if (typeof text !== 'string') return text;
    return text.trim()
        .replace(/<[^>]*>?/gm, '') // Remove HTML tags
        .substring(0, 500); // Limit length
};

export const useAssetStore = create((set, get) => ({
    assets: [],
    historicalPrices: [],
    isLoading: false,
    error: null,
    lastUpdated: null,
    currency: 'eur',
    eurUsdRate: 1.08, // Default rate

    setCurrency: (currency) => set({ currency }),
    setEurUsdRate: (rate) => set({ eurUsdRate: rate }),

    fetchHistoricalPrices: async () => {
        try {
            const historicalPrices = await getStoredHistoricalPrices();
            set({ historicalPrices });
        } catch (error) {
            console.error('Failed to load historical prices', error);
        }
    },

    fetchAssets: async () => {
        set({ isLoading: true });
        try {
            const assets = await getAssets();
            set({ assets, isLoading: false, lastUpdated: new Date() });
            get().fetchHistoricalPrices();
        } catch (error) {
            set({ error: 'Errore nel caricamento degli asset', isLoading: false });
        }
    },

    saveToServer: async () => {
        const { assets } = get();
        try {
            await saveAssets(assets);
        } catch (e) {
            console.error('Failed to sync with server', e);
        }
    },

    addAsset: (newAssetData) => {
        set((state) => {
            const existing = state.assets.find(a => a.id === newAssetData.id);
            const newHoldingId = crypto.randomUUID();

            const newHolding = {
                id: newHoldingId,
                amount: parseFloat(newAssetData.amount),
                blockchain: sanitize(newAssetData.blockchain) || 'Unknown',
                walletAddress: sanitize(newAssetData.walletAddress) || '',
                proceeding: sanitize(newAssetData.legalProceeding) || 'N/D',
                suspectName: sanitize(newAssetData.suspectName) || 'N/D',
                label: 'Wallet ' + (existing ? existing.holdings.length + 1 : 1),
                date: newAssetData.seizureDate || new Date().toISOString().split('T')[0],
                status: newAssetData.status || 'active',
                statusDate: newAssetData.statusDate || null,
                timestamp: new Date().toISOString()
            };

            let updatedAssets;
            if (existing) {
                updatedAssets = state.assets.map(a => a.id === newAssetData.id ? {
                    ...a,
                    holdings: [...a.holdings, newHolding],
                    // Update manualPrice if provided and not already set
                    manualPrice: newAssetData.manualPrice || a.manualPrice
                } : a);
            } else {
                updatedAssets = [...state.assets, {
                    id: newAssetData.id,
                    name: newAssetData.name,
                    symbol: newAssetData.symbol,
                    holdings: [newHolding],
                    manualPrice: newAssetData.manualPrice || null
                }];
            }

            return { assets: updatedAssets };
        });
        get().saveToServer();
    },

    updateHolding: (assetId, holdingId, updatedData) => {
        set((state) => {
            // Sanitize string fields if present
            const sanitized = { ...updatedData };
            ['proceeding', 'suspectName', 'walletAddress', 'blockchain', 'label'].forEach(key => {
                if (sanitized[key]) sanitized[key] = sanitize(sanitized[key]);
            });

            return {
                assets: state.assets.map(a => a.id === assetId ? {
                    ...a,
                    holdings: a.holdings.map(h => h.id === holdingId ? { ...h, ...sanitized } : h)
                } : a)
            };
        });
        get().saveToServer();
    },

    removeHolding: (assetId, holdingId) => {
        set((state) => ({
            assets: state.assets.map(a => a.id === assetId ? {
                ...a,
                holdings: a.holdings.filter(h => h.id !== holdingId)
            } : a)
        }));
        get().saveToServer();
    },

    removeAsset: (assetId) => {
        set((state) => ({
            assets: state.assets.filter(a => a.id !== assetId)
        }));
        get().saveToServer();
    },

    setManualPrice: (assetId, price) => {
        set((state) => ({
            assets: state.assets.map(a => a.id === assetId ? { ...a, manualPrice: parseFloat(price) } : a)
        }));
        get().saveToServer();
    },

    apiError: null,
    apiErrorTime: null,

    refreshPrices: async (forceRefresh = false) => {
        const { assets, currency } = get();
        if (assets.length === 0) return;

        try {
            const ids = [...new Set(assets.map(a => a.id))];
            const marketData = await getMarketData(ids, currency, forceRefresh);

            // Extract the exchange rate from the metadata
            let rate = get().eurUsdRate;
            let apiError = null;
            let apiErrorTime = get().apiErrorTime;

            if (marketData && marketData._meta) {
                if (marketData._meta.eurUsdRate) {
                    rate = marketData._meta.eurUsdRate;
                }
                if (marketData._meta.apiError && marketData._meta.apiError !== 'ok') {
                    apiError = marketData._meta.apiError;
                }
                if (marketData._meta.apiErrorTime) {
                    apiErrorTime = marketData._meta.apiErrorTime;
                } else if (marketData._meta.apiError === 'ok') {
                    apiErrorTime = new Date().toISOString(); // Success also counts for freshness
                }
            }

            set((state) => ({
                eurUsdRate: rate,
                apiError: apiError,
                apiErrorTime: apiErrorTime,
                assets: state.assets.map(a => {
                    const data = marketData[a.id];
                    return data ? { ...a, currentPrice: data.current_price, image: data.image || a.image, change24h: data.price_change_percentage_24h } : a;
                }),
                lastUpdated: new Date()
            }));
        } catch (e) {
            console.error('Price refresh failed', e);
        }
    }
}));
