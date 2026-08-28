
import React, { useState } from 'react';
import { Plus, PlusCircle, Search, CheckCircle, AlertCircle, Loader2, ExternalLink, Settings, Edit3 } from 'lucide-react';
import { scanAddress, getExplorerUrl, mapToCoinGeckoId } from '../services/blockchain';
import { parseLocaleNumber } from '../utils/formatting';

export default function AddAssetForm({ onAdd, existingAssets = [], onUpdateAddress, isInternalMode = false, defaultSymbol = '', defaultName = '', defaultId = '', defaultStatus = 'active', triggerComponent = null }) {
    const [isOpen, setIsOpen] = useState(false);

    // Workflow State: 'input' | 'scanning' | 'result' | 'conflict'
    const [status, setStatus] = useState('input');

    // Inputs
    const [walletAddress, setWalletAddress] = useState('');
    const [injuredPartyName, setInjuredPartyName] = useState('');
    const [suspectName, setSuspectName] = useState('');
    const [seizureDate, setSeizureDate] = useState(new Date().toISOString().split('T')[0]);

    // Status State
    const [initialStatus, setInitialStatus] = useState(defaultStatus);
    const [statusDate, setStatusDate] = useState(defaultStatus !== 'active' ? new Date().toISOString().split('T')[0] : '');

    const [legalProceeding, setLegalProceeding] = useState(''); // Keeping this as optional or inferred? User said "Nome Cognome e data" compulsory. I'll keep proceeding as optional.
    // eslint-disable-next-line no-unused-vars
    const [error, setError] = useState(null);
    // eslint-disable-next-line no-unused-vars
    const [scanStatusText, setScanStatusText] = useState('');

    // Duplicate Handling
    const [duplicateInfo, setDuplicateInfo] = useState(null);
    const [updateInfoSelected, setUpdateInfoSelected] = useState(false);

    // Manual Entry State
    const [isManual, setIsManual] = useState(isInternalMode);
    const [manualSymbol, setManualSymbol] = useState(defaultSymbol);
    const [manualAmount, setManualAmount] = useState('');
    const [manualChain, setManualChain] = useState('Ethereum');
    const [customChain, setCustomChain] = useState('');
    const [manualPrice, setManualPriceInput] = useState('');

    // Extensive Symbol List for Autocomplete
    const commonSymbols = [
        "BTC", "ETH", "USDT", "BNB", "SOL", "XRP", "USDC", "ADA", "AVAX", "DOGE",
        "TRX", "DOT", "LINK", "MATIC", "WBTC", "LTC", "DAI", "SHIB", "BCH", "UNI",
        "LEO", "ATOM", "XMR", "ETC", "XLM", "OKB", "FIL", "HBAR", "LDO", "APT",
        "CRO", "NEAR", "VET", "QNT", "MKR", "AAVE", "GRT", "ALGO", "STX", "EGLD",
        "SAND", "EOS", "THETA", "TUSD", "XTZ", "IMX", "MANA", "AXS", "BSV", "FTM",
        "SNX", "NEO", "RPL", "FLOW", "KCS", "CHZ", "CRV", "KLAY", "USDP", "GALA",
        "TTT", "ZEC", "IOTA", "XEC", "BTT", "MINA", "FXS", "DASH", "HT", "MIOTA",
        "CAKE", "GT", "TWT", "LUNC", "PAXG", "ZIL", "RVN", "KAVA", "1INCH", "CELO",
        "RUNE", "NEXO", "OSMO", "BAT", "ENJ", "LOOP", "KSM", "ZRX", "CVX", "COMP",
        "HOT", "WAVES", "GNO", "QTUM", "LRC", "ANKR", "YFI", "BAL", "OMG", "ZRX"
    ].sort();

    // Detected Data
    const [detectedAssets, setDetectedAssets] = useState([]);
    const [selectedIndexes, setSelectedIndexes] = useState(new Set());

    const handleScan = async (e) => {
        e.preventDefault();
        if (!walletAddress || !seizureDate) return;

        setStatus('scanning');
        setError(null);
        setScanStatusText('Avvio scansione multichain...');

        // Artificial delay for UX
        await new Promise(resolve => setTimeout(resolve, 800));

        try {
            const results = await scanAddress(walletAddress, (currentStep) => {
                setScanStatusText(`Analisi in corso: ${currentStep}...`);
            });

            // DUPLICATE CHECK
            let foundExisting = null;
            if (existingAssets) {
                for (const asset of existingAssets) {
                    const holding = asset.holdings.find(h => h.walletAddress && h.walletAddress.toLowerCase() === walletAddress.toLowerCase());
                    if (holding) {
                        foundExisting = {
                            assetName: asset.name,
                            injuredPartyName: holding.injuredPartyName || '',
                            suspectName: holding.label,
                            date: holding.date,
                            proceeding: holding.proceeding || 'N/D' // Assuming we add this field
                        };
                        break;
                    }
                }
            }

            if (foundExisting) {
                setDuplicateInfo(foundExisting);
                setDetectedAssets(results);
                setSelectedIndexes(new Set(results.map((_, i) => i)));
                setStatus('conflict');
            } else {
                setDetectedAssets(results);
                setSelectedIndexes(new Set(results.map((_, i) => i)));
                setStatus('result');
            }

        } catch (error) {
            console.error("Scan failed", error);
            setError("Impossibile completare la scansione. Riprova.");
            setDetectedAssets([]);
            setStatus('input');
        } finally {
            setScanStatusText('');
        }
    };

    const toggleSelection = (index) => {
        const newSet = new Set(selectedIndexes);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setSelectedIndexes(newSet);
    };



    const handleMerge = () => {
        // 1. Update Metadata if requested
        if (updateInfoSelected && onUpdateAddress) {
            onUpdateAddress(walletAddress, {
                injuredPartyName,
                suspectName,
                legalProceeding,
                seizureDate,
                status: initialStatus,
                statusDate: initialStatus !== 'active' ? statusDate : null
            });
        }

        // 2. Prepare Assets
        const assetsToImport = detectedAssets.filter((_, index) => selectedIndexes.has(index));

        assetsToImport.forEach(asset => {
            const amount = parseFloat(asset.amount);
            const fiatValue = (initialStatus !== 'active' && asset.currentPrice) ? (amount * asset.currentPrice) : undefined;
            onAdd({
                ...asset,
                injuredPartyName: updateInfoSelected ? injuredPartyName : duplicateInfo.injuredPartyName,
                suspectName: updateInfoSelected ? suspectName : duplicateInfo.suspectName,
                seizureDate: updateInfoSelected ? seizureDate : duplicateInfo.date,
                legalProceeding: updateInfoSelected ? legalProceeding : duplicateInfo.proceeding,
                walletAddress,
                type: asset.type, // Ensure type is passed
                status: initialStatus,
                statusDate: initialStatus !== 'active' ? statusDate : null,
                historicFiatValueEur: fiatValue
            });
        });

        resetForm();
    };

    const handleConfirm = () => {
        if (detectedAssets.length === 0) return;

        // Import only selected
        detectedAssets.forEach((asset, index) => {
            if (selectedIndexes.has(index)) {
                const amount = parseFloat(asset.amount);
                const fiatValue = (initialStatus !== 'active' && asset.currentPrice) ? (amount * asset.currentPrice) : undefined;
                onAdd({
                    ...asset,
                    legalProceeding: legalProceeding || 'N/D',
                    injuredPartyName,
                    suspectName,
                    seizureDate,
                    status: initialStatus,
                    statusDate: initialStatus !== 'active' ? statusDate : null,
                    historicFiatValueEur: fiatValue
                });
            }
        });

        resetForm();
    };

    const handleManualAdd = (e) => {
        e.preventDefault();
        const finalSymbol = initialStatus === 'freezing' ? 'USDT' : manualSymbol;
        const geckoId = mapToCoinGeckoId(finalSymbol, manualChain);
        const amount = parseLocaleNumber(manualAmount);
        const price = parseFloat(manualPrice) || null;
        const fiatValue = (initialStatus !== 'active' && price) ? (amount * price) : undefined;
        onAdd({
            id: isInternalMode ? defaultId : geckoId,
            name: isInternalMode ? defaultName : (finalSymbol.toUpperCase() + ' (Manuale)'),
            symbol: isInternalMode ? defaultSymbol : finalSymbol.toUpperCase(),
            amount: amount,
            manualPrice: price,
            blockchain: manualChain === 'Other' ? (customChain || 'Altro') : manualChain,
            walletAddress: walletAddress || 'Manuale',
            type: 'Token',
            injuredPartyName,
            suspectName,
            legalProceeding: legalProceeding || 'N/D',
            seizureDate,
            status: initialStatus,
            statusDate: initialStatus !== 'active' ? statusDate : null,
            historicFiatValueEur: fiatValue
        });
        resetForm();
    };

    const resetForm = () => {
        setWalletAddress('');
        setInjuredPartyName('');
        setSuspectName('');
        setSeizureDate(new Date().toISOString().split('T')[0]);
        setLegalProceeding('');
        setDetectedAssets([]);
        setStatus('input');
        setIsOpen(false);
        setDuplicateInfo(null);
        setUpdateInfoSelected(false);
        setIsManual(false);
        setManualSymbol('');
        setManualSymbol('');
        setManualAmount('');
        setInitialStatus(defaultStatus);
        setStatusDate(defaultStatus !== 'active' ? new Date().toISOString().split('T')[0] : '');
        setCustomChain('');
        setManualPriceInput('');
    };

    return (
        <>
            {triggerComponent ? (
                <div onClick={() => setIsOpen(true)} style={{ display: 'inline-block' }}>
                    {triggerComponent}
                </div>
            ) : (
                <div
                    className="glass-panel"
                    onClick={() => setIsOpen(true)}
                    style={{
                        padding: '1.5rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '1rem',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        minHeight: '200px'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                    }}
                >
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Plus size={32} strokeWidth={3} />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)', textAlign: 'center' }}>
                        Aggiungi nuova Criptovaluta
                    </span>
                </div>
            )}

            {isOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 100,
                    background: 'rgba(0, 0, 0, 0.8)',
                    backdropFilter: 'blur(5px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem',
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    <div className="glass-panel" style={{
                        width: '100%',
                        maxWidth: '800px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '2rem',
                        background: 'var(--bg-card)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        border: '1px solid var(--border-color)'
                    }}>
                        <h3 style={{ marginTop: 0, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontSize: '1.5rem' }}>
                            <Search size={24} />
                            {isManual ? 'Aggiungi Asset Manualmente' : 'Analisi Wallet & Importazione'}
                        </h3>

                        {status === 'input' && !isManual && (
                            <form onSubmit={handleScan} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                        Indirizzo Wallet (Obbligatorio)
                                    </label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="es. 0x..., bc1..., T..."
                                        value={walletAddress}
                                        onChange={(e) => setWalletAddress(e.target.value)}
                                        required
                                        style={{ fontFamily: 'monospace' }}
                                    />
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                        Rilevamento intelligente: ETH, BSC, Polygon, Avalanche, Arbitrum, Bitcoin, Tron.
                                    </p>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                            Nome e Cognome Parte Offesa (Opzionale)
                                        </label>
                                        <input
                                            type="text"
                                            className="input-field"
                                            placeholder="es. Luigi Bianchi"
                                            value={injuredPartyName}
                                            onChange={(e) => setInjuredPartyName(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(250px, 1fr)', gap: '1.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                            Nome Cognome Indagato (Opzionale)
                                        </label>
                                        <input
                                            type="text"
                                            className="input-field"
                                            placeholder="Mario Rossi"
                                            value={suspectName}
                                            onChange={(e) => setSuspectName(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                            {initialStatus === 'freezing' ? 'Data Freezing' : 'Data Sequestro'}
                                        </label>
                                        <input
                                            type="date"
                                            className="input-field"
                                            value={seizureDate}
                                            onChange={(e) => setSeizureDate(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                        Procedimento Penale / R.G.N.R. (Opzionale)
                                    </label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="es. 1234/2024"
                                        value={legalProceeding}
                                        onChange={(e) => setLegalProceeding(e.target.value)}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(250px, 1fr)', gap: '1.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                            Stato Attuale
                                        </label>
                                        <select
                                            className="input-field"
                                            value={initialStatus}
                                            onChange={(e) => setInitialStatus(e.target.value)}
                                        >
                                            <option value="active">Sequestrato (In Corso)</option>
                                            <option value="confiscated">Confiscato Definitivamente</option>
                                            <option value="released">Dissequestrato / Restituito</option>
                                            <option value="freezing">USDT Freezati (Congelato)</option>
                                        </select>
                                    </div>
                                    {['confiscated', 'released'].includes(initialStatus) && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                                Data {initialStatus === 'confiscated' ? 'Confisca' : initialStatus === 'released' ? 'Dissequestro' : 'Congelamento'}
                                            </label>
                                            <input
                                                type="date"
                                                className="input-field"
                                                value={statusDate}
                                                onChange={(e) => setStatusDate(e.target.value)}
                                                required
                                            />
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                    <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={resetForm}>
                                        Annulla
                                    </button>
                                    <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                                        <Search size={18} style={{ marginRight: '8px' }} />
                                        Analizza Balance
                                    </button>
                                </div>

                                {walletAddress && (
                                    <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                                        <a
                                            href={getExplorerUrl(walletAddress)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', textDecoration: 'none', fontSize: '0.9rem' }}
                                        >
                                            <ExternalLink size={14} /> Apri Blockchain Explorer
                                        </a>
                                    </div>
                                )}
                            </form>
                        )}

                        {status === 'input' && !isManual && !isInternalMode && (
                            <div style={{ textAlign: 'center', marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                                <button className="btn-secondary" onClick={() => setIsManual(true)} style={{ fontSize: '0.9rem' }}>
                                    <Edit3 size={16} style={{ marginRight: '6px' }} />
                                    Non trovi il token? Aggiungilo manualmente
                                </button>
                            </div>
                        )}

                        {isManual && (
                            <form onSubmit={handleManualAdd} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ background: 'rgba(37, 99, 235, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(37, 99, 235, 0.1)', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    Inserisci i dettagli dell'asset manuale (es. Monero, ZCash). Il sistema calcolerà il valore in base al prezzo di mercato.
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Indirizzo Wallet</label>
                                    <input type="text" className="input-field" placeholder="es. 44AFFq5kSiGBoZ..." value={walletAddress} onChange={e => setWalletAddress(e.target.value)} style={{ fontFamily: 'monospace' }} />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Simbolo Token</label>
                                        <input
                                            type="text"
                                            className="input-field"
                                            placeholder="es. BTC"
                                            value={initialStatus === 'freezing' ? 'USDT' : manualSymbol}
                                            onChange={e => setManualSymbol(e.target.value)}
                                            list={initialStatus === 'freezing' ? "" : "crypto-symbols"}
                                            disabled={initialStatus === 'freezing'}
                                            required
                                        />
                                        {initialStatus !== 'freezing' && (
                                            <datalist id="crypto-symbols">
                                                {commonSymbols.map(sym => (
                                                    <option key={sym} value={sym} />
                                                ))}
                                            </datalist>
                                        )}
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Quantità</label>
                                        <input type="number" step="any" className="input-field" placeholder="0.00" value={manualAmount} onChange={e => setManualAmount(e.target.value)} required />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Blockchain / Network</label>
                                    <select className="input-field" value={manualChain} onChange={e => setManualChain(e.target.value)}>
                                        <option value="Bitcoin">Bitcoin</option>
                                        <option value="Ethereum">Ethereum</option>
                                        <option value="BSC (BEP20)">BSC (Binance Smart Chain)</option>
                                        <option value="Polygon">Polygon</option>
                                        <option value="Tron">Tron</option>
                                        <option value="Avalanche">Avalanche</option>
                                        <option value="Solana">Solana</option>
                                        <option value="Monero">Monero</option>
                                        <option value="Zcash">Zcash</option>
                                        <option value="Cardano">Cardano</option>
                                        <option value="Ripple">Ripple (XRP)</option>
                                        <option value="Other">Altro (Specifica)</option>
                                    </select>
                                    {manualChain === 'Other' && (
                                        <input
                                            type="text"
                                            className="input-field"
                                            placeholder="Inserisci nome Blockchain"
                                            value={customChain}
                                            onChange={e => setCustomChain(e.target.value)}
                                            style={{ marginTop: '0.5rem' }}
                                            required
                                        />
                                    )}
                                </div>

                                {/* Common Metadata Fields */}
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Nome e Cognome Parte Offesa (Opzionale)</label>
                                    <input type="text" className="input-field" placeholder="es. Luigi Bianchi" value={injuredPartyName} onChange={(e) => setInjuredPartyName(e.target.value)} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(250px, 1fr)', gap: '1.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Nome Cognome Indagato (Opzionale)</label>
                                        <input type="text" className="input-field" placeholder="Mario Rossi" value={suspectName} onChange={(e) => setSuspectName(e.target.value)} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                            {initialStatus === 'freezing' ? 'Data Freezing' : 'Data Sequestro'}
                                        </label>
                                        <input type="date" className="input-field" value={seizureDate} onChange={(e) => setSeizureDate(e.target.value)} required />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Procedimento Penale (Opzionale)</label>
                                    <input type="text" className="input-field" placeholder="es. 1234/2024" value={legalProceeding} onChange={(e) => setLegalProceeding(e.target.value)} />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Stato Attuale</label>
                                        <select className="input-field" value={initialStatus} onChange={e => setInitialStatus(e.target.value)}>
                                            <option value="active">Sequestrato (In Corso)</option>
                                            <option value="confiscated">Confiscato Definitivamente</option>
                                            <option value="released">Dissequestrato / Restituito</option>
                                            <option value="freezing">USDT Freezati (Congelato)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Prezzo Corrente (EUR)</label>
                                        <input
                                            type="number"
                                            step="any"
                                            className="input-field"
                                            placeholder="es. 1.50"
                                            value={manualPrice}
                                            onChange={e => setManualPriceInput(e.target.value)}
                                            required
                                        />
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Prezzo unitario per il calcolo del valore.</p>
                                    </div>
                                </div>

                                {['confiscated', 'released'].includes(initialStatus) && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                            Data {initialStatus === 'confiscated' ? 'Confisca' : initialStatus === 'released' ? 'Dissequestro' : 'Congelamento'}
                                        </label>
                                        <input type="date" className="input-field" value={statusDate} onChange={e => setStatusDate(e.target.value)} required />
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                    <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setIsManual(false)}>Indietro</button>
                                    <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                                        <PlusCircle size={18} style={{ marginRight: '8px' }} /> Aggiungi Asset
                                    </button>
                                </div>
                            </form>
                        )}

                        {status === 'scanning' && (
                            <div className="card" style={{ marginBottom: '2rem' }}>
                                <div style={{ textAlign: 'center', padding: '3rem' }}>
                                    <Settings className="spin" size={48} style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
                                    <h3 style={{ marginBottom: '0.5rem' }}>Analisi delle Blockchain in corso</h3>

                                </div>
                            </div>
                        )}
                        {status === 'conflict' && duplicateInfo && (
                            <div className="card" style={{ marginBottom: '2rem', border: '1px solid #eab308' }}>
                                <div style={{ padding: '2rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', color: '#ca8a04' }}>
                                        <AlertCircle size={24} />
                                        <h3 style={{ margin: 0 }}>Indirizzo Già Monitorato</h3>
                                    </div>

                                    <div style={{ background: 'rgba(234, 179, 8, 0.1)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                                        <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>Attenzione: {walletAddress}</p>
                                        <p style={{ margin: 0, fontSize: '0.9rem' }}>
                                            Risulta già associato a: <strong>{duplicateInfo.suspectName}</strong> ({duplicateInfo.date})
                                        </p>
                                    </div>

                                    {/* Metadata Update Option */}
                                    <div style={{ marginBottom: '1.5rem', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={updateInfoSelected}
                                                onChange={(e) => setUpdateInfoSelected(e.target.checked)}
                                                style={{ width: '18px', height: '18px' }}
                                            />
                                            <div>
                                                <span style={{ display: 'block', fontWeight: 600 }}>Aggiorna Dati Anagrafici</span>
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    Sovrascrivi con: {suspectName} ({seizureDate})
                                                </span>
                                            </div>
                                        </label>
                                    </div>

                                    <h4 style={{ marginBottom: '1rem' }}>Asset Rilevati (Seleziona i nuovi da aggiungere):</h4>
                                    <div style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '1.5rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <tbody>
                                                {detectedAssets.map((asset, idx) => (
                                                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                        <td style={{ padding: '10px' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedIndexes.has(idx)}
                                                                onChange={() => toggleSelection(idx)}
                                                                style={{ width: '16px', height: '16px' }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: '10px' }}>{asset.name} ({asset.symbol})</td>
                                                        <td style={{ padding: '10px', textAlign: 'right' }}>{asset.amount}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={resetForm}>
                                            Annulla
                                        </button>
                                        <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={handleMerge}>
                                            Conferma & Unisci
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {status === 'result' && detectedAssets.length === 0 && (
                            <div className="card" style={{ marginBottom: '2rem', textAlign: 'center', padding: '3rem' }}>
                                <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                    <AlertCircle size={48} style={{ margin: '0 auto', display: 'block', opacity: 0.5 }} />
                                </div>
                                <h3 style={{ marginBottom: '0.5rem' }}>Nessun Asset Rilevato</h3>
                                <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto 2rem' }}>
                                    L'indirizzo è valido ma non contiene fondi o token supportati dai nostri sistemi di monitoraggio.
                                </p>

                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                    <button type="button" className="btn-secondary" onClick={() => setStatus('input')}>
                                        Indietro
                                    </button>
                                    <button type="button" className="btn-primary" onClick={() => { setStatus('input'); setIsManual(true); }}>
                                        Aggiungi Manualmente
                                    </button>
                                </div>
                            </div>
                        )}

                        {status === 'result' && detectedAssets.length > 0 && (
                            <div style={{ animation: 'fadeIn 0.3s ease' }}>
                                <div style={{
                                    background: 'var(--bg-app)',
                                    border: '1px solid var(--border-color)',
                                    padding: '1.5rem',
                                    borderRadius: '8px',
                                    marginBottom: '2rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#22c55e' }}>
                                            <CheckCircle size={20} />
                                            <h4 style={{ margin: 0 }}>Scansione Completata</h4>
                                        </div>
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                            {detectedAssets.length} Asset Rilevati
                                        </span>
                                    </div>

                                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                                                    <th style={{ padding: '10px' }}>Selezione</th>
                                                    <th style={{ padding: '10px' }}>Asset</th>
                                                    <th style={{ padding: '10px' }}>Tipo</th>
                                                    <th style={{ padding: '10px', textAlign: 'right' }}>Balance</th>
                                                    <th style={{ padding: '10px' }}>Network</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detectedAssets.map((asset, idx) => (
                                                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                        <td style={{ padding: '10px' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedIndexes.has(idx)}
                                                                onChange={() => toggleSelection(idx)}
                                                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: '10px', fontWeight: 600 }}>{asset.name} <small style={{ color: 'var(--text-muted)' }}>{asset.symbol}</small></td>
                                                        <td style={{ padding: '10px', fontSize: '0.85rem' }}>{asset.type}</td>
                                                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>{asset.amount}</td>
                                                        <td style={{ padding: '10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{asset.blockchain}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setStatus('input')}>
                                        Indietro
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        style={{ flex: 1, justifyContent: 'center' }}
                                        onClick={handleConfirm}
                                        disabled={selectedIndexes.size === 0}
                                    >
                                        <PlusCircle size={18} style={{ marginRight: '8px' }} />
                                        Importa Selezionati ({selectedIndexes.size})
                                    </button>
                                </div>
                                <p className="text-gray-400 text-xs mt-1" style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Supporta Ethereum, BSC, Polygon, Avalanche, Bitcoin, Tron, Dogecoin
                                </p>

                                <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={() => { setStatus('input'); setIsManual(true); }}
                                        style={{ fontSize: '0.9rem', border: 'none', background: 'transparent', color: 'var(--primary)', textDecoration: 'underline' }}
                                    >
                                        Manca un token? Aggiungilo manualmente
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
