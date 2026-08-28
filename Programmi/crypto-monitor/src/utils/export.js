export const generateCSV = (assets, filename = 'crypto-assets-export.csv') => {
    // Define Headers
    const headers = [
        'Indirizzo Wallet',
        'Asset (Nome)',
        'Simbolo',
        'Quantità',
        'Valore (Al momento)',
        'Network/Blockchain',
        'Intestatario (Indagato)',
        'Procedimento Penale',
        'Data Sequestro',
        'Stato'
    ];

    const rows = [];

    // Iterate through assets and their holdings
    assets.forEach(asset => {
        if (asset.holdings && Array.isArray(asset.holdings)) {
            asset.holdings.forEach(holding => {
                // Determine Status Label
                let statusLabel = 'Attivo';
                if (holding.status === 'confiscated') statusLabel = 'Confiscato';
                if (holding.status === 'released') statusLabel = 'Dissequestrato';
                if (holding.status === 'freezing') statusLabel = 'USDT Freezati (Congelato)';

                // Format Date - Prefer 'date' (Seizure Date)
                let dateStr = 'N/D';
                if (holding.date) {
                    try {
                        const d = holding.date.includes('T') ? holding.date.split('T')[0] : holding.date;
                        // Basic validation: must look like YYYY-MM-DD
                        if (d.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            dateStr = d;
                        } else if (d.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                            dateStr = d; // Already Italian format?
                        }
                    } catch (e) { console.warn('Date parse error', e); }
                }

                // If date is still N/D, try backfill from acquisition if available (and if it looks like a real date)


                // Field Priority: Suspect Name > Label (which is often just "Wallet X")
                // Only use Label if Suspect Name is missing/N/D
                let intestatario = holding.suspectName;
                if (!intestatario || intestatario === 'N/D') {
                    intestatario = holding.label || 'N/D';
                }

                // Value Calculation
                const price = asset.currentPrice || 0;
                const value = (parseFloat(holding.amount) * price).toFixed(2);

                rows.push([
                    holding.walletAddress || 'N/D',
                    asset.name,
                    asset.symbol.toUpperCase(),
                    holding.amount,
                    value,
                    holding.blockchain || asset.displayChain || 'N/D',
                    intestatario,
                    holding.proceeding || 'N/D',
                    dateStr,
                    statusLabel
                ]);
            });
        }
    });

    // Convert to CSV string with BOM for Excel compatibility
    const csvContent = [
        headers.join(';'), // Use semicolon for Excel/Italian locale compatibility usually
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    // Create Blob and Download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    // Create download link
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
