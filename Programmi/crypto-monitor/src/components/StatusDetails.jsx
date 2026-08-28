import React, { useMemo, useState } from 'react';
import { ArrowLeft, Wallet, Calendar, User, FileText, PlusCircle, Edit2, Trash2, Check, X, RotateCcw, Printer } from 'lucide-react';
import { formatCurrency, formatCrypto } from '../utils/formatting';
import { exportStatusToPDF } from '../utils/pdfExport';
import AddAssetForm from './AddAssetForm';

export default function StatusDetails({ status, assets, onBack, currency, onAdd, onUpdateAddress, userRole, onRemoveHolding, onUpdateHolding }) {
    const isConfiscated = status === 'confiscated';
    const isFrozen = status === 'freezing';

    const title = isConfiscated ? 'Asset Confiscati' : (isFrozen ? 'USDT Freezati' : 'Asset Dissequestrati');
    const accentColor = isConfiscated ? '#10b981' : (isFrozen ? '#06b6d4' : '#ef4444'); // Emerald, Cyan, or Red

    const filteredItems = useMemo(() => {
        const items = [];
        assets.forEach(asset => {
            if (!asset.holdings) return;
            asset.holdings.forEach(h => {
                if (h.status === status) {
                    let value = 0;
                    if (h.historicFiatValueEur) {
                        const rateMultiplier = currency === 'usd' ? (asset.currentPrice / asset.rawEurPrice) : 1;
                        value = h.historicFiatValueEur * rateMultiplier;
                    } else {
                        value = parseFloat(h.amount) * asset.currentPrice;
                    }

                    items.push({
                        ...h,
                        assetId: asset.id,
                        assetName: asset.name,
                        assetSymbol: asset.symbol,
                        assetImage: asset.image,
                        currentPrice: asset.currentPrice,
                        value: value,
                        isHistoric: !!h.historicFiatValueEur
                    });
                }
            });
        });
        return items.sort((a, b) => b.value - a.value);
    }, [assets, status]);

    const totalValue = filteredItems.reduce((sum, item) => sum + item.value, 0);

    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    const startEdit = (item) => {
        setEditingId(item.id);
        setEditForm({ ...item, statusDate: item.statusDate || item.date });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({});
    };

    const saveEdit = () => {
        if (!editForm.amount || parseFloat(editForm.amount) < 0) {
            alert('Inserisci una quantità valida');
            return;
        }
        
        const isDateChanged = editForm.statusDate !== (filteredItems.find(i => i.id === editingId)?.statusDate || filteredItems.find(i => i.id === editingId)?.date);
        
        onUpdateHolding(editForm.assetId, editForm.id, {
            ...editForm,
            statusDate: isDateChanged ? new Date(editForm.statusDate).toISOString() : editForm.statusDate,
        });

        setEditingId(null);
        setEditForm({});
    };

    const handleChange = (field, value) => {
        setEditForm(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="status-details-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem', padding: '1rem', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                    <button
                        onClick={onBack}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
                    >
                        <ArrowLeft size={18} />
                        Indietro
                    </button>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', color: accentColor }}>{title}</h2>
                        <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)' }}>
                            Totale: <strong style={{ color: 'var(--text-main)', fontSize: '1.1rem' }}>{formatCurrency(totalValue, currency)}</strong>
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
                        onClick={() => exportStatusToPDF(filteredItems, totalValue, title, currency)}
                        title="Stampa Report PDF"
                    >
                        <Printer size={18} />
                        Stampa Report
                    </button>
                    <AddAssetForm
                        onAdd={onAdd}
                        onUpdateAddress={onUpdateAddress}
                        existingAssets={assets}
                        isInternalMode={true}
                        defaultStatus={status}
                        triggerComponent={
                            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
                                <PlusCircle size={18} />
                                Aggiungi Asset
                            </button>
                        }
                    />
                </div>
            </div>

            {/* List View */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                {filteredItems.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', opacity: 0.7 }}>
                        <Wallet size={48} style={{ marginBottom: '1rem' }} />
                        <p>Nessun asset {isConfiscated ? 'confiscato' : (isFrozen ? 'freezato' : 'dissequestrato')} trovato.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {filteredItems.map((item, idx) => {
                            const isEditing = editingId === item.id;

                            if (isEditing) {
                                return (
                                    <div key={`edit-${item.id}`} className="glass-panel" style={{
                                        padding: '1.5rem',
                                        borderLeft: `4px solid ${accentColor}`,
                                        background: 'var(--bg-app)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '1rem'
                                    }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Quantità</label>
                                                <input type="number" step="any" value={editForm.amount || ''} onChange={e => handleChange('amount', e.target.value)} className="input-field" style={{ width: '100%', padding: '0.5rem' }} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Parte Offesa</label>
                                                <input type="text" value={editForm.injuredPartyName || ''} onChange={e => handleChange('injuredPartyName', e.target.value)} className="input-field" style={{ width: '100%', padding: '0.5rem' }} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Indagato</label>
                                                <input type="text" value={editForm.suspectName || ''} onChange={e => handleChange('suspectName', e.target.value)} className="input-field" style={{ width: '100%', padding: '0.5rem' }} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Procedimento</label>
                                                <input type="text" value={editForm.proceeding || editForm.legalProceeding || ''} onChange={e => handleChange('proceeding', e.target.value)} className="input-field" style={{ width: '100%', padding: '0.5rem' }} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Data {isConfiscated ? 'Confisca' : (isFrozen ? 'Freezing' : 'Dissequestro')}</label>
                                                <input type="date" value={editForm.statusDate ? new Date(editForm.statusDate).toISOString().split('T')[0] : ''} onChange={e => handleChange('statusDate', e.target.value)} className="input-field" style={{ width: '100%', padding: '0.5rem' }} />
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                            <button className="btn-primary" onClick={saveEdit} style={{ background: '#22c55e', borderColor: '#22c55e', padding: '6px 12px' }}>
                                                <Check size={16} style={{ marginRight: '6px' }} /> Salva
                                            </button>
                                            <button className="btn-secondary" onClick={cancelEdit} style={{ padding: '6px 12px' }}>
                                                <X size={16} style={{ marginRight: '6px' }} /> Annulla
                                            </button>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div key={idx} className="glass-panel" style={{
                                    padding: '1rem',
                                    borderLeft: `4px solid ${accentColor}`,
                                    display: 'grid',
                                    gridTemplateColumns: (userRole === 'admin' || userRole === 'user') ? 'minmax(200px, 1.5fr) 2fr 1fr auto' : 'minmax(200px, 1.5fr) 2fr 1fr',
                                    alignItems: 'center',
                                    gap: '1.5rem'
                                }}>
                                {/* Column 1: Asset Info */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    {item.assetImage ? (
                                        <img src={item.assetImage} alt={item.assetName} style={{ width: 40, height: 40, borderRadius: '50%' }} />
                                    ) : (
                                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', fontWeight: 700 }}>
                                            {item.assetSymbol.substring(0, 1).toUpperCase()}
                                        </div>
                                    )}
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>{item.assetName}</div>
                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{formatCrypto(item.amount, item.assetSymbol)} {item.assetSymbol.toUpperCase()}</div>
                                        <div style={{ fontWeight: 700, color: 'var(--primary)', marginTop: '4px' }}>
                                            {formatCurrency(item.value, currency)}
                                            {item.isHistoric && (
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '6px' }}>(Storico)</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Column 2: Legal Details (Grid for better alignment) */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>

                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                        <User size={14} style={{ marginTop: 2, color: 'var(--text-muted)' }} />
                                        <div style={{ overflow: 'hidden' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Parte Offesa</div>
                                            <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.injuredPartyName}>
                                                {item.injuredPartyName || 'N/D'}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                        <User size={14} style={{ marginTop: 2, color: 'var(--text-muted)' }} />
                                        <div style={{ overflow: 'hidden' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Indagato</div>
                                            <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.suspectName}>
                                                {item.suspectName || 'N/D'}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                        <FileText size={14} style={{ marginTop: 2, color: 'var(--text-muted)' }} />
                                        <div style={{ overflow: 'hidden' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Procedimento</div>
                                            <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.proceeding}>
                                                {item.proceeding || 'N/D'}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                        <Wallet size={14} style={{ marginTop: 2, color: 'var(--text-muted)' }} />
                                        <div style={{ overflow: 'hidden', width: '100%' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Indirizzo Wallet</div>
                                            <div style={{
                                                fontFamily: 'monospace',
                                                background: 'var(--bg-app)',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontSize: '0.8rem',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                maxWidth: '100%'
                                            }} title={item.walletAddress}>
                                                {item.walletAddress || 'Indirizzo non disponibile'}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Column 3: Date & Status */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: '0.5rem' }}>
                                    {item.date && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            <Calendar size={14} />
                                            <span>{new Date(item.date).toLocaleDateString()}</span>
                                        </div>
                                    )}
                                    <div style={{
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        background: isConfiscated ? 'rgba(16, 185, 129, 0.15)' : (isFrozen ? 'rgba(6, 182, 212, 0.15)' : 'rgba(239, 68, 68, 0.15)'),
                                        color: accentColor,
                                        border: `1px solid ${accentColor}40`
                                    }}>
                                        {isConfiscated ? 'CONFISCATO' : (isFrozen ? 'FREEZATO' : 'DISSEQUESTRATO')}
                                    </div>
                                </div>

                                {/* Column 4: Actions */}
                                {(userRole === 'admin' || userRole === 'user') && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '1rem', marginLeft: '0.5rem' }}>
                                        <button
                                            className="btn-secondary"
                                            style={{ padding: '6px', width: '100%', display: 'flex', justifyContent: 'center' }}
                                            onClick={() => startEdit(item)}
                                            title="Modifica"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            className="btn-secondary"
                                            style={{ padding: '6px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)', width: '100%', display: 'flex', justifyContent: 'center' }}
                                            onClick={() => {
                                                if (confirm(`Sei sicuro di voler rimuovere questo asset dai ${title}?`)) {
                                                    onRemoveHolding(item.assetId, item.id);
                                                }
                                            }}
                                            title="Elimina"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )})}
                    </div>
                )}
            </div>

            <style>{`
                @media (max-width: 900px) {
                    .status-details-root .glass-panel {
                        grid-template-columns: 1fr !important;
                        gap: 1rem !important;
                    }
                    .status-details-root .glass-panel > div:nth-child(3) {
                        align-items: flex-start !important;
                        flex-direction: row !important;
                        justify-content: space-between !important;
                        width: 100%;
                        border-top: 1px solid var(--border-color);
                        padding-top: 1rem;
                    }
                }
            `}</style>
        </div>
    );
}
