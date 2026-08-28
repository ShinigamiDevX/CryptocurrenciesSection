import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import '../components/Toast.css'; // Import styles

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const toastsRef = useRef([]);

    useEffect(() => {
        toastsRef.current = toasts;
    }, [toasts]);

    const addToast = useCallback((message, type = 'info') => {
        // Synchronous Deduplication: immediately check and update the ref
        if (toastsRef.current.some(t => t.message === message && t.type === type)) {
            return null;
        }

        const id = Date.now() + Math.random();
        const newToast = { id, message, type };

        // Update both source of truth and state
        toastsRef.current = [...toastsRef.current, newToast];
        setToasts(toastsRef.current);

        // Auto remove
        setTimeout(() => {
            toastsRef.current = toastsRef.current.filter(t => t.id !== id);
            setToasts(toastsRef.current);
        }, 5000);
        return id;
    }, []);

    const updateToast = useCallback((id, { message, content, type }) => {
        setToasts(prev => prev.map(t =>
            t.id === id ? { ...t, message: message || content, type: type || t.type } : t
        ));
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const value = useMemo(() => ({
        addToast,
        update: updateToast,
        success: (msg) => addToast(msg, 'success'),
        error: (msg) => addToast(msg, 'error'),
        info: (msg) => addToast(msg, 'info'),
        warning: (msg) => addToast(msg, 'warning')
    }), [addToast, updateToast]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className={`toast ${t.type}`} onClick={() => removeToast(t.id)}>
                        <span>{t.message}</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within ToastProvider');
    return context;
};
