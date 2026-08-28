import React, { useRef, useState, useEffect } from 'react';
import { Download, Upload, Database, X, Check, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { exportToJSON, listBackups, loadBackupFile } from '../services/backupService';
import { useToast } from '../context/ToastContext';

export default function BackupRestore({ assets, onRestore, onClose }) {
    const fileInputRef = useRef(null);
    const [status, setStatus] = useState(null); // 'success', 'error'
    const [message, setMessage] = useState('');
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const toast = useToast();

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        setLoadingHistory(true);
        try {
            const data = await listBackups();
            setHistory(data);
            toast.success('Lista backup aggiornata');
        } catch (e) {
            setStatus('error');
            setMessage('Errore aggiornamento lista');
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleRestoreClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target.result);
                processRestore(json.assets);
            } catch (err) {
                console.error("Restore error:", err);
                setStatus('error');
                setMessage('Errore nel ripristino: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const processRestore = (assetsData) => {
        if (!assetsData || !Array.isArray(assetsData)) {
            setStatus('error');
            setMessage('Struttura dati non valida');
            return;
        }
        onRestore(assetsData);
        setStatus('success');
        setMessage(`Ripristinati ${assetsData.length} asset con successo!`);
        setTimeout(() => {
            setStatus(null);
            onClose();
        }, 2000);
    };

    const handleHistoryRestore = async (filename) => {
        if (!window.confirm('Sei sicuro di voler ripristinare questo backup? I dati attuali non salvati andranno persi.')) return;

        try {
            const assetsData = await loadBackupFile(filename);
            processRestore(assetsData);
        } catch (err) {
            setStatus('error');
            setMessage('Errore caricamento backup: ' + err.message);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000
        }}>
            <div className="glass-panel" style={{ width: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ background: 'rgba(37, 99, 235, 0.1)', padding: '0.5rem', borderRadius: '50%' }}>
                            <Database size={24} color="var(--primary)" />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Backup & Ripristino</h2>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gestisci salvataggi e storico</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                    {/* Sidebar Actions */}
                    <div style={{ width: '300px', padding: '1.5rem', borderRight: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)' }}>
                        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Azioni Manuali</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <button
                                onClick={() => exportToJSON(assets)}
                                className="btn-primary"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', justifyContent: 'flex-start' }}
                            >
                                <Download size={18} />
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontWeight: 600 }}>Scarica JSON</div>
                                    <div style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 400 }}>Salva su PC</div>
                                </div>
                            </button>

                            <button
                                onClick={handleRestoreClick}
                                className="btn-secondary"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', borderStyle: 'dashed', justifyContent: 'flex-start' }}
                            >
                                <Upload size={18} />
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontWeight: 600 }}>Carica da File</div>
                                    <div style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 400 }}>Upload manuale</div>
                                </div>
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" style={{ display: 'none' }} />
                        </div>

                        {status && (
                            <div style={{
                                marginTop: '2rem', padding: '1rem', borderRadius: '8px',
                                background: status === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                color: status === 'success' ? '#10b981' : '#ef4444',
                                display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem'
                            }}>
                                {status === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
                                {message}
                            </div>
                        )}
                    </div>

                    {/* History Section */}
                    <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                                Cronologia Salvataggi
                            </h3>
                            <button onClick={loadHistory} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                                <RefreshCw size={14} className={loadingHistory ? 'spin' : ''} /> Aggiorna
                            </button>
                        </div>

                        {history.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                {loadingHistory ? 'Caricamento...' : 'Nessun backup trovato nello storico.'}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {history.map((item) => (
                                    <div key={item.filename} className="hover-card" style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '1rem', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ background: 'var(--bg-app)', padding: '8px', borderRadius: '6px' }}>
                                                <Clock size={16} color="var(--text-muted)" />
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                                    {new Date(item.date).toLocaleDateString('it-IT')} <span style={{ opacity: 0.6 }}>{new Date(item.date).toLocaleTimeString('it-IT')}</span>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                    {item.filename}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleHistoryRestore(item.filename)}
                                            className="btn-secondary"
                                            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                                        >
                                            Ripristina
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
