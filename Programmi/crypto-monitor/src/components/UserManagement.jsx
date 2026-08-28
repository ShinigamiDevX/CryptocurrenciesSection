import React, { useState, useEffect } from 'react';
import { User, Mail, Plus, Trash2, CheckCircle, XCircle, Shield, AlertCircle, RefreshCw, Lock, Unlock, ArrowLeft, Key } from 'lucide-react';

const getAuthHeaders = () => {
    const token = sessionStorage.getItem('auth_token');
    return token
        ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' };
};

export default function UserManagement({ onBack }) {
    const [users, setUsers] = useState([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [smtpConfig, setSmtpConfig] = useState(null);
    const [showSmtpForm, setShowSmtpForm] = useState(false);
    const [inviteRole, setInviteRole] = useState('viewer'); // Nuova selezione ruolo di default
    const [smtpForm, setSmtpForm] = useState({ host: '', port: 587, secure: false, auth: { user: '', pass: '' } });

    // New State for Logs & Views
    const [currentTab, setCurrentTab] = useState('users'); // 'users', 'logs', 'smtp'
    const [logs, setLogs] = useState([]);

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/list-users', {
                method: 'POST',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchSmtpConfig = async () => {
        try {
            const res = await fetch('/api/get-smtp-config', {
                method: 'POST',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.host) {
                    setSmtpConfig(data);
                    setSmtpForm({ ...data, auth: { ...data.auth, pass: '' } });
                }
            }
        } catch (e) { console.error(e); }
    };

    const fetchLogs = async () => {
        try {
            const res2 = await fetch('/api/logs', { headers: getAuthHeaders() });
            if (res2.ok) {
                const data = await res2.json();
                setLogs(data);
            }
        } catch (e) { console.error(e); }
    };

    const handleDeleteUser = async (email) => {
        if (!confirm(`Sei sicuro di voler eliminare l'utente ${email}? Questa azione è irreversibile.`)) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/users/${email}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                setMsg({ type: 'success', text: 'Utente eliminato con successo' });
                fetchUsers();
            } else {
                const data = await res.json();
                setMsg({ type: 'error', text: data.error || 'Errore eliminazione utente' });
            }
        } catch (e) {
            setMsg({ type: 'error', text: 'Errore durante l\'eliminazione' });
        }
        setLoading(false);
    };

    const handleUnlockUser = async (email) => {
        if (!confirm(`Sbloccare l'account di ${email}?`)) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(email)}/unlock`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                setMsg({ type: 'success', text: `Account ${email} sbloccato con successo` });
                fetchUsers();
            } else {
                const data = await res.json();
                setMsg({ type: 'error', text: data.error || 'Errore sblocco account' });
            }
        } catch (e) {
            setMsg({ type: 'error', text: 'Errore di connessione' });
        }
        setLoading(false);
    };

    const handleForceReset = async (email) => {
        if (!confirm(`Vuoi forzare il reset della password per l'utente ${email}? Verrà inviata un'email con il link di ripristino.`)) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(email)}/force-reset`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setMsg({ type: 'success', text: data.message || `Email di reset inviata a ${email}` });
            } else {
                setMsg({ type: 'error', text: data.error || 'Errore durante la richiesta di reset' });
            }
        } catch (e) {
            setMsg({ type: 'error', text: 'Errore di connessione' });
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchUsers();
        fetchSmtpConfig();
        fetchLogs();
    }, []);

    const sendInvite = async (emailToInvite, roleToInvite) => {
        setLoading(true);
        setMsg({ type: '', text: '' });
        try {
            const res = await fetch('/api/invite', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ email: emailToInvite, role: roleToInvite })
            });
            const data = await res.json();
            if (data.success) {
                setMsg({ type: 'success', text: `Invito inviato a ${emailToInvite}: ${data.message || 'OK'}` });
                setInviteEmail('');
                fetchUsers();
            } else {
                setMsg({ type: 'error', text: data.error || 'Errore invio invito' });
            }
        } catch (e) {
            setMsg({ type: 'error', text: 'Errore di connessione' });
        }
        setLoading(false);
    };

    const handleInviteSubmit = (e) => {
        e.preventDefault();
        sendInvite(inviteEmail, inviteRole);
    };

    const handleSaveSmtp = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch('/api/save-smtp-config', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(smtpForm)
            });
            const data = await res.json();
            if (data.success) {
                setMsg({ type: 'success', text: 'Configurazione SMTP salvata e testata!' });
                setSmtpConfig(smtpForm);
                setShowSmtpForm(false);
            } else {
                setMsg({ type: 'error', text: data.error || 'Errore configurazione SMTP' });
            }
        } catch (e) {
            setMsg({ type: 'error', text: 'Errore salvataggio SMTP' });
        }
        setLoading(false);
    };

    return (
        <div style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <h1 style={{ color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Shield size={32} color="var(--primary)" />
                    Gestione Utenti
                </h1>
                {onBack && (
                    <button
                        onClick={onBack}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
                    >
                        <ArrowLeft size={18} />
                        Torna alla Dashboard
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
                {['users', 'logs', 'smtp'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setCurrentTab(tab)}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: currentTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                            color: currentTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                            fontWeight: currentTab === tab ? 600 : 400,
                            cursor: 'pointer',
                            textTransform: 'capitalize'
                        }}
                    >
                        {tab === 'users' ? 'Utenti' : tab === 'logs' ? 'Registro Accessi' : 'Email (SMTP)'}
                    </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>

                {/* Users Tab */}
                {currentTab === 'users' && (
                    <>
                        {/* Invite Section Redesign */}
                        <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(37, 99, 235, 0.02) 100%)',
                                padding: '1.5rem',
                                borderBottom: '1px solid var(--border-color)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1.25rem'
                            }}>
                                <div style={{
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '16px',
                                    background: 'var(--bg-card)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: 'var(--shadow-sm)',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--primary)',
                                    flexShrink: 0
                                }}>
                                    <Mail size={28} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>Invita Nuovo Utente</h3>
                                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                                        Invia un'email di invito per abilitare un nuovo membro del team all'accesso.
                                    </p>
                                </div>
                            </div>

                            <div style={{ padding: '1.5rem' }}>
                                <form onSubmit={handleInviteSubmit} style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '1.25rem',
                                    alignItems: 'flex-end'
                                }}>
                                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Indirizzo Email
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                            <input
                                                type="email"
                                                placeholder="nome@agenzia.gov.it"
                                                className="input-field"
                                                style={{ paddingLeft: '2.5rem' }}
                                                value={inviteEmail}
                                                onChange={e => setInviteEmail(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Ruolo Assegnato
                                        </label>
                                        <select
                                            className="input-field"
                                            value={inviteRole}
                                            onChange={e => setInviteRole(e.target.value)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <option value="viewer">Lettore (Sola visualizzazione)</option>
                                            <option value="user">Editor (Gestione Asset)</option>
                                            <option value="admin">Amministratore (Pieno Controllo)</option>
                                        </select>
                                    </div>
                                    <div style={{ flex: '0 1 auto', minWidth: '160px' }}>
                                        <button
                                            type="submit"
                                            className="btn-primary"
                                            disabled={loading}
                                            style={{
                                                height: '42px',
                                                width: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.75rem',
                                                padding: '0 1.5rem',
                                                whiteSpace: 'nowrap',
                                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'translateY(-1px)';
                                                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'none';
                                                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                                            }}
                                        >
                                            {loading ? <RefreshCw size={18} className="spin" /> : <Plus size={20} />}
                                            <span>Invia Invito</span>
                                        </button>
                                    </div>
                                </form>

                                {msg.text && (
                                    <div style={{
                                        marginTop: '1.5rem',
                                        padding: '1rem',
                                        borderRadius: '12px',
                                        fontSize: '0.9rem',
                                        fontWeight: 500,
                                        background: msg.type === 'error' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                                        color: msg.type === 'error' ? '#ef4444' : '#10b981',
                                        border: `1px solid ${msg.type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        animation: 'fadeIn 0.3s ease-out'
                                    }}>
                                        {msg.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
                                        {msg.text}
                                    </div>
                                )}
                            </div>
                        </div>



                        {/* User List */}
                        <div className="glass-panel" style={{ padding: '1.5rem', gridColumn: '1 / -1' }}>
                            <h3 style={{ marginTop: 0, color: 'var(--text-main)', marginBottom: '1.5rem' }}>Utenti Registrati</h3>
                            <div style={{ width: '100%', overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text-main)' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                                            <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Email</th>
                                            <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Ruolo</th>
                                            <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Stato</th>
                                            <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Creato Il</th>
                                            <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Azioni</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map((user, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div style={{ background: 'var(--bg-app)', padding: '6px', borderRadius: '50%' }}>
                                                        <User size={16} color="var(--primary)" />
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        {user.email}
                                                        {user.status === 'invited' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => sendInvite(user.email)}
                                                                title="Reinvia Invito"
                                                                className="btn-secondary"
                                                                style={{ padding: '4px', height: 'auto', display: 'flex', border: 'none', background: 'transparent', cursor: 'pointer' }}
                                                            >
                                                                <RefreshCw size={14} color="#94a3b8" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <span style={{
                                                        padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                                                        background: user.role === 'admin' ? 'rgba(59, 130, 246, 0.2)'
                                                            : user.role === 'viewer' ? 'rgba(16, 185, 129, 0.15)'
                                                                : 'rgba(148, 163, 184, 0.2)',
                                                        color: user.role === 'admin' ? '#60a5fa'
                                                            : user.role === 'viewer' ? '#10b981'
                                                                : '#94a3b8'
                                                    }}>
                                                        {user.role === 'admin' ? 'ADMIN' : (user.role === 'viewer' ? 'VISUALIZZATORE' : 'EDITOR')}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                        <span style={{
                                                            padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                                                            background: user.status === 'active'
                                                                ? 'rgba(16, 185, 129, 0.2)'
                                                                : user.status === 'locked'
                                                                    ? 'rgba(239, 68, 68, 0.2)'
                                                                    : 'rgba(245, 158, 11, 0.2)',
                                                            color: user.status === 'active'
                                                                ? '#34d399'
                                                                : user.status === 'locked'
                                                                    ? '#ef4444'
                                                                    : '#fbbf24'
                                                        }}>
                                                            {user.status === 'active' ? 'ATTIVO'
                                                                : user.status === 'locked' ? '🔒 BLOCCATO'
                                                                    : 'INVITATO'}
                                                        </span>
                                                        {user.status === 'active' && user.failedLoginAttempts > 0 && (
                                                            <span style={{ fontSize: '0.7rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                                                ⚠ {user.failedLoginAttempts}/3 tentativi
                                                            </span>
                                                        )}
                                                        {user.status === 'locked' && user.lockedAt && (
                                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                                {new Date(user.lockedAt).toLocaleString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                                    {new Date(user.createdAt || Date.now()).toLocaleDateString()}
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                        {user.status === 'locked' && (
                                                            <button
                                                                onClick={() => handleUnlockUser(user.email)}
                                                                className="btn-secondary"
                                                                style={{ color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)', padding: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                                                                title="Sblocca Account"
                                                                disabled={loading}
                                                            >
                                                                <Unlock size={14} />
                                                                <span>Sblocca</span>
                                                            </button>
                                                        )}
                                                        {user.role !== 'admin' && user.status !== 'locked' && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleForceReset(user.email)}
                                                                    className="btn-secondary"
                                                                    style={{ color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.2)', padding: '6px' }}
                                                                    title="Forza Reset Password"
                                                                    disabled={loading}
                                                                >
                                                                    <Key size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteUser(user.email)}
                                                                    className="btn-secondary"
                                                                    style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)', padding: '6px' }}
                                                                    title="Elimina Utente"
                                                                    disabled={loading}
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                {/* SMTP Tab */}
                {currentTab === 'smtp' && (
                    <div style={{ gridColumn: '1 / -1' }}>
                        {/* SMTP Config Section (Collapsible) */}

                        <div className="glass-panel" style={{ padding: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Configurazione Email (SMTP)</h3>
                                <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }} onClick={() => setShowSmtpForm(!showSmtpForm)}>
                                    {showSmtpForm ? 'Chiudi' : (smtpConfig ? 'Modifica' : 'Configura')}
                                </button>
                            </div>

                            {!showSmtpForm && smtpConfig ? (
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <CheckCircle size={16} color="#10b981" />
                                        Configurato e attivo su <b>{smtpConfig.host}</b>
                                    </div>
                                </div>
                            ) : (
                                !showSmtpForm && <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Nessuna configurazione SMTP. Gli inviti verranno salvati su file.</div>
                            )}

                            {showSmtpForm && (
                                <form onSubmit={handleSaveSmtp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Host</label>
                                            <input className="input-field" style={{ width: '100%' }} value={smtpForm.host} onChange={e => setSmtpForm({ ...smtpForm, host: e.target.value })} placeholder="smtp.gmail.com" required />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Porta</label>
                                            <input className="input-field" style={{ width: '100%' }} type="number" value={smtpForm.port} onChange={e => setSmtpForm({ ...smtpForm, port: parseInt(e.target.value) })} required />
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Utente</label>
                                            <input className="input-field" style={{ width: '100%' }} value={smtpForm.auth.user} onChange={e => setSmtpForm({ ...smtpForm, auth: { ...smtpForm.auth, user: e.target.value } })} placeholder="email@gmail.com" required />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Password (App Password)</label>
                                            <input className="input-field" style={{ width: '100%' }} type="password" value={smtpForm.auth.pass} onChange={e => setSmtpForm({ ...smtpForm, auth: { ...smtpForm.auth, pass: e.target.value } })} placeholder="********" />
                                        </div>
                                    </div>
                                    <button type="submit" className="btn-primary" disabled={loading} style={{ justifyContent: 'center' }}>
                                        {loading ? 'Verifica e Salvataggio...' : 'Salva Configurazione'}
                                    </button>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                                        Nota: Per Gmail usa "App Password" se hai 2FA attivo.
                                    </p>
                                </form>
                            )}
                        </div>

                    </div>
                )}

                {/* Logs Tab */}
                {currentTab === 'logs' && (
                    <div className="glass-panel" style={{ padding: '1.5rem', gridColumn: '1 / -1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Registro Accessi (Crittografato)</h3>
                            <button onClick={fetchLogs} className="btn-secondary" title="Aggiorna">
                                <RefreshCw size={16} />
                            </button>
                        </div>

                        <div style={{ width: '100%', overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text-main)' }}>
                                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-app)', zIndex: 1 }}>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                                        <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Data/Ora</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Evento</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Email</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Stato</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>IP</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Dettagli</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                Nessun log trovato.
                                            </td>
                                        </tr>
                                    ) : (
                                        logs.map((log, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <span style={{
                                                        padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                                                        background: 'rgba(255, 255, 255, 0.1)'
                                                    }}>
                                                        {log.type.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem', fontWeight: 500 }}>
                                                    {log.email}
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <span style={{
                                                        padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                                                        background: log.status === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                        color: log.status === 'success' ? '#34d399' : '#ef4444'
                                                    }}>
                                                        {log.status === 'success' ? 'SUCCESS' : 'FAILED'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                                                    {log.ip}
                                                </td>
                                                <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                    {log.reason || '-'}
                                                    {log.role && <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>({log.role})</span>}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}
