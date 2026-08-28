import { describe, it, expect } from 'vitest';
import { formatCurrency, formatCrypto, formatCompactNumber } from './formatting';

describe('Formatting Utils', () => {
    describe('formatCurrency', () => {
        it('should format EUR correctly', () => {
            const result = formatCurrency(1234.56, 'eur');
            console.log('EUR Format Result:', result); // Debug
            // Check for 1.234,56 OR 1234,56 (optional thousands separator)
            expect(result).toMatch(/1[.,]?234[,.]56/);
            expect(result).toContain('€');
        });

        it('should format USD correctly', () => {
            const result = formatCurrency(1234.56, 'usd');
            console.log('USD Format Result:', result); // Debug
            expect(result).toMatch(/1[.,]?234[,.]56/);
            expect(result.toUpperCase()).toContain('USD');
        });

        it('should handle zero', () => {
            const result = formatCurrency(0);
            expect(result).toMatch(/0[,.]00/);
        });

        it('should handle small amounts (dust)', () => {
            const result = formatCurrency(0.000123);
            expect(result).toMatch(/0[,.]000123/);
        });
    });

    describe('formatCrypto', () => {
        it('should format standard crypto amount', () => {
            const result = formatCrypto(1.23456789);
            // IT locale uses comma for decimal
            expect(result).toBe('1,23456789');
        });
    });
});
