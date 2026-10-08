import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Easter Egg: Console Art & Copyright Notice
console.log('%c🚨 PROPRIETARY SOFTWARE 🚨', 'color: #ef4444; font-size: 24px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);');
console.log('%c⚠️  UNAUTHORIZED ACCESS PROHIBITED', 'color: #f59e0b; font-size: 16px; font-weight: bold;');
console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #3b82f6;');
console.log('%c🛡️  Cryptocurrency Seizure Monitoring System', 'color: #10b981; font-size: 18px; font-weight: bold;');
console.log('%c📋 Developed for: Arma dei Carabinieri', 'color: #06b6d4; font-size: 14px;');
console.log('%c👨‍💻 Developer: CRISTOFORO', 'color: #8b5cf6; font-size: 14px; font-weight: bold;');
console.log('%c📅 Copyright © 2026 - All Rights Reserved', 'color: #48ec87ff; font-size: 12px;');
console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #3b82f6;');
console.log('%c💡 Tip: Try the secret code (↑↓←→) for a surprise!', 'color: #64748b; font-size: 11px; font-style: italic;');
console.log(' ');

import ErrorBoundary from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
