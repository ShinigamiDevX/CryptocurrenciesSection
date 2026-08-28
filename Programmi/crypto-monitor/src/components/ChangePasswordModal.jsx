import React, { useState } from 'react';
import { X, Lock, Save, AlertCircle } from 'lucide-react';

export default function ChangePasswordModal({ onClose }) {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [status, setStatus] = useState({ type: '', message: '' });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (newPassword.length < 8) {
            setStatus({ type: 'error', message: 'La nuova password deve essere di almeno 8 caratteri.' });
            return;
        }

        if (newPassword !== confirmPassword) {
            setStatus({ type: 'error', message: 'Le nuove password non coincidono.' });
            return;
        }

        setLoading(true);
        setStatus({ type: '', message: '' });

        try {
            const token = sessionStorage.getItem('auth_token');
            const res = await fetch('/api/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ oldPassword, newPassword })
            });

            const data = await res.json();
            if (data.success) {
                setStatus({ type: 'success', message: 'Password aggiornata con successo!' });
                setOldPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setTimeout(() => {
                    onClose();
                }, 2000);
            } else {
                setStatus({ type: 'error', message: data.error || 'Si è verificato un errore.' });
            }
        } catch (error) {
            setStatus({ type: 'error', message: 'Errore di connessione al server.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
        }}>
            <div style={{
                backgroundColor: 'var(--bg-card)',
                padding: '24px',
                borderRadius: '12px',
                width: '90%',
                maxWidth: '400px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                border: '1px solid var(--border-color)',
                position: 'relative'
            }}>
                <button
                    onClick={onClose}
                    style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                    <X size={20} />
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                    <Lock color="var(--primary)" size={24} />
                    <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Cambia Password</h3>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            Password Attuale
                        </label>
                        <input
                            type="password"
                            className="input-field"
                            value={oldPassword}
                            onChange={e => setOldPassword(e.target.value)}
                            required
                            style={{ width: '100%', padding: '10px' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            Nuova Password (min 8 caratteri)
                        </label>
                        <input
                            type="password"
                            className="input-field"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            required
                            style={{ width: '100%', padding: '10px' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            Conferma Nuova Password
                        </label>
                        <input
                            type="password"
                            className="input-field"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                            style={{ width: '100%', padding: '10px' }}
                        />
                    </div>

                    {status.message && (
                        <div style={{
                            padding: '10px',
                            borderRadius: '8px',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: status.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                            color: status.type === 'error' ? '#ef4444' : '#22c55e'
                        }}>
                            {status.type === 'error' && <AlertCircle size={16} />}
                            {status.message}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={loading}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', marginTop: '8px' }}
                    >
                        <Save size={18} />
                        {loading ? 'Salvataggio...' : 'Salva Nuova Password'}
                    </button>
                </form>
            </div>
        </div>
    );
}
