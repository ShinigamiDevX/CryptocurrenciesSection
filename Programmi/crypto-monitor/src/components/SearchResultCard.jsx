import React from 'react';
import { User, Gavel, FileText, Wallet, ChevronRight } from 'lucide-react';
import { formatCurrency, formatCrypto } from '../utils/formatting';

export default function SearchResultCard({ asset, holding, onSelect, currency = 'eur' }) {
    // Calculate value for this specific holding
    const isHistoric = holding.status && holding.status !== 'active' && holding.historicFiatValueEur;

    let holdingValue = 0;
    if (isHistoric) {
        // historicFiatValueEur is always strictly in EUR, so we apply the conversion if selected currency is USD
        const rateMultiplier = currency === 'usd' ? (asset.currentPrice / asset.rawEurPrice) : 1;
        holdingValue = holding.historicFiatValueEur * rateMultiplier;
    } else {
        holdingValue = parseFloat(holding.amount) * (asset.currentPrice || 0);
    }

    return (
        <div
            className="glass-panel"
            style={{
                padding: '1.25rem',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '180px',
                borderLeft: '4px solid var(--primary)'
            }}
            onClick={() => onSelect(asset.id)}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
            }}
        >
            {/* Header: Asset Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                {asset.image ? (
                    <img
                        src={asset.image}
                        alt={asset.name}
                        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                    />
                ) : (
                    <div style={{
                        width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-app)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, border: '1px solid var(--border-color)'
                    }}>
                        {asset.symbol.substring(0, 1).toUpperCase()}
                    </div>
                )}
                <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{asset.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{asset.symbol.toUpperCase()}</div>
                </div>
                <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
            </div>

            {/* Body: Specific Holding Details */}
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(() => {
                    const suspect = holding.suspectName && holding.suspectName !== 'N/D' ? holding.suspectName : null;
                    const injured = holding.injuredPartyName && holding.injuredPartyName !== 'N/D' ? holding.injuredPartyName : null;
                    if (suspect && injured) {
                        return (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                    <User size={14} color="#06b6d4" />
                                    <span style={{ fontWeight: 500, color: '#06b6d4' }}>P.O.: {injured}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                    <User size={14} color="var(--primary)" />
                                    <span style={{ fontWeight: 500 }}>Ind.: {suspect}</span>
                                </div>
                            </>
                        );
                    } else if (injured) {
                        return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                <User size={14} color="#06b6d4" />
                                <span style={{ fontWeight: 500, color: '#06b6d4' }}>P.O.: {injured}</span>
                            </div>
                        );
                    } else if (suspect) {
                        return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                <User size={14} color="var(--primary)" />
                                <span style={{ fontWeight: 500 }}>{suspect}</span>
                            </div>
                        );
                    }
                    return null;
                })()}
                {holding.proceeding && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                        <Gavel size={14} color="var(--text-muted)" />
                        <span style={{ color: 'var(--text-muted)' }}>{holding.proceeding}</span>
                    </div>
                )}
                {/* Only show address if we have space or if it's the main info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 'auto' }}>
                    <Wallet size={14} />
                    <span style={{ fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {holding.walletAddress}
                    </span>
                </div>
            </div>

            {/* Footer: Value & Amount */}
            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {isHistoric ? 'Valore Storico' : 'Valore Attuale'}
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                            {formatCurrency(holdingValue, currency)}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Quantità</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                            {formatCrypto(holding.amount)} {asset.symbol.toUpperCase()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
