import React from 'react';
import { ChevronRight, Trash2 } from 'lucide-react';

import { formatCurrency, formatCrypto } from '../utils/formatting';

export default function AssetCard({ asset, onSelect, onRemove, currency = 'eur' }) {

    // Use values already calculated by useAssetMonitor hook (which handles active vs historic status)
    const displayAmount = asset.amount;
    const displayValue = asset.totalValue;

    return (
        <div
            className="glass-panel print-friendly-card"
            style={{
                padding: '1.5rem',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '200px'
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
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', maxWidth: '85%' }}>
                    {asset.image ? (
                        <img
                            src={asset.image}
                            alt={asset.name}
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                objectFit: 'cover'
                            }}
                        />
                    ) : (
                        <div style={{
                            width: 40,
                            height: 40,
                            minWidth: 40,
                            background: 'var(--bg-app)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1rem',
                            fontWeight: 700,
                            color: 'var(--text-main)',
                            border: '1px solid var(--border-color)'
                        }}>
                            {asset.symbol.substring(0, 1).toUpperCase()}
                        </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>{asset.name}</h3>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{asset.displayChain}</span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Sei sicuro di voler eliminare l'intero asset ${asset.name} e tutti i suoi sequestri?`)) {
                                onRemove(asset.id);
                            }
                        }}
                        className="btn-secondary"
                        style={{ padding: '6px', color: '#ef4444', border: 'none', background: 'transparent' }}
                        title="Elimina intero asset"
                    >
                        <Trash2 size={18} />
                    </button>
                    <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
                </div>
            </div>

            <div style={{ flexGrow: 1, minHeight: '0.5rem' }}></div>

            <div style={{ marginTop: 'auto' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Valore</span>
                        {asset.currentPrice === 0 && (
                            <span style={{ color: '#ef4444', fontWeight: 'bold' }} title="Prezzo mancante. Inserisci manualmente.">⚠️ Prezzo Mancante</span>
                        )}
                    </div>
                    <div style={{ fontSize: 'clamp(1.2rem, 1.5vw, 1.6rem)', fontWeight: 700, color: asset.currentPrice === 0 ? 'var(--text-muted)' : 'var(--primary)', lineHeight: 1.1 }} className={asset.currentPrice === 0 ? '' : 'neon-text-primary'}>
                        {formatCurrency(displayValue, currency)}
                    </div>
                </div>

                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid var(--border-color)'
                }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Quantità</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem' }}>
                        {formatCrypto(displayAmount)} {asset.symbol.toUpperCase()}
                    </span>
                </div>
            </div>
        </div>
    );
}
