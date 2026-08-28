import React, { useState, useEffect } from 'react';
import { Lock, User, AlertCircle, Mail, ArrowRight, ArrowLeft } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function Login({ onLogin }) {
    const [mode, setMode] = useState('loading'); // loading, login, register-admin, complete-registration, recover
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [inviteToken, setInviteToken] = useState(null);
    const [localError, setLocalError] = useState('');
    const toast = useToast();

    useEffect(() => {
        const checkInit = async () => {
            const params = new URLSearchParams(window.location.search);
            const inviteToken = params.get('inviteToken');
            const resetToken = params.get('resetToken');

            if (resetToken) {
                // Flusso reset password admin
                try {
                    const res = await fetch('/api/validate-reset', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: resetToken })
                    });
                    const data = await res.json();
                    if (data.valid) {
                        setInviteToken(resetToken); // riuso il campo per il token di reset
                        setEmail(data.email);
                        setMode('reset-password');
                        toast.info('Imposta la nuova password per sbloccare il tuo account.');
                    } else {
                        toast.error(data.error || 'Link di reset non valido o scaduto');
                        setLocalError(data.error || 'Link di reset non valido o scaduto');
                        setMode('login');
                    }
                } catch (e) {
                    toast.error('Errore verifica link di reset');
                    setLocalError('Errore verifica link di reset');
                    setMode('login');
                }
                return;
            }

            if (inviteToken) {
                // Flusso invito utente
                try {
                    const res = await fetch('/api/validate-invite', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: inviteToken })
                    });
                    const data = await res.json();
                    if (data.valid) {
                        setInviteToken(inviteToken);
                        setEmail(data.email);
                        setMode('complete-registration');
                        toast.info('Completa la registrazione impostando la tua password.');
                        return;
                    } else {
                        toast.error('Invito non valido o scaduto');
                        setLocalError('Invito non valido o scaduto');
                        setMode('login');
                    }
                } catch (e) {
                    toast.error('Errore verifica invito');
                    setLocalError('Errore verifica invito');
                    setMode('login');
                }
            } else {
                // Check if system initialized
                try {
                    const res = await fetch('/api/init-check', { method: 'GET' });
                    const data = await res.json();
                    if (data.initialized) {
                        setMode('login');
                    } else {
                        setMode('register-admin');
                        toast.info('Benvenuto! Crea il primo account amministratore.');
                    }
                } catch (e) {
                    toast.error('Impossibile contattare il server');
                    setLocalError('Impossibile contattare il server');
                    setMode('error');
                }
            }
        };
        checkInit();
    }, [toast]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLocalError('');

        if (mode === 'register-admin') {
            if (password !== confirmPassword) {
                toast.warning('Le password non coincidono');
                setLocalError('Le password non coincidono');
                return;
            }
            try {
                const res = await fetch('/api/register-admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (data.success) {
                    toast.success('Account amministratore creato con successo!');
                    onLogin(data.token, data.role, email);
                } else {
                    toast.error(data.error || 'Errore durante la registrazione');
                    setLocalError(data.error || 'Errore durante la registrazione');
                }
            } catch (e) {
                toast.error('Errore di connessione');
                setLocalError('Errore di connessione');
            }
        }
        else if (mode === 'reset-password') {
            if (password !== confirmPassword) {
                toast.warning('Le password non coincidono');
                setLocalError('Le password non coincidono');
                return;
            }
            try {
                const res = await fetch('/api/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: inviteToken, password })
                });
                const data = await res.json();
                if (data.success) {
                    window.history.replaceState({}, document.title, '/');
                    toast.success('Password reimpostata! Accesso effettuato.');
                    onLogin(data.token, data.role, data.email);
                } else {
                    toast.error(data.error || 'Errore durante il reset');
                    setLocalError(data.error || 'Errore durante il reset');
                }
            } catch (e) {
                toast.error('Errore di connessione');
                setLocalError('Errore di connessione');
            }
        }
        else if (mode === 'complete-registration') {
            if (password !== confirmPassword) {
                toast.warning('Le password non coincidono');
                setLocalError('Le password non coincidono');
                return;
            }
            try {
                const res = await fetch('/api/complete-registration', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: inviteToken, password })
                });
                const data = await res.json();
                if (data.success) {
                    window.history.replaceState({}, document.title, '/');
                    toast.success('Registrazione completata!');
                    onLogin(data.token, data.role, email);
                } else {
                    toast.error(data.error || 'Errore durante il completamento');
                    setLocalError(data.error || 'Errore durante il completamento');
                }
            } catch (e) {
                toast.error('Errore di connessione');
                setLocalError('Errore di connessione');
            }
        }
        else if (mode === 'login') {
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();

                if (data.success) {
                    toast.success('Login effettuato!');
                    onLogin(data.token, data.role, email); // Pass role and email
                } else if (res.status === 403 && data.error && data.error.includes('bloccato')) {
                    // Account bloccato
                    const msg = '🔒 Account bloccato. Contatta un amministratore per sbloccare l\'accesso.';
                    toast.error(msg);
                    setLocalError(msg);
                } else {
                    // Credenziali errate: mostra tentativi rimasti se disponibili
                    if (data.attemptsLeft !== undefined) {
                        if (data.attemptsLeft === 0) {
                            const msg = '🔒 Account bloccato per troppi tentativi. Contatta un amministratore.';
                            toast.error(msg);
                            setLocalError(msg);
                        } else {
                            const msg = `Credenziali non valide. Attenzione: ${data.attemptsLeft} tentativo/i rimasto/i prima del blocco.`;
                            toast.warning(msg);
                            setLocalError(msg);
                        }
                    } else {
                        toast.error('Credenziali non valide');
                        setLocalError('Credenziali non valide');
                    }
                }
            } catch (err) {
                toast.error('Errore di connessione');
                setLocalError('Errore di connessione al server');
            }
        }
    };

    if (mode === 'loading') {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white' }}>
                Caricamento...
            </div>
        );
    }

    if (mode === 'error') {
        return (
            <div style={{
                height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: 'white'
            }}>
                <div className="glass-panel" style={{
                    padding: '3rem', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1.5rem',
                    borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.5)', textAlign: 'center'
                }}>
                    <div style={{ background: 'rgba(239, 68, 68, 0.2)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                        <AlertCircle size={32} color="#ef4444" />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#ef4444' }}>
                        Errore di Connessione
                    </h2>
                    <p style={{ color: '#94a3b8' }}>
                        Impossibile contattare il server. Assicurati che il backend sia avviato.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="btn-primary"
                        style={{ justifyContent: 'center', padding: '0.8rem', background: '#ef4444' }}
                    >
                        Riprova
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: 'white'
        }}>
            <form onSubmit={handleSubmit} className="glass-panel" style={{
                padding: '3rem', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1.5rem',
                borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                    <div style={{ background: 'white', width: '90px', height: '90px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', overflow: 'hidden', boxShadow: '0 0 20px rgba(0,0,0,0.2)' }}>
                        <img
                            src="/images/logo-day.png"
                            alt="Arma dei Carabinieri"
                            style={{
                                width: '135%', // Sovradimensionato per "buttare fuori" lo sfondo del file
                                height: 'auto',
                                transform: 'translateY(0)',
                                imageRendering: 'auto'
                            }}
                        />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
                        {mode === 'login' && 'Accedi'}
                        {mode === 'register-admin' && 'Crea Admin'}
                        {mode === 'complete-registration' && 'Completa Registrazione'}
                        {mode === 'reset-password' && '🔒 Reimposta Password'}
                        {mode === 'recover' && 'Recupero Password'}
                    </h2>
                    <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                        {mode === 'login' && 'Entra nella dashboard'}
                        {mode === 'register-admin' && 'Configura il primo account amministratore'}
                        {mode === 'complete-registration' && `Imposta la password per ${email}`}
                        {mode === 'reset-password' && `Reimposta la password per ${email}`}
                        {mode === 'recover' && 'Inserisci la tua email'}
                    </p>
                </div>

                {localError && (
                    <div style={{
                        padding: '0.75rem',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        borderRadius: '8px',
                        color: '#fca5a5',
                        fontSize: '0.85rem',
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        animation: 'fadeIn 0.3s'
                    }}>
                        <AlertCircle size={16} />
                        <span style={{ flex: 1 }}>{localError}</span>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {(mode === 'register-admin' || mode === 'recover' || mode === 'login') && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#cbd5e1' }}>Email Amministratore</label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                    className="input-field" style={{ width: '100%', paddingLeft: '2.5rem' }} placeholder="admin@example.com" required={mode !== 'login'} />
                            </div>
                        </div>
                    )}

                    {mode !== 'recover' && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#cbd5e1' }}>Password</label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                    className="input-field" style={{ width: '100%', paddingLeft: '2.5rem' }} placeholder="••••••••" required />
                            </div>
                        </div>
                    )}

                    {(mode === 'register-admin' || mode === 'complete-registration' || mode === 'reset-password') && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#cbd5e1' }}>Conferma Password</label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="input-field" style={{ width: '100%', paddingLeft: '2.5rem' }} placeholder="••••••••" required />
                            </div>
                        </div>
                    )}
                </div>

                <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem', justifyContent: 'center', padding: '0.8rem' }}>
                    {mode === 'login' && 'Accedi'}
                    {mode === 'register-admin' && 'Crea Account'}
                    {mode === 'complete-registration' && 'Salva Password'}
                    {mode === 'reset-password' && 'Reimposta Password'}
                    {mode === 'recover' && 'Invia Token'}
                </button>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', fontSize: '0.8rem', color: '#64748b' }}>
                    {mode === 'login' && (
                        <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setMode('recover'); }}>Password dimenticata?</span>
                    )}
                    {mode !== 'login' && mode !== 'loading' && mode !== 'complete-registration' && mode !== 'register-admin' && ( // Only show back link if not in forced modes
                        <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }} onClick={() => { setMode('login'); }}>
                            <ArrowLeft size={14} /> Torna al Login
                        </span>
                    )}
                </div>
            </form>

            <div style={{
                position: 'absolute',
                bottom: '2rem',
                left: 0,
                right: 0,
                textAlign: 'center',
                fontSize: '0.75rem',
                color: 'rgba(148, 163, 184, 0.6)',
                lineHeight: '1.6',
                pointerEvents: 'none'
            }}>
                <p style={{ margin: 0, fontWeight: 500 }}>
                    Sviluppato dal Mar. Ord. Cristoforo De Rosa per il Monitoraggio Asset Cripto
                </p>
                <p style={{ margin: '4px 0' }}>
                    © {new Date().getFullYear()} Tutti i diritti riservati • Protezione dei dati e Privacy garantite
                </p>
                <p style={{ margin: 0, opacity: 0.8 }}>
                    Software Conforme alle Normative di Sicurezza vigenti
                </p>
            </div>
        </div>
    );
}
