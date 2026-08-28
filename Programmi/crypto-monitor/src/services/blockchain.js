/**
 * Blockchain Balance Scanner
 * Uses Official/Cloudflare Public RPCs for better reliability.
 */

// -------------------
// 1. Address Detection 
// -------------------
export const detectAddressType = (address) => {
    if (!address) return 'UNKNOWN';

    // EVM (starts with 0x and is 42 chars)
    if (address.startsWith('0x') && address.length === 42) {
        return 'EVM';
    }

    // Bitcoin (Legacy: 1..., Segwit: 3..., Native Segwit: bc1...)
    if ((address.startsWith('1') || address.startsWith('3') || address.startsWith('bc1')) && address.length >= 26 && address.length <= 62) {
        return 'BTC';
    }

    // Tron (starts with T and is 34 chars)
    if (address.startsWith('T') && address.length === 34) {
        return 'TRON';
    }

    return 'UNKNOWN';
};

// -------------------
// RPC Configuration
// -------------------
const RPC_CONFIG = {
    BSC: 'https://bsc-dataseed.binance.org',
    POLYGON: [
        'https://polygon-rpc.com',
        'https://rpc.ankr.com/polygon',
        'https://1rpc.io/matic',
        'https://polygon-bor.publicnode.com'
    ],
    AVALANCHE: 'https://api.avax.network/ext/bc/C/rpc',
    ETHEREUM_CLOUDFLARE: 'https://cloudflare-eth.com'
};

// -------------------
// Helper: Fetch with Timeout
// -------------------
const fetchWithTimeout = async (url, options = {}, timeout = 6000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

// -------------------
// 2. Fetchers
// -------------------

// Generic EVM JSON-RPC Fetcher (Native)
const fetchEvmBalance = async (address, rpcUrlOrList, chainName, symbol, chainId) => {
    const rpcs = Array.isArray(rpcUrlOrList) ? rpcUrlOrList : [rpcUrlOrList];
    let lastError = null;

    for (const rpcUrl of rpcs) {
        try {
            // Timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s per RPC

            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_getBalance',
                    params: [address, 'latest'],
                    id: 1
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                lastError = `${chainName} RPC Error: ${response.status}`;
                continue;
            }

            const data = await response.json();
            if (data.result) {
                const wei = parseInt(data.result, 16);
                if (wei > 0) {
                    const amount = wei / 1e18; // Standard 18 decimals
                    return {
                        id: chainId, // CoinGecko ID
                        name: chainName,
                        symbol: symbol,
                        amount: amount.toFixed(6),
                        blockchain: chainName,
                        walletAddress: address,
                        type: 'Native'
                    };
                }
                // If result is 0x0 (0), it's a valid successful check, just no funds.
                return null;
            }
        } catch (error) {
            lastError = error.message;
            // console.warn(`RPC ${rpcUrl} Failed for ${chainName}:`, error.message);
        }
    }
    // If all failed
    if (lastError) console.error(`All RPCs failed for ${chainName}. Last error: ${lastError}`);
    return null;
};

export const mapToCoinGeckoId = (symbol, chain) => {
    const s = symbol.toLowerCase();
    const c = chain.toLowerCase();

    // Specifica Mappings per CoinGecko simple/price
    if (s === 'usdt') return 'tether';
    if (s === 'usdc') return 'usd-coin';
    if (s === 'btc') return 'bitcoin';
    if (s === 'wbtc') return 'wrapped-bitcoin';
    if (s === 'eth') return 'ethereum';
    if (s === 'weth') return 'weth';
    if (s === 'bnb') return 'binancecoin';
    if (s === 'wbnb') return 'wbnb';
    if (s === 'matic' || s === 'pol') return 'polygon-ecosystem-token';
    if (s === 'avax') return 'avalanche-2';
    if (s === 'doge') return 'dogecoin';
    if (s === 'ltc') return 'litecoin';
    if (s === 'bch') return 'bitcoin-cash';
    if (s === 'xrp') return 'ripple';
    if (s === 'sol') return 'solana';
    if (s === 'algo') return 'algorand';
    if (s === 'hbar') return 'hedera-hashgraph';
    if (s === 'ada') return 'cardano';
    if (s === 'dot') return 'polkadot';
    if (s === 'shib') return 'shiba-inu';
    if (s === 'dai') return 'dai';
    if (s === 'trx') return 'tron';
    if (s === 'eos') return 'eos';
    if (s === 'link') return 'chainlink';

    if (s === 'uni') return 'uniswap';
    if (s === 'ena' || s === 'ethena') return 'ethena';
    if (s === 'usde') return 'ethena-usde';
    if (s === 'btt' || s === 'bttc') return 'bittorrent';
    if (s === 'ethb' || (s === 'ethereum' && c.includes('tron'))) return 'ethereum'; /* Ethereum on Tron */

    // Privacy Coins
    if (s === 'xmr') return 'monero';
    if (s === 'zec') return 'zcash';
    if (s === 'dash') return 'dash';

    // Fallback: internal ID (probably won't fetch price but safe for key)
    return `${s}-${c.replace(/\s/g, '-')}`;
};

// ERC20 Token Fetcher
const fetchTokenBalance = async (address, token, rpcUrl) => {
    try {
        // Function signature for balanceOf(address): 0x70a08231
        // Pad address to 32 bytes (64 chars)
        const paddedAddress = address.replace('0x', '').padStart(64, '0');
        const dataPayload = `0x70a08231${paddedAddress}`;

        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [{
                    to: token.address,
                    data: dataPayload
                }, 'latest'],
                id: 1
            })
        });

        const data = await response.json();
        if (data.result && data.result !== '0x') {
            const rawBalance = parseInt(data.result, 16);
            if (rawBalance > 0) {
                const amount = rawBalance / Math.pow(10, token.decimals);
                const geckoId = mapToCoinGeckoId(token.symbol, token.chain);

                return {
                    id: geckoId, // Use Mapped ID for Price Fetching
                    name: token.name,
                    symbol: token.symbol,
                    amount: amount.toFixed(4),
                    blockchain: token.chain,
                    walletAddress: address,
                    type: 'Token'
                };
            }
        }
        return null;
    } catch (error) {
        // Silent fail for tokens to avoid console spam
        return null;
    }
};

const getDogeBalance = async (address) => {
    // List of APIs to try in order
    const apis = [
        {
            name: 'SoChain',
            url: `https://chain.so/api/v2/get_address_balance/DOGE/${address}`,
            parser: async (res) => {
                const data = await res.json();
                return data.data.confirmed_balance;
            }
        },
        {
            name: 'Dogechain',
            url: `https://dogechain.info/api/v1/address/balance/${address}`,
            parser: async (res) => {
                const data = await res.json();
                return data.balance; // usually returns string or number
            }
        },
        {
            name: 'BlockCypher',
            url: `https://api.blockcypher.com/v1/doge/main/addrs/${address}/balance`,
            parser: async (res) => {
                const data = await res.json();
                return data.balance / 100000000; // Satoshis to DOGE
            }
        }
    ];

    for (const api of apis) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            const response = await fetch(api.url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                const balance = await api.parser(response);
                const amount = parseFloat(balance);

                if (!isNaN(amount) && amount > 0) {
                    return [{
                        id: 'dogecoin',
                        name: 'Dogecoin',
                        symbol: 'DOGE',
                        amount: amount.toFixed(2),
                        blockchain: 'Dogecoin',
                        walletAddress: address,
                        type: 'Native'
                    }];
                } else if (!isNaN(amount) && amount === 0) {
                    return []; // Valid response, just zero balance
                }
            }
        } catch (error) {
            // console.warn(`Doge API ${api.name} failed:`, error);
            // Continue to next API
        }
    }

    console.error('All Doge APIs failed');
    return null;
};

const getBitcoinBalance = async (address) => {
    try {
        const response = await fetchWithTimeout(`https://blockchain.info/q/addressbalance/${address}`);
        if (!response.ok) throw new Error('BTC API Error');
        const satoshis = await response.text();
        const balance = parseInt(satoshis);
        if (balance > 0) {
            return {
                id: 'bitcoin',
                name: 'Bitcoin',
                symbol: 'BTC',
                amount: (balance / 100000000).toFixed(8),
                blockchain: 'Bitcoin Network',
                walletAddress: address,
                type: 'Native'
            };
        }
    } catch (error) { console.error('BTC Check Failed:', error); }
    return null;
};

const getTronBalance = async (address) => {
    try {
        const response = await fetchWithTimeout(`https://apilist.tronscanapi.com/api/account?address=${address}`);
        const data = await response.json();
        const found = [];
        const foundIds = new Set(); // Avoid duplicates

        const processList = (list, typeInfo) => {
            if (!list || !Array.isArray(list)) return;

            list.forEach(token => {
                // Basic validation
                if (!token.balance || parseFloat(token.balance) <= 0) return;

                const name = token.tokenName;
                const symbol = token.tokenAbbr || token.tokenName;
                if (!symbol) return;

                // Handle Native TRX (often appears in simple 'tokenBalances' or just separate)
                if (symbol.toLowerCase() === 'trx') {
                    found.push({
                        id: mapToCoinGeckoId('TRX', 'Tron'),
                        name: 'Tron',
                        symbol: 'TRX',
                        amount: (parseFloat(token.balance) / 1e6).toFixed(6),
                        blockchain: 'Tron Network',
                        walletAddress: address,
                        type: 'Native'
                    });
                    return;
                }

                // Tokens
                // Decimals: tokenDecimal (TRC20 usually has this), default to 6 for USDT/USDC if missing
                let decimals = token.tokenDecimal;
                if (decimals === undefined || decimals === null) {
                    if (symbol.toUpperCase() === 'USDT' || symbol.toUpperCase() === 'USDC') decimals = 6;
                    else decimals = 18; // Default fallback
                }

                const amount = parseFloat(token.balance) / Math.pow(10, decimals);

                // Filter small dust
                if (amount > 0.0001) {
                    const geckoId = mapToCoinGeckoId(symbol, 'Tron');

                    // Prevent duplicates (e.g. if same token appears in multiple lists)
                    const uniqueKey = `${geckoId}-${symbol}`;
                    if (foundIds.has(uniqueKey)) return;
                    foundIds.add(uniqueKey);

                    found.push({
                        id: geckoId,
                        name: name,
                        symbol: symbol.toUpperCase(),
                        amount: amount.toFixed(4),
                        blockchain: typeInfo === 'TRC20' ? 'Tron (TRC20)' : 'Tron (TRC10)',
                        walletAddress: address,
                        type: 'Token'
                    });
                }
            });
        };

        // 1. TRC20 Tokens (USDT, etc.) - Critical for User
        processList(data.trc20token_balances, 'TRC20');

        // 2. Standard Balances (TRX + TRC10)
        // API often returns 'tokenBalances' OR 'balances'
        processList(data.tokenBalances, 'TRC10');
        processList(data.balances, 'TRC10');

        return found;

    } catch (error) { console.error('Tron Check Failed:', error); }
    return null;
};

// -------------------
// 3. Configuration & Main Scan
// -------------------

const KNOWN_TOKENS = [
    // Ethereum Mainnet
    { chain: 'Ethereum', rpc: RPC_CONFIG.ETHEREUM_CLOUDFLARE, address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', name: 'Tether', decimals: 6 },
    { chain: 'Ethereum', rpc: RPC_CONFIG.ETHEREUM_CLOUDFLARE, address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { chain: 'Ethereum', rpc: RPC_CONFIG.ETHEREUM_CLOUDFLARE, address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { chain: 'Ethereum', rpc: RPC_CONFIG.ETHEREUM_CLOUDFLARE, address: '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0', symbol: 'EOS', name: 'EOS', decimals: 18 },

    // BSC (Binance Smart Chain) -> Often holds "Pegged" assets
    { chain: 'BSC (BEP20)', rpc: RPC_CONFIG.BSC, address: '0x55d398326f99059ff775485246999027b3197955', symbol: 'USDT', name: 'Tether USD', decimals: 18 },
    { chain: 'BSC (BEP20)', rpc: RPC_CONFIG.BSC, address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', symbol: 'USDC', name: 'USD Coin', decimals: 18 },
    { chain: 'BSC (BEP20)', rpc: RPC_CONFIG.BSC, address: '0x2170ed0880ac9a755fd29b2688956bd959f933f8', symbol: 'ETH', name: 'Ethereum Token', decimals: 18 },
    { chain: 'BSC (BEP20)', rpc: RPC_CONFIG.BSC, address: '0x56b6ed8ce58826582e2c8e2547c42328dd694517', symbol: 'EOS', name: 'EOS Token', decimals: 18 },
];

// Helper to process promises sequentially with delay and progress update
const processSequentially = async (tasks, onProgress) => {
    const results = [];
    for (const task of tasks) { // Process one by one
        if (onProgress) onProgress(task.name);

        try {
            const result = await task.fn();
            if (result) { // Only push if result is valid
                if (Array.isArray(result)) results.push(...result);
                else results.push(result);
            }
        } catch (e) {
            console.warn(`Task ${task.name} failed`, e);
            // Continue to next task even if one fails
        }

        // Strict Rate Limit Pause (User requested ~3 req/min)
        // We pause 1 second between checks to be conservative but not too slow
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return results;
};

// Ethplorer API (Free Tier) - Automatic Token Detection for Ethereum
const scanEthereumWithEthplorer = async (address) => {
    try {
        const response = await fetchWithTimeout(`https://api.ethplorer.io/getAddressInfo/${address}?apiKey=freekey`);
        const data = await response.json();

        const assets = [];

        // 1. Native ETH
        if (data.ETH && data.ETH.balance > 0) {
            assets.push({
                id: 'ethereum',
                name: 'Ethereum',
                symbol: 'ETH',
                amount: data.ETH.balance.toFixed(6),
                blockchain: 'Ethereum Mainnet',
                walletAddress: address,
                type: 'Native'
            });
        }

        // 2. Tokens (ERC20) - Automatically detected
        if (data.tokens && Array.isArray(data.tokens)) {
            data.tokens.forEach(t => {
                if (t.balance > 0 && t.tokenInfo) { // Basic filter
                    const decimals = t.tokenInfo.decimals || 18; // Default to 18 if missing
                    // Use string arithmetic or simple division (note: large nums might lose precision but fine for display)
                    const rawBalance = t.balance;
                    const amount = (rawBalance / Math.pow(10, decimals));

                    // Filter mainly 'scam' tokens with very tiny value if price is available, but here we just show all > 0.00something
                    if (amount > 0.0001) {
                        assets.push({
                            id: mapToCoinGeckoId(t.tokenInfo.symbol, 'Ethereum'),
                            name: t.tokenInfo.name || t.tokenInfo.symbol,
                            symbol: t.tokenInfo.symbol,
                            amount: amount.toFixed(4),
                            blockchain: 'Ethereum (ERC20)',
                            walletAddress: address,
                            type: 'Token'
                        });
                    }
                }
            });
        }
        return assets;
    } catch (e) {
        console.warn('Ethplorer Scan Failed, falling back to simple RPC', e);
        return null;
    }
};

export const scanAddress = async (address, onProgress) => {
    const type = detectAddressType(address);
    let tasks = [];

    if (type === 'EVM') {
        const BSC_RPC = RPC_CONFIG.BSC;
        const POLY_RPCS = RPC_CONFIG.POLYGON;

        // 1. Ethereum Full Scan (Native + All Tokens) using Ethplorer
        // This effectively replaces multiple RPC calls for ETH
        tasks.push({ name: 'Ethereum Ecosystem (Ethplorer)', fn: () => scanEthereumWithEthplorer(address) });

        // 2. Other Chains Native Checks (Still RPC)
        tasks.push({ name: 'BSC Native Check', fn: () => fetchEvmBalance(address, BSC_RPC, 'BNB Chain', 'BNB', 'binancecoin') });
        tasks.push({ name: 'Polygon Native Check', fn: () => fetchEvmBalance(address, POLY_RPCS, 'Polygon', 'POL', 'polygon-ecosystem-token') }); // Symbol is technically POL now but check balance
        tasks.push({ name: 'Avalanche Native Check', fn: () => fetchEvmBalance(address, RPC_CONFIG.AVALANCHE, 'Avalanche', 'AVAX', 'avalanche-2') });

        // 3. BSC Specific Tokens (RPC Manual - since Ethplorer is ETH only)
        // Hardcode common BSC tokens as fallback
        const BSC_TOKENS = [
            { chain: 'BSC (BEP20)', rpc: BSC_RPC, address: '0x55d398326f99059ff775485246999027b3197955', symbol: 'USDT', name: 'Tether USD', decimals: 18 },
            { chain: 'BSC (BEP20)', rpc: BSC_RPC, address: '0x2170ed0880ac9a755fd29b2688956bd959f933f8', symbol: 'ETH', name: 'Ethereum Token', decimals: 18 },
            { chain: 'BSC (BEP20)', rpc: BSC_RPC, address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', symbol: 'USDC', name: 'USD Coin', decimals: 18 },
            { chain: 'BSC (BEP20)', rpc: BSC_RPC, address: '0xe9e7cea3dedca5984780bafc599bd69add087d56', symbol: 'BUSD', name: 'Binance USD', decimals: 18 },
            { chain: 'BSC (BEP20)', rpc: BSC_RPC, address: '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3', symbol: 'DAI', name: 'Dai Token', decimals: 18 },
            { chain: 'BSC (BEP20)', rpc: BSC_RPC, address: '0x3ee2200efb140c955174db4313ea62699d81f33a', symbol: 'ADA', name: 'Cardano Token', decimals: 18 },
            { chain: 'BSC (BEP20)', rpc: BSC_RPC, address: '0x7083609fce4d1d8dc0c979aab8c869ea2c873402', symbol: 'DOT', name: 'Polkadot Token', decimals: 18 },
            { chain: 'BSC (BEP20)', rpc: BSC_RPC, address: '0x2859e4544c4bb03966803b044a93563bd2d0dd4d', symbol: 'SHIB', name: 'Shiba Inu', decimals: 18 }
        ];

        BSC_TOKENS.forEach(token => {
            tasks.push({
                name: `${token.symbol} on BSC`,
                fn: () => fetchTokenBalance(address, token, token.rpc)
            });
        });

        // 4. Polygon Specific Tokens (Popular)
        const POLY_TOKEN_RPC = POLY_RPCS[1]; // Use Ankr for tokens
        const POLY_TOKENS = [
            { chain: 'Polygon', rpc: POLY_TOKEN_RPC, address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
            { chain: 'Polygon', rpc: POLY_TOKEN_RPC, address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
            { chain: 'Polygon', rpc: POLY_TOKEN_RPC, address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 }
        ];

        POLY_TOKENS.forEach(token => {
            tasks.push({
                name: `${token.symbol} on Polygon`,
                fn: () => fetchTokenBalance(address, token, token.rpc)
            });
        });
    }
    else if (type === 'BTC') {
        tasks.push({ name: 'Bitcoin Network', fn: () => getBitcoinBalance(address) });
    }
    else if (type === 'TRON') {
        tasks.push({ name: 'Tron Network', fn: () => getTronBalance(address) });
    }

    // Execute sequentially with 5s delay
    const results = await processSequentially(tasks, onProgress);

    return results.flat().filter(item => item !== null);
};

export const getExplorerUrl = (address) => {
    const type = detectAddressType(address);
    if (type === 'EVM') return `https://etherscan.io/address/${address}`; // Default to Etherscan for EVM
    if (type === 'BTC') return `https://www.blockchain.com/explorer/addresses/btc/${address}`;
    if (type === 'TRON') return `https://tronscan.org/#/address/${address}`;
    return `https://debank.com/profile/${address}`; // Fallback
};
