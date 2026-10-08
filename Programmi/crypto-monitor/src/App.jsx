import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import BackupRestore from './components/BackupRestore';
import UserManagement from './components/UserManagement';
import { useAssetMonitor } from './hooks/useAssetMonitor';
import { useKonamiCode } from './hooks/useKonamiCode';
import { generateCSV } from './utils/export';
import { exportAssetsToPDF, generateProfessionalReport } from './utils/pdfExport';
import { checkHealth } from './services/api';
import './App.css';

import Login from './components/Login';
import KonamiCelebration from './components/KonamiCelebration';
import { ToastProvider, useToast } from './context/ToastContext';

// Separate authenticated component so useAssetMonitor is ONLY instantiated after login.
// This ensures the auth token is always present when initData calls the server.
function AuthenticatedApp({ userRole, userEmail, onLogout, currency, toggleCurrency, isDarkMode, toggleTheme, isOnline }) {
  const assetMonitor = useAssetMonitor(currency);
  const toast = useToast();
  const [currentView, setCurrentView] = useState('dashboard');
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (assetMonitor.error && isOnline) {
      toast.error(assetMonitor.error);
    }
  }, [assetMonitor.error, toast, isOnline]);

  const handleRestore = useCallback((restoredAssets) => {
    if (assetMonitor.restoreAssets) {
      assetMonitor.restoreAssets(restoredAssets);
    } else {
      console.error("restoreAssets function missing in assetMonitor");
    }
  }, [assetMonitor]);

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
        currency={currency}
        toggleCurrency={toggleCurrency}
        onExport={() => generateCSV(assetMonitor.assets)}
        onExportPDF={() => exportAssetsToPDF(assetMonitor.assets, assetMonitor.totalValue || 0, currency)}
        onPrint={async () => {
          const tid = toast.info("Preparazione grafici ad alta visibilità...");
          setIsExporting(true);

          // Wait for React to render the Export Mode
          await new Promise(r => setTimeout(r, 600));

          toast.update(tid, { content: "Generazione report professionale in corso..." });

          try {
            await generateProfessionalReport(
              assetMonitor.assets,
              {
                totalValue: assetMonitor.totalValue || 0,
                totalConfiscated: assetMonitor.totalConfiscated || 0,
                totalReleased: assetMonitor.totalReleased || 0
              },
              currency
            );
            toast.success("Report generato con successo!");
          } catch (err) {
            toast.error("Errore durante la generazione del report.");
            console.error(err);
          } finally {
            setIsExporting(false);
          }
        }}
        onOpenBackup={() => setIsBackupOpen(true)}
        userRole={userRole}
        userEmail={userEmail}
        onManageUsers={() => setCurrentView(prev => prev === 'users' ? 'dashboard' : 'users')}
        currentView={currentView}
        onLogout={onLogout}
        isOnline={isOnline}
      />
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {currentView === 'users' && userRole === 'admin' ? (
          <UserManagement onBack={() => setCurrentView('dashboard')} />
        ) : (
          <Dashboard
            currency={currency}
            userRole={userRole}
            isExporting={isExporting}
            {...assetMonitor}
          />
        )}
      </main>

      {isBackupOpen && (
        <BackupRestore
          assets={assetMonitor.assets}
          onRestore={handleRestore}
          onClose={() => setIsBackupOpen(false)}
        />
      )}
    </div>
  );
}

const ssoTicketRequests = new Map();

function consumeSsoTicket(ticket) {
  if (ssoTicketRequests.has(ticket)) return ssoTicketRequests.get(ticket);
  const req = fetch('/api/sso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  });
  ssoTicketRequests.set(ticket, req);
  return req;
}

function readPortalSsoTicket() {
  try {
    if (typeof window !== 'undefined' && window.__PORTAL_SSO_TICKET) {
      const t = String(window.__PORTAL_SSO_TICKET);
      delete window.__PORTAL_SSO_TICKET;
      return t;
    }
    return new URLSearchParams(window.location.search).get('sso') || '';
  } catch {
    return '';
  }
}

function App() {
  const [ssoTicket] = useState(() => readPortalSsoTicket());
  const [ssoBusy, setSsoBusy] = useState(() => !!ssoTicket);
  const [ssoError, setSsoError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!sessionStorage.getItem('auth_token'));
  const [userRole, setUserRole] = useState(() => sessionStorage.getItem('auth_role'));
  const [userEmail, setUserEmail] = useState(() => sessionStorage.getItem('auth_email') || '');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('isDarkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [currency, setCurrency] = useState(() => {
    const saved = localStorage.getItem('currency');
    return saved ? saved : 'eur';
  });
  const [isOnline, setIsOnline] = useState(true);

  // Monitor connection status
  useEffect(() => {
    const interval = setInterval(async () => {
      const status = await checkHealth();
      setIsOnline(status);
    }, 10000);
    checkHealth().then(setIsOnline);
    return () => clearInterval(interval);
  }, []);

  // Easter Egg: Konami Code
  const konamiActivated = useKonamiCode();

  const handleLogin = (token, role, email) => {
    sessionStorage.setItem('auth_token', token);
    sessionStorage.setItem('auth_role', role);
    if (email) sessionStorage.setItem('auth_email', email);
    setIsAuthenticated(true);
    setUserRole(role);
    setUserEmail(email || '');
  };

  useEffect(() => {
    if (!ssoTicket) {
      setSsoBusy(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { ok, data } = await consumeSsoTicket(ssoTicket);
        if (cancelled) return;
        if (ok && data.success && data.token) {
          handleLogin(data.token, data.role, data.email);
          setSsoError('');
        } else {
          sessionStorage.removeItem('auth_token');
          sessionStorage.removeItem('auth_role');
          sessionStorage.removeItem('auth_email');
          setIsAuthenticated(false);
          setSsoError(data.error || 'Accesso dal portale non riuscito. Riprova dalla dashboard.');
        }
      } catch {
        if (!cancelled) setSsoError('Portale non raggiungibile. Riprova dalla dashboard.');
      } finally {
        if (!cancelled) setSsoBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ssoTicket]);

  const handleLogout = () => {
    const confirmExit = window.confirm("Sei sicuro di voler uscire? Tutti gli inserimenti e le modifiche sono stati salvati sul database automatico.\n\nPremi OK per uscire.");
    if (!confirmExit) return;

    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_role');
    sessionStorage.removeItem('auth_email');
    setIsAuthenticated(false);
    setUserRole(null);
    setUserEmail('');
  };

  useEffect(() => {
    localStorage.setItem('isDarkMode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('currency', currency);
  }, [currency]);

  const toggleTheme = () => setIsDarkMode(prev => !prev);
  const toggleCurrency = () => setCurrency(prev => prev === 'eur' ? 'usd' : 'eur');

  const konamiOverlay = <KonamiCelebration active={konamiActivated} />;

  if (ssoBusy) {
    return (
      <>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary, #5ABBC8)' }}>
          Accesso dal portale in corso…
        </div>
        {konamiOverlay}
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        {ssoError ? (
          <div style={{
            position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
            zIndex: 50, maxWidth: 520, padding: '0.75rem 1rem', borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.45)',
            color: '#fecaca', textAlign: 'center', fontSize: 14,
          }}>
            {ssoError}
          </div>
        ) : null}
        <Login onLogin={handleLogin} />
        {konamiOverlay}
      </>
    );
  }

  return (
    <>
      <AuthenticatedApp
        userRole={userRole}
        userEmail={userEmail}
        onLogout={handleLogout}
        currency={currency}
        toggleCurrency={toggleCurrency}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
        isOnline={isOnline}
      />
      {konamiOverlay}
    </>
  );
}

export default function AppWrapper() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}

