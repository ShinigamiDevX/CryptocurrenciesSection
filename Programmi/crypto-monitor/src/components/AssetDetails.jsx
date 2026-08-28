import React, { useState } from 'react';
import { ArrowLeft, Trash2, Edit2, Check, X, Gavel, Unlock, Snowflake, RotateCcw, Home, PlusCircle } from 'lucide-react';
import AddAssetForm from './AddAssetForm';
import { formatCurrency } from '../utils/formatting';

export default function AssetDetails({ asset, onBack, onRemoveHolding, onRemoveAsset, onUpdateHolding, onManualPriceUpdate, onAddHolding, currency = 'eur', userRole }) {
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [showHistory, setShowHistory] = useState(false);

    // Selection State
    const [selectedHoldings, setSelectedHoldings] = useState(new Set());

    // Manual Price State
    const [isEditingPrice, setIsEditingPrice] = useState(false);
    const [manualPriceInput, setManualPriceInput] = useState('');
    const [isAddFormOpen, setIsAddFormOpen] = useState(false);

    // Sorting State
    const [sortOrder, setSortOrder] = useState('desc'); // 'desc' | 'asc'

    if (!asset) return null;

    // Sort Holdings
    const sortedHoldings = React.useMemo(() => {
        if (!asset.holdings) return [];
        return [...asset.holdings]
            .filter(h => showHistory || (!h.status || h.status === 'active'))
            .sort((a, b) => {
                const dateA = new Date(a.seizureDate || a.date).getTime();
                const dateB = new Date(b.seizureDate || b.date).getTime();
                return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
            });
    }, [asset.holdings, sortOrder, showHistory]);

    const toggleSort = () => {
        setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    };

    // Selection Handlers
    const toggleSelectAll = () => {
        if (selectedHoldings.size === sortedHoldings.length) {
            setSelectedHoldings(new Set());
        } else {
            setSelectedHoldings(new Set(sortedHoldings.map(h => h.id)));
        }
    };

    const toggleSelect = (id) => {
        const newSelected = new Set(selectedHoldings);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedHoldings(newSelected);
    };

    const handleBulkDelete = () => {
        if (!confirm(`Sei sicuro di voler eliminare ${selectedHoldings.size} elementi selezionati?`)) return;

        selectedHoldings.forEach(id => {
            onRemoveHolding(asset.id, id);
        });
        setSelectedHoldings(new Set());
    };

    const startEdit = (holding) => {
        setEditingId(holding.id);
        setEditForm({ ...holding });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({});
    };

    const saveEdit = () => {
        if (onUpdateHolding) {
            onUpdateHolding(asset.id, editingId, editForm);
        }
        setEditingId(null);
    };

    const handleChange = (field, value) => {
        setEditForm(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div style={{
            animation: 'fadeIn 0.3s ease',
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--bg-app)',
            position: 'relative'
        }}>
            {/* Header/Nav */}
            <div style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-header)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={onBack} className="btn-secondary" style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Indietro / Dashboard">
                            <Home size={20} />
                        </button>
                    </div>

                    <div style={{ height: '30px', width: '1px', background: 'var(--border-color)', margin: '0 0.5rem' }}></div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {asset.image ? (
                            <img src={asset.image} alt={asset.name} style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                        ) : (
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                                {asset.symbol?.[0]}
                            </div>
                        )}
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{asset.name}</h2>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{asset.symbol.toUpperCase()}</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                            className="btn-primary"
                            style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            onClick={() => setIsAddFormOpen(true)}
                        >
                            <PlusCircle size={18} /> Aggiungi Sequestro
                        </button>

                        {(userRole === 'admin' || userRole === 'user') && (
                            <button
                                className="btn-secondary"
                                style={{ padding: '8px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                onClick={() => {
                                    if (window.confirm(`Sei sicuro di voler eliminare l'intero asset ${asset.name} e tutti i suoi ${asset.holdings.length} sequestri?`)) {
                                        onRemoveAsset(asset.id);
                                    }
                                }}
                                title="Elimina intero asset"
                            >
                                <Trash2 size={20} />
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Prezzo Attuale</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            {isEditingPrice ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input
                                        type="number"
                                        step="any"
                                        className="input-field"
                                        style={{ width: '120px', padding: '4px 8px', textAlign: 'right' }}
                                        value={manualPriceInput}
                                        onChange={(e) => setManualPriceInput(e.target.value)}
                                        autoFocus
                                    />
                                    <button
                                        className="btn-primary"
                                        style={{ padding: '4px', background: '#22c55e', borderColor: '#22c55e' }}
                                        onClick={() => {
                                            if (onManualPriceUpdate) {
                                                const val = manualPriceInput === '' ? null : parseFloat(manualPriceInput);
                                                onManualPriceUpdate(asset.id, val);
                                                setIsEditingPrice(false);
                                            }
                                        }}
                                    >
                                        <Check size={16} />
                                    </button>
                                    <button
                                        className="btn-secondary"
                                        style={{ padding: '4px' }}
                                        onClick={() => setIsEditingPrice(false)}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {asset.currentPrice === 0 && (
                                        <span style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 'bold', marginRight: '8px' }} title="Nessun prezzo trovato su CoinGecko. Inserisci un prezzo manuale.">⚠️ Inserisci Prezzo</span>
                                    )}
                                    <span style={{ color: asset.currentPrice === 0 ? 'var(--text-muted)' : 'inherit' }}>
                                        {formatCurrency(asset.currentPrice, currency)}
                                    </span>
                                    <button
                                        className="btn-secondary"
                                        style={{ padding: '4px', border: 'none', background: 'transparent' }}
                                        onClick={() => {
                                            setManualPriceInput(asset.currentPrice);
                                            setIsEditingPrice(true);
                                        }}
                                        title="Modifica prezzo manualmente"
                                    >
                                        <Edit2 size={14} color="var(--text-muted)" />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Holdings Table Panel */}
            <div className="glass-panel" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <h3 style={{ margin: 0 }}>Storico Inserimenti</h3>
                        {selectedHoldings.size > 0 && (userRole === 'admin' || userRole === 'user') && (
                            <button
                                className="btn-primary"
                                style={{ fontSize: '0.85rem', padding: '4px 12px' }}
                                onClick={handleBulkDelete}
                            >
                                Elimina Selezionati ({selectedHoldings.size})
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            <input
                                type="checkbox"
                                checked={showHistory}
                                onChange={(e) => setShowHistory(e.target.checked)}
                                style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                            />
                            Mostra Storico (Confiscati / Dissequestrati / Freezati)
                        </label>
                    </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px', tableLayout: 'fixed' }}>
                        <thead>
                            <tr style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'left' }}>
                                {(userRole === 'admin' || userRole === 'user') && (
                                    <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', width: 'auto' }}>
                                        <button
                                            onClick={toggleSelectAll}
                                            className="btn-secondary"
                                            style={{
                                                padding: '4px 8px',
                                                fontSize: '0.7rem',
                                                whiteSpace: 'nowrap'
                                            }}
                                            title="Seleziona/Deseleziona Tutti"
                                        >
                                            {selectedHoldings.size === sortedHoldings.length && sortedHoldings.length > 0 ? 'Deseleziona Tutti' : 'Seleziona Tutti'}
                                        </button>
                                    </th>
                                )}
                                <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', userSelect: 'none', width: '140px', whiteSpace: 'nowrap' }} onClick={toggleSort}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        Data Sequestro
                                    </div>
                                </th>
                                {showHistory && (
                                    <>
                                        <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', width: '140px', whiteSpace: 'nowrap' }}>
                                            Data Confisca
                                        </th>
                                        <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', width: '140px', whiteSpace: 'nowrap' }}>
                                            Data Dissequestro
                                        </th>
                                    </>
                                )}
                                <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Procedimento</th>
                                <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Parte Offesa</th>
                                <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Indagato</th>
                                <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Indirizzo</th>
                                <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Blockchain</th>
                                <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>Quantità</th>
                                <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>Valore Attuale</th>
                                {(userRole === 'admin' || userRole === 'user') && (
                                    <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', textAlign: 'center' }}>Azioni</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedHoldings.map(holding => {
                                const isEditing = editingId === holding.id;
                                const val = parseFloat(holding.amount) * asset.currentPrice;
                                const isActive = !holding.status || holding.status === 'active';
                                const isSelected = selectedHoldings.has(holding.id);

                                if (isEditing) {
                                    return (
                                        <tr key={holding.id} style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-app)' }}>
                                            {userRole === 'admin' && <td style={{ padding: '1rem' }}></td>}
                                            <td style={{ padding: '0.5rem' }}><input className="input-field" type="date" value={editForm.seizureDate || editForm.date?.split('T')[0]} onChange={e => handleChange('seizureDate', e.target.value)} style={{ width: '100%', padding: '0.5rem' }} /></td>
                                            {showHistory && (
                                                <>
                                                    <td style={{ padding: '0.5rem' }}><input className="input-field" type="date" value={editForm.status === 'confiscated' ? (editForm.statusDate || '') : ''} onChange={e => handleChange('statusDate', e.target.value)} disabled={editForm.status !== 'confiscated'} style={{ width: '100%', padding: '0.5rem', opacity: editForm.status === 'confiscated' ? 1 : 0.5 }} /></td>
                                                    <td style={{ padding: '0.5rem' }}><input className="input-field" type="date" value={editForm.status === 'released' ? (editForm.statusDate || '') : ''} onChange={e => handleChange('statusDate', e.target.value)} disabled={editForm.status !== 'released'} style={{ width: '100%', padding: '0.5rem', opacity: editForm.status === 'released' ? 1 : 0.5 }} /></td>
                                                    <td style={{ padding: '0.5rem' }}><input className="input-field" type="date" value={editForm.status === 'freezing' ? (editForm.statusDate || '') : ''} onChange={e => handleChange('statusDate', e.target.value)} disabled={editForm.status !== 'freezing'} style={{ width: '100%', padding: '0.5rem', opacity: editForm.status === 'freezing' ? 1 : 0.5 }} /></td>
                                                </>
                                            )}
                                            <td style={{ padding: '0.5rem' }}><input className="input-field" type="text" value={editForm.legalProceeding || editForm.label} onChange={e => handleChange('legalProceeding', e.target.value)} style={{ width: '100%', padding: '0.5rem' }} /></td>
                                            <td style={{ padding: '0.5rem' }}><input className="input-field" type="text" value={editForm.injuredPartyName || ''} onChange={e => handleChange('injuredPartyName', e.target.value)} placeholder="Parte Offesa..." style={{ width: '100%', padding: '0.5rem' }} /></td>
                                            <td style={{ padding: '0.5rem' }}><input className="input-field" type="text" value={editForm.suspectName} onChange={e => handleChange('suspectName', e.target.value)} style={{ width: '100%', padding: '0.5rem' }} /></td>
                                            <td style={{ padding: '0.5rem' }}><input className="input-field" type="text" value={editForm.walletAddress} onChange={e => handleChange('walletAddress', e.target.value)} style={{ width: '100%', padding: '0.5rem' }} /></td>
                                            <td style={{ padding: '0.5rem' }}><input className="input-field" type="text" value={editForm.blockchain} onChange={e => handleChange('blockchain', e.target.value)} style={{ width: '100%', padding: '0.5rem' }} /></td>
                                            <td style={{ padding: '0.5rem' }}><input className="input-field" type="number" step="any" value={editForm.amount} onChange={e => handleChange('amount', e.target.value)} style={{ width: '100%', padding: '0.5rem', textAlign: 'right' }} /></td>
                                            <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-muted)' }}>-</td>
                                            <td style={{ padding: '1rem', textAlign: 'center', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                <button className="btn-primary" onClick={saveEdit} style={{ padding: '6px', background: '#22c55e', borderColor: '#22c55e' }} title="Salva">
                                                    <Check size={16} />
                                                </button>
                                                <button className="btn-secondary" onClick={cancelEdit} style={{ padding: '6px' }} title="Annulla">
                                                    <X size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                }

                                return (
                                    <tr key={holding.id} style={{
                                        borderBottom: '1px solid var(--border-color)',
                                        opacity: isActive ? 1 : 0.8,
                                        background: isSelected ? 'rgba(59, 130, 246, 0.1)' : (isActive ? 'transparent' : 'rgba(128,128,128,0.1)')
                                    }}>
                                        {(userRole === 'admin' || userRole === 'user') && (
                                            <td style={{ padding: '1rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelect(holding.id)}
                                                    style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                                                />
                                            </td>
                                        )}
                                        <td style={{
                                            padding: '1rem',
                                            color: 'var(--text-main)',
                                            fontSize: '0.95rem',
                                            width: '140px',
                                            fontWeight: 700,
                                            whiteSpace: 'nowrap',
                                            fontFamily: 'monospace',
                                            textAlign: 'center'
                                        }}>
                                            {formatDate(holding.seizureDate || holding.date)}
                                        </td>
                                        {showHistory && (
                                            <>
                                                <td style={{
                                                    padding: '1rem',
                                                    fontSize: '0.95rem',
                                                    width: '140px',
                                                    whiteSpace: 'nowrap',
                                                    fontFamily: 'monospace',
                                                    textAlign: 'center',
                                                    fontWeight: 700
                                                }}>
                                                    {holding.status === 'confiscated' && holding.statusDate ? (
                                                        <span style={{ color: '#22c55e' }}>
                                                            {new Date(holding.statusDate).toLocaleDateString('it-IT')}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>-</span>
                                                    )}
                                                </td>
                                                <td style={{
                                                    padding: '1rem',
                                                    fontSize: '0.95rem',
                                                    width: '140px',
                                                    whiteSpace: 'nowrap',
                                                    fontFamily: 'monospace',
                                                    textAlign: 'center',
                                                    fontWeight: 700
                                                }}>
                                                    {holding.status === 'released' && holding.statusDate ? (
                                                        <span style={{ color: '#ef4444' }}>
                                                            {new Date(holding.statusDate).toLocaleDateString('it-IT')}
                                                        </span>
                                                    ) : holding.status === 'freezing' && holding.statusDate ? (
                                                        <span style={{ color: '#06b6d4' }}>
                                                            {new Date(holding.statusDate).toLocaleDateString('it-IT')}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>-</span>
                                                    )}
                                                </td>
                                            </>
                                        )}
                                        <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--primary)', fontSize: '0.9rem' }}>
                                            {holding.proceeding || holding.legalProceeding || '-'}
                                        </td>
                                        <td style={{ padding: '1rem', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                                            {holding.injuredPartyName || '-'}
                                        </td>
                                        <td style={{ padding: '1rem', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                                            {holding.suspectName || '-'}
                                        </td>
                                        <td
                                            style={{ padding: '1rem', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.9rem', cursor: 'pointer', position: 'relative' }}
                                            title="Clicca per copiare"
                                            onClick={() => {
                                                navigator.clipboard.writeText(holding.walletAddress);
                                                const el = document.getElementById(`copy-feedback-${holding.id}`);
                                                if (el) {
                                                    el.style.opacity = '1';
                                                    setTimeout(() => el.style.opacity = '0', 1000);
                                                }
                                            }}
                                        >
                                            {shortenAddress(holding.walletAddress)}
                                            <span id={`copy-feedback-${holding.id}`} style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: '#10b981', color: '#fff', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', opacity: 0, transition: 'opacity 0.2s', pointerEvents: 'none' }}>Copiato!</span>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{
                                                background: 'var(--bg-app)',
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.85rem',
                                                border: '1px solid var(--border-color)'
                                            }}>
                                                {holding.blockchain}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 600, fontSize: '0.9rem' }}>
                                            {holding.amount.toString().replace('.', ',')} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '4px' }}>{asset.symbol.toUpperCase()}</span>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                            {formatCurrency(val, currency)}
                                        </td>
                                        {(userRole === 'admin' || userRole === 'user') && (
                                            <td style={{ padding: '1rem', textAlign: 'center', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                {isActive ? (
                                                    <>
                                                        <button className="btn-secondary" style={{ padding: '6px', color: '#4ade80' }} onClick={() => onUpdateHolding(asset.id, holding.id, { status: 'confiscated', statusDate: new Date().toISOString(), historicFiatValueEur: parseFloat(holding.amount) * (asset.rawEurPrice || asset.currentPrice) })} title="Confisca">
                                                            <Gavel size={16} />
                                                        </button>
                                                        <button className="btn-secondary" style={{ padding: '6px', color: '#f87171' }} onClick={() => onUpdateHolding(asset.id, holding.id, { status: 'released', statusDate: new Date().toISOString(), historicFiatValueEur: parseFloat(holding.amount) * (asset.rawEurPrice || asset.currentPrice) })} title="Dissequestra">
                                                            <Unlock size={16} />
                                                        </button>
                                                        <button className="btn-secondary" style={{ padding: '6px', color: '#06b6d4' }} onClick={() => onUpdateHolding(asset.id, holding.id, { status: 'freezing', statusDate: new Date().toISOString(), historicFiatValueEur: parseFloat(holding.amount) * (asset.rawEurPrice || asset.currentPrice) })} title="Congela">
                                                            <Snowflake size={16} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button className="btn-secondary" style={{ padding: '6px', color: 'var(--text-main)', borderColor: 'var(--text-muted)' }} onClick={() => onUpdateHolding(asset.id, holding.id, { status: 'active', statusDate: null })} title="Annulla / Ripristina">
                                                        <RotateCcw size={16} />
                                                    </button>
                                                )}

                                                <button
                                                    className="btn-secondary"
                                                    style={{ padding: '6px' }}
                                                    onClick={() => startEdit(holding)}
                                                    title="Modifica"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    className="btn-secondary"
                                                    style={{ padding: '6px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                                    onClick={() => {
                                                        if (confirm('Sei sicuro di voler rimuovere questo sequestro?')) {
                                                            onRemoveHolding(asset.id, holding.id);
                                                        }
                                                    }}
                                                    title="Rimuovi Sequestro"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {isAddFormOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 200,
                    background: 'rgba(0, 0, 0, 0.8)',
                    backdropFilter: 'blur(5px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem'
                }}>
                    <div style={{ width: '100%', maxWidth: '800px', position: 'relative' }}>
                        <button
                            onClick={() => setIsAddFormOpen(false)}
                            style={{
                                position: 'absolute',
                                top: '1rem',
                                right: '1rem',
                                zIndex: 210,
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer'
                            }}
                        >
                            <X size={24} />
                        </button>
                        <AddAssetForm
                            onAdd={(data) => {
                                onAddHolding(data);
                                setIsAddFormOpen(false);
                            }}
                            existingAssets={[]} // We don't need duplicate check here as we are adding to THIS asset
                            isInternalMode={true}
                            defaultSymbol={asset.symbol}
                            defaultName={asset.name}
                            defaultId={asset.id}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// Helpers

function formatDate(isoString) {
    if (!isoString) return '-';
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('it-IT');
    } catch {
        return isoString;
    }
}

function shortenAddress(addr) {
    if (!addr) return '-';
    if (addr.length < 10) return addr;
    return addr.substring(0, 6) + '...' + addr.substring(addr.length - 4);
}
