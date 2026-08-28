import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { formatCurrency, formatCrypto, formatDate } from './formatting';

/**
 * Esportazione tabellare rapida (paesaggio) - LISTA SEMPLICE
 */
export const exportAssetsToPDF = (assets, totalValue, currency = 'eur') => {
    try {
        const doc = new jsPDF({ orientation: 'landscape' });
        const now = new Date().toLocaleString('it-IT');

        doc.setFontSize(22);
        doc.setTextColor(44, 62, 80);
        doc.text('Monitoraggio Asset Sequestrati - Elenco Dati', 14, 22);

        doc.setFontSize(10);
        doc.setTextColor(127, 140, 141);
        doc.text(`Generato il: ${now}`, 14, 30);
        doc.text(`Valore Totale: ${formatCurrency(totalValue, currency)}`, 14, 36);

        const tableData = [];
        const statusMap = { 'active': 'ATTIVO', 'confiscated': 'CONFISCATO', 'released': 'DISSEQUESTRATO' };

        assets.forEach(asset => {
            asset.holdings.forEach(h => {
                let dataSequestro = formatDate(h.date);
                let dataConfiscato = 'N/D';
                let dataDissequestro = 'N/D';
                let dataFreezing = 'N/D';

                if (h.status === 'confiscated') {
                    dataConfiscato = formatDate(h.statusDate || h.date);
                } else if (h.status === 'released') {
                    dataDissequestro = formatDate(h.statusDate || h.date);
                } else if (h.status === 'freezing') {
                    dataFreezing = formatDate(h.statusDate || h.date);
                }

                let displayStatus = h.status.toUpperCase();
                if (h.status === 'freezing') displayStatus = 'FREEZATO';
                else displayStatus = statusMap[h.status] || displayStatus;

                tableData.push([
                    asset.symbol.toUpperCase(),
                    formatCrypto(h.amount, asset.symbol),
                    h.injuredPartyName || 'N/D',
                    h.suspectName || 'N/D',
                    h.proceeding || 'N/D',
                    h.walletAddress || 'N/D',
                    dataSequestro,
                    dataConfiscato,
                    dataDissequestro,
                    dataFreezing,
                    displayStatus
                ]);
            });
        });

        autoTable(doc, {
            startY: 45,
            head: [['Asset', 'Quantità', 'Parte Offesa', 'Indagato', 'Procedimento', 'Indirizzo Wallet', 'Data Seq.', 'Data Conf.', 'Data Disseq.', 'Data Freez.', 'Stato']],
            body: tableData,
            headStyles: { fillColor: [44, 62, 80], fontSize: 6, halign: 'left' },
            styles: { fontSize: 6, cellPadding: 2, overflow: 'linebreak' },
            columnStyles: {
                0: { cellWidth: 12 },  // Asset
                1: { cellWidth: 18 },  // Quantità
                2: { cellWidth: 30 },  // Parte Offesa
                3: { cellWidth: 30 },  // Indagato
                4: { cellWidth: 30 },  // Procedimento
                5: { cellWidth: 50 },  // Wallet
                6: { cellWidth: 17 },  // Data Seq
                7: { cellWidth: 17 },  // Data Conf
                8: { cellWidth: 17 },  // Data Diss
                9: { cellWidth: 17 },  // Data Freez
                10: { cellWidth: 22 }  // Stato
            },
            margin: { left: 14, right: 14 }
        });

        const filename = `Esportazione_Dati_${new Date().toISOString().split('T')[0]}.pdf`;

        // Workaround to bypass Internet Download Manager (IDM) and other interceptors
        // Convert to arraybuffer and use octet-stream so download managers ignore it, 
        // forcing the browser to respect the `download` filename.
        const pdfArrayBuffer = doc.output('arraybuffer');
        const blob = new Blob([pdfArrayBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
        console.error("PDF Export Error:", e);
    }
};

/**
 * Esportazione PDF per una specifica sezione di stato (Freezati, Confiscati, Dissequestrati)
 */
export const exportStatusToPDF = (filteredItems, totalValue, statusLabel, currency = 'eur') => {
    try {
        const doc = new jsPDF({ orientation: 'landscape' });
        const now = new Date().toLocaleString('it-IT');

        doc.setFontSize(22);
        doc.setTextColor(44, 62, 80);
        doc.text(`Report ${statusLabel}`, 14, 22);

        doc.setFontSize(10);
        doc.setTextColor(127, 140, 141);
        doc.text(`Generato il: ${now}`, 14, 30);
        doc.text(`Valore Totale: ${formatCurrency(totalValue, currency)}`, 14, 36);
        doc.text(`Numero Asset: ${filteredItems.length}`, 14, 42);

        const tableData = [];

        filteredItems.forEach(item => {
            const dataOperazione = item.statusDate
                ? formatDate(item.statusDate)
                : formatDate(item.date);

            tableData.push([
                (item.assetSymbol || '').toUpperCase(),
                formatCrypto(item.amount, item.assetSymbol || ''),
                formatCurrency(item.value, currency),
                item.injuredPartyName || 'N/D',
                item.suspectName || 'N/D',
                item.proceeding || item.legalProceeding || 'N/D',
                item.walletAddress || 'N/D',
                formatDate(item.date),
                dataOperazione,
                item.blockchain || 'N/D'
            ]);
        });

        autoTable(doc, {
            startY: 50,
            head: [['Asset', 'Quantità', 'Controvalore', 'Parte Offesa', 'Indagato', 'Procedimento', 'Indirizzo Wallet', 'Data Seq.', `Data ${statusLabel.includes('Freez') ? 'Freezing' : (statusLabel.includes('Conf') ? 'Confisca' : 'Disseq.')}`, 'Blockchain']],
            body: tableData,
            headStyles: { fillColor: [44, 62, 80], fontSize: 7, halign: 'left' },
            styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
            columnStyles: {
                0: { cellWidth: 14 },
                1: { cellWidth: 22 },
                2: { cellWidth: 24 },
                3: { cellWidth: 30 },
                4: { cellWidth: 30 },
                5: { cellWidth: 35 },
                6: { cellWidth: 50 },
                7: { cellWidth: 19 },
                8: { cellWidth: 19 },
                9: { cellWidth: 25 }
            },
            margin: { left: 14, right: 14 }
        });

        const filename = `Report_${statusLabel.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

        const pdfArrayBuffer = doc.output('arraybuffer');
        const blob = new Blob([pdfArrayBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
        console.error("Status PDF Export Error:", e);
    }
};

/**
 * Cattura un elemento DOM come immagine base64 ottimizzata per PDF
 */
const captureElement = async (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    try {
        const canvas = await html2canvas(el, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            onclone: (clonedDoc) => {
                const clonedEl = clonedDoc.getElementById(id);
                if (clonedEl) {
                    clonedEl.style.backgroundColor = '#ffffff';
                    clonedEl.style.padding = '20px';
                }
            }
        });
        return {
            imgData: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height
        };
    } catch (e) {
        console.error(`Error capturing element ${id}:`, e);
        return null;
    }
};

/**
 * REPORT ISTITUZIONALE COMPLETO (Seizure Report Style) - MEETING QUALITY
 */
export const generateProfessionalReport = async (assets, stats, currency = 'eur') => {
    try {
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const now = new Date().toLocaleString('it-IT');
        const pageWidth = 210;
        const margin = 15;
        const contentWidth = pageWidth - (margin * 2);
        let currentY = 0;

        // --- 1. TOP HEADER BANNER (Institutional Style) ---
        doc.setFillColor(20, 40, 80);
        doc.rect(0, 0, pageWidth, 40, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.text("CRYPTO-MONITOR SEIZURE REPORT", margin, 20);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`DOCUMENTO GENERATO IL: ${now.toUpperCase()}`, margin, 32);
        doc.text(`RIEPILOGO ASSET E ANALISI OPERATIVA`, pageWidth - margin, 32, { align: "right" });

        currentY = 50;

        // --- 2. EXECUTIVE SUMMARY (Cards) ---
        const drawSummaryCard = (label, value, x, y, w, h, color, textColor = [255, 255, 255]) => {
            doc.setFillColor(color[0], color[1], color[2]);
            doc.roundedRect(x, y, w, h, 2, 2, 'F');
            doc.setFontSize(8);
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            doc.setFont("helvetica", "bold");
            doc.text(label.toUpperCase(), x + 5, y + 8);
            doc.setFontSize(14);
            doc.text(value, x + 5, y + 18);
        };

        const cardW = (contentWidth - 10) / 3;
        const cardH = 25;

        drawSummaryCard("Patrimonio Monitorato", formatCurrency(stats.totalValue, currency), margin, currentY, cardW, cardH, [37, 99, 235]); // Blue
        drawSummaryCard("Asset Recuperati (Confiscati)", formatCurrency(stats.totalConfiscated, currency), margin + cardW + 5, currentY, cardW, cardH, [21, 128, 61]); // GREEN
        drawSummaryCard("Asset Restituiti (Rilasciati)", formatCurrency(stats.totalReleased, currency), margin + (cardW + 5) * 2, currentY, cardW, cardH, [185, 28, 28]); // RED

        // --- 3. DASHBOARD VISUALS ---
        currentY += 35;
        doc.setFontSize(14);
        doc.setTextColor(40, 60, 100);
        doc.setFont("helvetica", "bold");
        doc.text("ANALISI DISTRIBUZIONE PATRIMONIALE", margin, currentY);

        currentY += 8;
        const pieResult = await captureElement('pie-chart-export');
        if (pieResult) {
            const ratio = pieResult.height / pieResult.width;
            const targetW = 75;
            const targetH = targetW * ratio;
            doc.addImage(pieResult.imgData, 'PNG', margin, currentY, targetW, targetH);

            const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#84cc16'];

            const legendData = assets.filter(a => a.totalValue > 0).sort((a, b) => b.totalValue - a.totalValue).slice(0, 10).map((a, i) => [
                "", // Placeholder for color box
                a.name,
                formatCrypto(a.amount, a.symbol),
                `${((a.totalValue / stats.totalValue) * 100).toFixed(1)}%`
            ]);

            if (legendData.length > 0) {
                autoTable(doc, {
                    startY: currentY,
                    head: [['', 'Asset', 'Quantità', '%']],
                    body: legendData,
                    margin: { left: margin + targetW + 10 },
                    tableWidth: contentWidth - targetW - 10,
                    styles: { fontSize: 9, cellPadding: 2.1 },
                    headStyles: { fillColor: [40, 60, 100] },
                    columnStyles: { 0: { cellWidth: 8 } },
                    theme: 'striped',
                    didDrawCell: (data) => {
                        if (data.section === 'body' && data.column.index === 0) {
                            const color = COLORS[data.row.index % COLORS.length];
                            doc.setFillColor(color);
                            const posX = data.cell.x + 2;
                            const posY = data.cell.y + 1;
                            doc.rect(posX, posY, 4, 4, 'F');
                        }
                    }
                });
            }

            currentY += Math.max(targetH, (doc.lastAutoTable?.finalY || currentY) - currentY) + 12;
        } else {
            currentY += 80;
        }

        // --- 4. TREND STORICO (FIXED SCALE) ---
        if (currentY > 195) { doc.addPage(); currentY = 20; }

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(40, 60, 100);
        doc.text("ANDAMENTO STORICO WALLET", margin, currentY);

        currentY += 8;
        const historyResult = await captureElement('history-chart-export');
        if (historyResult) {
            const ratio = historyResult.height / historyResult.width;
            const targetW = contentWidth;
            const targetH = targetW * ratio;

            let finalW = targetW;
            let finalH = targetH;
            if (finalH > 80) {
                finalH = 80;
                finalW = finalH / ratio;
            }

            doc.addImage(historyResult.imgData, 'PNG', margin + (contentWidth - finalW) / 2, currentY, finalW, finalH);
            currentY += finalH + 15;
        }

        // --- 5. DETTAGLIO ANALITICO RAGGRUPPATI PER ASSET ---
        const drawStatusSection = (title, statusKey, headColor) => {
            const groupedData = {};

            assets.forEach(asset => {
                const holdings = asset.holdings.filter(h => h.status === statusKey);
                if (holdings.length > 0) {
                    groupedData[asset.name] = holdings;
                }
            });

            if (Object.keys(groupedData).length === 0) return;

            if (currentY > 230) { doc.addPage(); currentY = 20; }

            doc.setFontSize(13);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(headColor[0], headColor[1], headColor[2]);
            doc.text(title.toUpperCase(), margin, currentY);
            currentY += 5;

            Object.entries(groupedData).forEach(([assetName, holdings], index) => {
                if (currentY > 240) { doc.addPage(); currentY = 20; }
                else if (index > 0) { currentY += 5; }

                // Asset Header Row
                doc.setFillColor(220, 230, 240);
                doc.rect(margin, currentY, contentWidth, 8, 'F');
                doc.setFontSize(11);
                doc.setTextColor(20, 40, 80);
                doc.setFont("helvetica", "bold");
                doc.text(`ASSET: ${assetName.toUpperCase()}`, margin + 3, currentY + 5.5);
                currentY += 8;

                const rows = holdings.map(h => {
                    let dataSequestro = formatDate(h.date);
                    let dataConfiscato = 'N/D';
                    let dataDissequestro = 'N/D';

                    if (h.status === 'confiscated') {
                        dataConfiscato = formatDate(h.statusDate || h.date);
                    } else if (h.status === 'released') {
                        dataDissequestro = formatDate(h.statusDate || h.date);
                    }

                    return [
                        h.suspectName || 'N/D',
                        h.proceeding || 'N/D',
                        formatCrypto(h.amount),
                        dataSequestro,
                        dataConfiscato,
                        dataDissequestro
                    ];
                });

                autoTable(doc, {
                    startY: currentY,
                    head: [['Indagato', 'Procedimento', 'Quantità', 'Data Sequestro', 'Data Confiscato', 'Data Disseq.']],
                    body: rows,
                    theme: 'grid',
                    headStyles: { fillColor: headColor, fontSize: 7, halign: 'left' },
                    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
                    columnStyles: {
                        0: { cellWidth: 35 }, // Indagato
                        1: { cellWidth: 40 }, // Procedimento
                        2: { cellWidth: 25 }, // Quantità
                        3: { cellWidth: 26 }, // Seq
                        4: { cellWidth: 26 }, // Conf
                        5: { cellWidth: 28 }  // Diss
                    },
                    margin: { left: margin, right: margin },
                    didDrawPage: (data) => { currentY = data.cursor.y; }
                });
                currentY = doc.lastAutoTable.finalY + 8;
            });
            currentY += 5;
        };

        doc.addPage();
        currentY = 20;
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text("ALLEGATI ANALITICI DI DETTAGLIO", margin, currentY);
        currentY += 10;

        drawStatusSection("Asset in Corso di Sequestro", "active", [44, 62, 80]);
        drawStatusSection("Asset Recuperati (Confiscati)", "confiscated", [21, 128, 61]);
        drawStatusSection("Asset Restituiti (Dissequestrati)", "released", [185, 28, 28]);
        drawStatusSection("Asset (USDT Freezati)", "freezing", [6, 182, 212]);

        // --- FOOTER ---
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setDrawColor(200);
            doc.line(margin, 282, pageWidth - margin, 282);
            doc.setFontSize(8);
            doc.setTextColor(120);
            doc.text(`Crypto-Monitor Seizure Report | Copia Riservata Interna`, margin, 288);
            doc.text(`Pagina ${i} di ${pageCount}`, pageWidth - margin, 288, { align: "right" });
        }

        const filename = `Seizure_Report_Cripto_${new Date().toISOString().split('T')[0]}.pdf`;

        // Workaround to bypass Internet Download Manager (IDM) and other interceptors
        // Convert to arraybuffer and use octet-stream so download managers ignore it, 
        // forcing the browser to respect the `download` filename.
        const pdfArrayBuffer = doc.output('arraybuffer');
        const blob = new Blob([pdfArrayBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
        console.error("Professional PDF Error:", error);
        alert("Errore generazione report: " + error.message);
    }
};
