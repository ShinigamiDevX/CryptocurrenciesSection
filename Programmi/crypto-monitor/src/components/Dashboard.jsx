import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatCompactNumber } from '../utils/formatting';
import AssetCard from './AssetCard';
import SearchResultCard from './SearchResultCard';
import AddAssetForm from './AddAssetForm';
import AssetDetails from './AssetDetails';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { Wallet, TrendingUp, AlertCircle, History, Search, RefreshCw, X, Gavel, FileText } from 'lucide-react';
import { exportAssetsToPDF } from '../utils/pdfExport';
import { useToast } from '../context/ToastContext';

import StatusDetails from './StatusDetails';
import styles from './Dashboard.module.css';
import { useAssetStore } from '../store/useAssetStore';

export default function Dashboard({
    currency = 'eur',
    assets,
    totalValue,
    totalConfiscated,
    totalReleased,
    totalFrozen,
    isLoading,
    lastUpdated,
    error,
    addAsset,
    removeHolding,
    updateHolding,
    updateAddressMetadata,
    setManualPrice,
    refreshNow,
    userRole,
    isExporting,
    apiError,
    removeAsset
}) {
    const toast = useToast();
    const [selectedAssetId, setSelectedAssetId] = useState(null);
    const [selectedStatus, setSelectedStatus] = useState(null);
    const [monthlyData, setMonthlyData] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showBlockchainModal, setShowBlockchainModal] = useState(false);

    // Generate suggestions for autocomplete
    const searchSuggestions = useMemo(() => {
        const suggestions = new Set();
        assets.forEach(asset => {
            suggestions.add(asset.name);
            if (asset.symbol) suggestions.add(asset.symbol.toUpperCase());

            if (asset.holdings) {
                asset.holdings.forEach(holding => {
                    if (holding.suspectName) suggestions.add(holding.suspectName);
                    if (holding.injuredPartyName) suggestions.add(holding.injuredPartyName);
                    if (holding.walletAddress) suggestions.add(holding.walletAddress);
                    if (holding.proceeding) suggestions.add(holding.proceeding);
                    if (holding.legalProceeding) suggestions.add(holding.legalProceeding);
                });
            }
        });
        return Array.from(suggestions);
    }, [assets]);

    const normalizeBlockchainName = (name) => {
        if (!name) return name;
        const lower = name.toLowerCase().trim();
        if (lower.includes('bitcoin')) return 'Bitcoin';
        if (lower.includes('ethereum') || lower.includes('erc20')) return 'Ethereum';
        if (lower.includes('bsc') || lower.includes('bnb') || lower.includes('bep20')) return 'Binance Smart Chain (BSC)';
        if (lower.includes('tron') || lower.includes('trc20')) return 'Tron';
        if (lower.includes('polygon') || lower.includes('matic')) return 'Polygon';
        if (lower.includes('avalanche') || lower.includes('avax')) return 'Avalanche';
        if (lower.includes('solana') || lower.includes('sol')) return 'Solana';
        if (lower.includes('litecoin') || lower.includes('ltc')) return 'Litecoin';
        if (lower.includes('monero') || lower.includes('xmr')) return 'Monero';
        // Capitalize first letter of unknown network
        return name.charAt(0).toUpperCase() + name.slice(1);
    };

    const uniqueBlockchains = useMemo(() => {
        const blockchains = new Set();
        assets.forEach(asset => {
            if (asset.holdings) {
                asset.holdings.forEach(h => {
                    if (h.blockchain) {
                        blockchains.add(normalizeBlockchainName(h.blockchain));
                    }
                });
            }
        });
        return Array.from(blockchains).sort(); // Convert to array, sort and return
    }, [assets]);

    const filteredAssets = useMemo(() => {
        let result = assets;
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = assets.map(asset => {
                if (asset.name.toLowerCase().includes(lower) || asset.symbol.toLowerCase().includes(lower)) {
                    return asset;
                }
                const matchedHoldings = asset.holdings.filter(h =>
                    (h.walletAddress && h.walletAddress.toLowerCase().includes(lower)) ||
                    (h.suspectName && h.suspectName.toLowerCase().includes(lower)) ||
                    (h.injuredPartyName && h.injuredPartyName.toLowerCase().includes(lower)) ||
                    (h.label && h.label.toLowerCase().includes(lower)) ||
                    (h.proceeding && h.proceeding.toLowerCase().includes(lower)) ||
                    (h.legalProceeding && h.legalProceeding.toLowerCase().includes(lower))
                );
                return { ...asset, holdings: matchedHoldings };
            }).filter(asset => asset.holdings.length > 0);
        }
        // Sort by totalValue (numeric descending)
        return [...result]
            .filter(asset => {
                // When not searching, hide assets that have no active holdings
                if (!searchTerm) {
                    const hasActiveHoldings = asset.holdings.some(h => !h.status || h.status === 'active');
                    if (!hasActiveHoldings && asset.totalValue === 0) return false;
                }
                return true;
            })
            .sort((a, b) => {
                const valA = Number(a.totalValue) || 0;
                const valB = Number(b.totalValue) || 0;
                return valB - valA;
            });
    }, [assets, searchTerm]);
    const parseDate = (dateStr) => {
        if (!dateStr) return null;
        const unified = typeof dateStr === 'string' ? dateStr.replace(/-/g, '/') : '';
        if (unified.includes('/')) {
            const parts = unified.split('/');
            if (parts.length === 3) {
                if (parts[0].length === 4) {
                    // YYYY/MM/DD - fallback
                } else {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10);
                    const year = parseInt(parts[2], 10);
                    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                        const d = new Date(year, month - 1, day);
                        if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
                            return d;
                        }
                    }
                }
            }
        }
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d;
        return null;
    };

    // API error notification removed per user request

    // Add historicalPrices to Dashboard props
    const historicalPrices = useAssetStore(state => state.historicalPrices);

    useEffect(() => {
        const generateMonthlyReport = async () => {
            if (assets.length === 0) {
                setMonthlyData([]);
                return;
            }

            setLoadingHistory(true);
            const today = new Date();
            const reportData = [];

            for (let i = 5; i >= 0; i--) {
                let d;
                const isCurrentMonth = (i === 0);

                if (isCurrentMonth) {
                    d = new Date(today);
                } else {
                    d = new Date(today.getFullYear(), today.getMonth() - i, 1);
                    d.setHours(0, 0, 0, 0);
                }

                const label = d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
                const monthEntry = { name: label, fullDate: d };
                const isFuture = d > new Date();

                let relevantAssets = [];
                let monthTotal = 0;

                // Helper to get price for a specific month
                const getPriceForMonth = (assetId, targetDate, fallbackPrice) => {
                    if (isCurrentMonth) return fallbackPrice; // Current month uses real-time live price

                    const yearMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
                    const customPrice = historicalPrices?.find(hp => hp.assetId === assetId && hp.date === yearMonth);

                    if (customPrice) {
                        return currency === 'usd' ? customPrice.priceUsd : customPrice.priceEur;
                    }

                    // Fallback to current price if no historic data is available yet to avoid 0 flatline
                    return fallbackPrice;
                };

                if (!isFuture) {
                    relevantAssets = assets.filter(asset =>
                        asset.holdings && asset.holdings.some(h => {
                            if (h.status && h.status !== 'active') {
                                if (h.statusDate) {
                                    const sDate = new Date(h.statusDate);
                                    const sMonthCode = sDate.getFullYear() * 12 + sDate.getMonth();
                                    const colMonthCode = d.getFullYear() * 12 + d.getMonth();
                                    if (colMonthCode > sMonthCode) return false;
                                } else {
                                    return false;
                                }
                            }
                            const hDate = parseDate(h.date);
                            if (!hDate) return true;
                            if (hDate) hDate.setHours(0, 0, 0, 0);
                            if (isCurrentMonth) {
                                const isSameMonth = hDate.getMonth() === d.getMonth() && hDate.getFullYear() === d.getFullYear();
                                return hDate <= d || isSameMonth;
                            }
                            return hDate <= d;
                        })
                    );

                    for (const asset of relevantAssets) {
                        const validHoldings = asset.holdings.filter(h => {
                            if (h.status && h.status !== 'active') {
                                if (h.statusDate) {
                                    const sDate = new Date(h.statusDate);
                                    const sMonthCode = sDate.getFullYear() * 12 + sDate.getMonth();
                                    const colMonthCode = d.getFullYear() * 12 + d.getMonth();
                                    if (colMonthCode > sMonthCode) return false;
                                } else {
                                    return false;
                                }
                            }
                            const hDate = parseDate(h.date);
                            if (!hDate) return true;
                            if (isCurrentMonth) {
                                const isSameMonth = hDate.getMonth() === d.getMonth() && hDate.getFullYear() === d.getFullYear();
                                return hDate <= d || isSameMonth;
                            } else {
                                hDate.setHours(0, 0, 0, 0);
                                return hDate <= d;
                            }
                        });

                        const quantity = validHoldings.reduce((sum, h) => sum + parseFloat(h.amount), 0);
                        if (quantity > 0) {
                            try {
                                const price = getPriceForMonth(asset.id, d, asset.currentPrice);
                                monthTotal += quantity * price;
                                monthEntry[asset.symbol] = quantity * price; // Salva la fetta di asset per la barra stacked
                            } catch (err) { /* empty */ }
                        }
                    }
                }

                monthEntry.total = monthTotal;
                reportData.push(monthEntry);
            }

            setMonthlyData(reportData);
            setLoadingHistory(false);
        };

        generateMonthlyReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        assets.length,
        currency,
        lastUpdated,
        historicalPrices,
        JSON.stringify(assets.map(a => a.holdings.map(h => h.date + h.amount)))
    ]);

    if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Caricamento monitoraggio...</div>;

    // View Navigation Logic
    if (selectedStatus) {
        return (
            <StatusDetails
                status={selectedStatus}
                assets={assets}
                onBack={() => setSelectedStatus(null)}
                currency={currency}
                onAdd={addAsset}
                onUpdateAddress={updateAddressMetadata}
                userRole={userRole}
                onRemoveHolding={removeHolding}
                onUpdateHolding={updateHolding}
            />
        );
    }

    if (selectedAssetId) {
        const selectedAsset = assets.find(a => a.id === selectedAssetId);
        if (!selectedAsset) {
            setSelectedAssetId(null);
            return null;
        }

        return (
            <AssetDetails
                asset={selectedAsset}
                onBack={() => setSelectedAssetId(null)}
                onRemoveHolding={removeHolding}
                onRemoveAsset={(id) => {
                    removeAsset(id);
                    setSelectedAssetId(null);
                }}
                onUpdateHolding={updateHolding}
                onManualPriceUpdate={setManualPrice}
                onAddHolding={addAsset}
                currency={currency}
                userRole={userRole}
            />
        );
    }

    const chartData = assets.filter(a => a.totalValue > 0).sort((a, b) => b.totalValue - a.totalValue).map((a, index) => ({
        name: a.name,
        value: a.totalValue,
        quantity: a.amount,
        symbol: a.symbol.toUpperCase(),
        color: getAssetColor(a.symbol, index)
    }));

    const renderCustomizedLabel = (props) => {
        const { cx, cy, midAngle, outerRadius, percent, index } = props;
        if (percent < 0.01) return null;
        const RADIAN = Math.PI / 180;
        const sin = Math.sin(-midAngle * RADIAN);
        const cos = Math.cos(-midAngle * RADIAN);
        const baseRadius = outerRadius + 20;
        const sx = cx + (outerRadius + 2) * cos;
        const sy = cy + (outerRadius + 2) * sin;
        const mx = cx + baseRadius * cos;
        const my = cy + baseRadius * sin;
        const ex = mx + (cos >= 0 ? 1 : -1) * 20;
        const ey = my;
        const textAnchor = cos >= 0 ? 'start' : 'end';
        const asset = chartData[index];

        return (
            <g>
                <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={asset.color} fill="none" strokeWidth={1} />
                <circle cx={ex} cy={ey} r={2} fill={asset.color} stroke="none" />
                <text x={ex + (cos >= 0 ? 1 : -1) * 8} y={ey} textAnchor={textAnchor} fill="var(--text-main)" dominantBaseline="central" fontSize={isExporting ? 12 : 11} fontWeight={600}>
                    {asset.symbol} ({((percent) * 100).toFixed(1)}%)
                </text>
            </g>
        );
    };

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className={styles.tooltipCard}>
                    <p className={styles.tooltipTitle}>{data.name}</p>
                    <p className={styles.tooltipValue}>{formatCurrency(data.value)}</p>
                    <p className={styles.tooltipPercent}>{((data.value / totalValue) * 100).toFixed(2)}% del totale</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div id="dashboard-export-node" style={{ backgroundColor: 'var(--bg-app)', height: '100%', boxSizing: 'border-box' }}>
            <div className={`${styles.dashboardGrid} ${isExporting ? styles.isExporting : ''}`}>

                {/* LEFT COLUMN: Overview & Stats (Scrollable if needed, or fixed) */}
                <div className={styles.leftColumn}>

                    {/* Total Value Card - Compact Version */}
                    <div className={`glass-panel ${styles.totalValueCard}`}>
                        <h2 className={styles.totalValueLabel}>
                            Valore Totale Sequestrato
                        </h2>
                        <div className={`${styles.totalValueAmount} neon-text-primary`}>
                            {formatCurrency(totalValue, currency)}
                        </div>
                    </div>

                    {/* Confiscated / Released Summary (Clickable) */}
                    <div className={styles.statsGrid}>
                        <div
                            className={`glass-panel hover-card ${styles.statusCard} ${styles.statusCardConfiscated}`}
                            onClick={() => setSelectedStatus('confiscated')}
                        >
                            <h3 className={styles.statusCardLabel}>CONFISCATO</h3>
                            <p className={`${styles.statusCardAmount} ${styles.amountConfiscated}`}>
                                {formatCurrency(totalConfiscated, currency)}
                            </p>
                        </div>
                        <div
                            className={`glass-panel hover-card ${styles.statusCard} ${styles.statusCardReleased}`}
                            onClick={() => setSelectedStatus('released')}
                        >
                            <h3 className={styles.statusCardLabel}>DISSEQUESTRATO</h3>
                            <p className={`${styles.statusCardAmount} ${styles.amountReleased}`}>
                                {formatCurrency(totalReleased, currency)}
                            </p>
                        </div>
                        <div
                            className={`glass-panel hover-card ${styles.statusCard} ${styles.statusCardFrozen}`}
                            onClick={() => setSelectedStatus('freezing')}
                        >
                            <h3 className={styles.statusCardLabel}>USDT FREEZATI</h3>
                            <p className={`${styles.statusCardAmount} ${styles.amountFrozen}`}>
                                {formatCurrency(totalFrozen, currency)}
                            </p>
                        </div>
                    </div>

                    {/* Chart & Stats Row */}
                    <div className={styles.chartsRow}>

                        {/* Pie Chart */}
                        <div className={`glass-panel ${styles.pieChartPanel}`}>

                            {/* Chart (Left) */}
                            <div id="pie-chart-export" className={styles.pieChartContainer}>
                                {totalValue > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                                        <PieChart>
                                            <Pie
                                                data={chartData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius="40%"
                                                outerRadius={isExporting ? "60%" : "75%"}
                                                fill="#8884d8"
                                                dataKey="value"
                                                paddingAngle={0}
                                                cornerRadius={0}
                                                label={renderCustomizedLabel}
                                                labelLine={false}
                                            >
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<CustomTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className={styles.emptyChart}>
                                        Nessun dato
                                    </div>
                                )}
                            </div>

                            {/* Legend (Right) */}
                            <div className={styles.legendGrid}>
                                {chartData.map(item => (
                                    <div key={item.name} className={styles.legendItem}>
                                        <div className={styles.legendItemInner}>
                                            <div className={styles.legendDot} style={{ background: item.color }}></div>
                                            <span className={styles.legendSymbol}>{item.symbol.toUpperCase()}</span>
                                        </div>
                                        <span className={styles.legendPercent}>{((item.value / totalValue) * 100).toFixed(1)}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Stats Summary Card */}
                        {/* Stats Summary Column */}
                    </div>

                    {/* History Chart */}

                    <div className={`glass-panel ${styles.historyChartPanel}`}>
                        <div className={styles.historyHeader}>
                            <History size={16} color="var(--text-muted)" />
                            <span className={styles.historyTitle}>Andamento Wallet</span>
                        </div>
                        <div id="history-chart-export" className={styles.historyChartContainer}>
                            {loadingHistory ? (
                                <div className={styles.loadingHistory}>
                                    <TrendingUp size={16} style={{ marginRight: 8 }} className="spin-slow" /> Calcolo report con dati storici...
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={monthlyData}
                                        margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                                        barCategoryGap={isExporting ? "5%" : "15%"}
                                        barGap={isExporting ? 1 : 0}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            stroke="var(--text-muted)"
                                            fontSize={isExporting ? 14 : 10}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <YAxis
                                            stroke="var(--text-muted)"
                                            fontSize={isExporting ? 14 : 10}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(value) => formatCompactNumber(value)}
                                            width={isExporting ? 60 : 40}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            content={({ active, payload, label }) => {
                                                if (active && payload && payload.length) {
                                                    return (
                                                        <div className={styles.tooltipCard}>
                                                            <p className={styles.tooltipHistoryDate}>{label}</p>
                                                            <p className={styles.tooltipHistoryTotal}>
                                                                {formatCurrency(payload[0].payload.total, currency)}
                                                            </p>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        <Legend
                                            iconType="circle"
                                            wrapperStyle={{
                                                fontSize: isExporting ? '14px' : '10px',
                                                paddingTop: '15px',
                                                width: '100%',
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                justifyContent: 'center',
                                                gap: '10px'
                                            }}
                                        />

                                        {/* Stacked Bars for each Asset */}
                                        {assets.map((asset, index) => (
                                            <Bar
                                                key={asset.id}
                                                dataKey={asset.symbol}
                                                name={asset.symbol.toUpperCase()}
                                                stackId="a"
                                                fill={getAssetColor(asset.symbol, index)}
                                                barSize={isExporting ? 80 : 60} // Much larger if exporting
                                                radius={index === assets.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                            />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className={styles.errorMessage}>
                            <AlertCircle size={20} />
                            {error}
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: Asset List (Scrollable) */}
                <div className={styles.rightColumn}>
                    <div className={styles.searchHeader}>
                        <h3 className={styles.searchTitle}>Lista Asset Sequestrati</h3>

                        {/* Search Bar & Refresh */}
                        <div className={styles.searchBarContainer}>
                            <div className={styles.searchInputWrapper}>
                                <Search className={styles.searchIcon} size={16} />
                                <input
                                    type="text"
                                    list="search-suggestions"
                                    placeholder="Cerca per indirizzo, indagato o procedimento..."
                                    className={`input-field ${styles.searchInput}`}
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    autoComplete="off"
                                    name="crypto-dashboard-search"
                                />
                                <datalist id="search-suggestions">
                                    {searchTerm.length >= 2 && searchSuggestions
                                        .filter(item => item.toLowerCase().includes(searchTerm.toLowerCase()))
                                        .slice(0, 10)
                                        .map((item, index) => (
                                            <option key={index} value={item} />
                                        ))}
                                </datalist>

                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className={styles.clearSearch}
                                        title="Cancella ricerca"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            <button
                                className={`btn-primary ${styles.exportButton}`}
                                onClick={() => {
                                    const filteredTotalValue = filteredAssets.reduce((sum, asset) => {
                                        // Calcola il valore solo degli holding effettivamente filtrati
                                        const assetHoldingsValue = asset.holdings.reduce((hSum, h) => {
                                            return hSum + (parseFloat(h.amount) * (asset.currentPrice || 0));
                                        }, 0);
                                        return sum + assetHoldingsValue;
                                    }, 0);
                                    exportAssetsToPDF(filteredAssets, filteredTotalValue, currency);
                                }}
                                title="Esporta in PDF"
                            >
                                <FileText size={18} />
                            </button>
                            <button
                                className={`btn-secondary ${styles.refreshButton}`}
                                onClick={refreshNow}
                                title="Aggiorna dati prezzi"
                                disabled={isLoading}
                            >
                                <RefreshCw size={18} className={isLoading ? 'spin' : ''} />
                            </button>
                        </div>

                        {/* Stats Summary Cards (Moved to Right Column) */}
                        <div className={styles.statsColumn} style={{ flex: '0 0 auto', flexDirection: 'row', width: '100%', marginTop: '1.5rem', marginBottom: '1rem' }}>
                            <div className={`glass-panel ${styles.statsCardSmall}`} style={{ flex: 1, padding: '1rem', background: 'rgba(37, 99, 235, 0.05)' }}>
                                <div className={styles.statsCount}>{assets.filter(a => a.totalValue > 0).length}</div>
                                <div className={styles.statsLabel}>Asset Sequestrati</div>
                            </div>
                            <div
                                className={`glass-panel hover-card ${styles.statsCardSmall}`}
                                style={{
                                    flex: 1,
                                    padding: '1rem',
                                    background: 'rgba(255, 255, 255, 0.02)',
                                    margin: '0 0.5rem',
                                    cursor: 'pointer',
                                    minWidth: '150px'
                                }}
                                onClick={() => uniqueBlockchains.length > 0 && setShowBlockchainModal(true)}
                                title="Clicca per visualizzare le blockchain"
                            >
                                <div className={styles.statsCount}>{uniqueBlockchains.length}</div>
                                <div className={styles.statsLabel}>Blockchain Individuate</div>
                            </div>
                            <div className={`glass-panel ${styles.statsCardSmall}`} style={{ flex: 1, padding: '1rem', background: 'rgba(255, 255, 255, 0.02)' }}>
                                <div className={styles.statsCount}>{assets.length}</div>
                                <div className={styles.statsLabel}>Asset Individuati</div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.assetGrid}>
                        {(userRole === 'admin' || userRole === 'user') && !searchTerm && (
                            <AddAssetForm
                                onAdd={addAsset}
                                existingAssets={assets}
                                onUpdateAddress={updateAddressMetadata}
                            />
                        )}

                        {filteredAssets.length > 0 ? (
                            searchTerm ? (
                                filteredAssets.flatMap(asset =>
                                    asset.holdings.map(holding => (
                                        <SearchResultCard
                                            key={`${asset.id}-${holding.id}`}
                                            asset={asset}
                                            holding={holding}
                                            onSelect={() => {
                                                if (holding.status && holding.status !== 'active') {
                                                    setSearchTerm('');
                                                    setSelectedStatus(holding.status);
                                                } else {
                                                    setSelectedAssetId(asset.id);
                                                }
                                            }}
                                            currency={currency}
                                        />
                                    ))
                                )
                            ) : (
                                filteredAssets.map(asset => (
                                    <AssetCard
                                        key={asset.id}
                                        asset={asset}
                                        onSelect={setSelectedAssetId}
                                        onRemove={removeAsset}
                                        currency={currency}
                                    />
                                ))
                            )
                        ) : (
                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                Nessun risultato trovato per "{searchTerm}"
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modale Blockchain */}
            {
                showBlockchainModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)',
                        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <div className="glass-panel" style={{
                            maxWidth: '500px', width: '90%', padding: '2rem',
                            borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)',
                            display: 'flex', flexDirection: 'column'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '1rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <TrendingUp size={20} color="var(--primary-color)" />
                                    Blockchain Sotto Monitoraggio
                                </h3>
                                <button onClick={() => setShowBlockchainModal(false)} className="icon-btn" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                {uniqueBlockchains.length === 0 ? (
                                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Nessuna blockchain individuata.</p>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
                                        {uniqueBlockchains.map((chain, index) => (
                                            <div key={index} style={{
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                padding: '0.75rem 1rem',
                                                borderRadius: '8px',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                fontSize: '0.9rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem'
                                            }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: COLORS[index % COLORS.length] }}></div>
                                                {chain}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ marginTop: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Totale reti attive: <strong>{uniqueBlockchains.length}</strong>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

const COLORS = [
    '#3b82f6', // Bright Blue
    '#ef4444', // Red
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#f97316', // Orange
    '#6366f1', // Indigo
    '#84cc16', // Lime
    '#14b8a6', // Teal
    '#d946ef'  // Fuchsia
];

const CRYSTO_COLORS_MAP = {
    'BTC': '#f97316',  // Orange
    'BNB': '#f59e0b',  // Yellow
    'ETH': '#06b6d4',  // Celeste
    'AVAX': '#ef4444', // Red
    'USDT': '#10b981', // Green
    'USDC': '#3b82f6'  // Blue
};

const getAssetColor = (symbol, index) => {
    const upperSymbol = symbol?.toUpperCase();
    if (CRYSTO_COLORS_MAP[upperSymbol]) {
        return CRYSTO_COLORS_MAP[upperSymbol];
    }
    return COLORS[index % COLORS.length];
};
