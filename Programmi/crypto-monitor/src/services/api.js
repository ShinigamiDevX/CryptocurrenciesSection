const BASE_URL = 'https://api.coingecko.com/api/v3';

/**
 * Fetch current prices and 24h change for given coin IDs.
 * @param {string[]} coinIds - Array of coin IDs (e.g., ['bitcoin', 'ethereum'])
 * @returns {Promise<Object>} - Object with coin data
 */
const CACHE_TTL = 60 * 1000; // 1 Minute
const cache = new Map();

/**
 * Fetch current prices from our BACKEND service.
 */
export const getMarketData = async (coinIds = [], currency = 'eur', forceRefresh = false, signal) => {
  try {
    const url = `/api/prices?currency=${currency}${forceRefresh ? '&refresh=true' : ''}`;
    const res = await fetch(url, {
      headers: getAuthHeaders(),
      signal
    });
    if (!res.ok) throw new Error('Failed to fetch prices from backend');
    return await res.json();
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.error('Failed to fetch market data from backend:', error);
    return null;
  }
};

/**
 * Search for coins by name (Optional utility for adding assets)
 */
export const searchCoins = async (query) => {
  if (!query) return [];
  try {
    const response = await fetch(`${BASE_URL}/search?query=${query}`);
    const data = await response.json();
    return data.coins || [];
  } catch (error) {
    console.error('Search failed:', error);
    return [];
  }
};

/**
 * Fetch historical data for a coin at a specific date.
 * @param {string} coinId - The coin ID (e.g., 'bitcoin')
 * @param {string} date - Date in DD-MM-YYYY format
 */
export const getHistoricalPrice = async (coinId, date) => {
  try {
    const response = await fetch(
      `${BASE_URL}/coins/${coinId}/history?date=${date}&localization=false`
    );
    if (!response.ok) throw new Error('History fetch failed');
    const data = await response.json();
    return data.market_data?.current_price || null;
  } catch (error) {
    console.error(`Failed to get history for ${coinId} on ${date}:`, error);
    return null;
  }
};



// --- Asset Persistence ---

const getAuthHeaders = () => {
  const token = sessionStorage.getItem('auth_token');
  return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

export const getAssets = async () => {
  const res = await fetch('/api/assets', {
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    if (res.status === 401) {
      sessionStorage.clear();
      window.location.reload();
    }
    throw new Error('Failed to fetch assets from backend');
  }
  return await res.json();
};

export const getStoredHistoricalPrices = async () => {
  const res = await fetch('/api/historical-prices', {
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    throw new Error('Failed to fetch historical prices');
  }
  return await res.json();
};

export const saveAssets = async (assets) => {
  try {
    const res = await fetch('/api/assets', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ assets })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // Anti-overwrite protection triggered on server
        console.warn('[saveAssets] Salvataggio bloccato dal server (protezione anti-sovrascrittura):', body.error);
        console.warn(`[saveAssets] Holdings esistenti: ${body.existingHoldings}, nuovi: ${body.newHoldings}`);
      } else if (res.status === 400) {
        console.error('[saveAssets] Dati non validi:', body.error);
      } else {
        console.error('[saveAssets] Errore server:', res.status, body.error);
      }
    }
  } catch (e) {
    console.error('Failed to save assets', e);
  }
};

export const checkHealth = async () => {
  try {
    const res = await fetch('/api/init-check');
    return res.ok;
  } catch (e) {
    return false;
  }
};
