/**
 * Parses a localized number string (IT: 1.000,50) into a float (1000.50).
 * Handles both "1.234,56" and "1234.56" inputs gracefully.
 */
export const parseLocaleNumber = (stringNumber) => {
    if (!stringNumber) return 0;

    // Normalize string
    const cleanStr = stringNumber.toString().trim();

    // Check if it's already a standard number format (1234.56) without thousands separators using points
    // Regex for standard float: ^[0-9]*\.?[0-9]+$
    if (/^[0-9]*\.?[0-9]+$/.test(cleanStr)) {
        return parseFloat(cleanStr);
    }

    // Assume Italian format: remove points (thousands), replace comma with dot
    const standardFormat = cleanStr
        .replace(/\./g, '') // Remove thousands separator
        .replace(',', '.'); // Replace decimal separator

    return parseFloat(standardFormat);
};

/**
 * Formats a number as Euro currency (IT locale).
 * Ex: 1000.50 -> "1.000,50"
 */
export const formatCurrency = (amount, currency = 'eur') => {
    if (amount === undefined || amount === null) return '-';
    // Handle very small numbers (crypto dust)
    if (amount > 0 && amount < 0.01) {
        return new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: currency.toUpperCase(),
            currencyDisplay: 'narrowSymbol',
            minimumFractionDigits: 6,
            maximumFractionDigits: 6
        }).format(amount);
    }

    return new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency: currency.toUpperCase(),
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
};

export const formatCompactNumber = (number) => {
    if (number === undefined || number === null) return '-';
    if (number === 0) return '0';

    const abs = Math.abs(number);

    if (abs >= 1.0e9) {
        // Billions
        return (number / 1.0e9).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + 'B';
    } else if (abs >= 1.0e6) {
        // Millions
        return (number / 1.0e6).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + 'M';
    } else if (abs >= 1.0e3) {
        // Thousands
        return (number / 1.0e3).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + 'k';
    } else {
        return number.toLocaleString('it-IT', { maximumFractionDigits: 0 });
    }
};

/**
 * Formats a crypto amount (up to 6 decimals, IT locale).
 */
export const formatCrypto = (value) => {
    if (value === undefined || value === null) return '0';
    return value.toLocaleString('it-IT', {
        maximumFractionDigits: 8
    });
};
/**
 * Formats a date string or object to DD-MM-YYYY.
 */
export const formatDate = (dateStr) => {
    if (!dateStr || dateStr === 'N/D') return 'N/D';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    } catch (e) {
        return dateStr;
    }
};
