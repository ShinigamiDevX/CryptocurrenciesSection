import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from './Header';
import { describe, it, expect, vi } from 'vitest';

describe('Header', () => {
    const defaultProps = {
        isDarkMode: false,
        toggleTheme: vi.fn(),
        currency: 'eur',
        toggleCurrency: vi.fn(),
        onExport: vi.fn(),
        onOpenBackup: vi.fn(),
        userRole: 'admin',
        onManageUsers: vi.fn(),
        currentView: 'dashboard',
        onLogout: vi.fn(),
    };

    it('renders correctly', () => {
        render(<Header {...defaultProps} />);
        expect(screen.getByText(/Seizure Monitoring/i)).toBeInTheDocument();
        expect(screen.getByText(/System Online/i)).toBeInTheDocument();
        expect(screen.getByText('EUR')).toBeInTheDocument();
    });

    it('toggles currency on click', () => {
        render(<Header {...defaultProps} />);
        const button = screen.getByText('EUR');
        fireEvent.click(button);
        expect(defaultProps.toggleCurrency).toHaveBeenCalledTimes(1);
    });

    it('calls onLogout when logout button is clicked', () => {
        render(<Header {...defaultProps} />);
        const logoutBtn = screen.getByRole('button', { name: /Logout/i });
        fireEvent.click(logoutBtn);
        expect(defaultProps.onLogout).toHaveBeenCalledTimes(1);
    });

    it('shows admin actions when userRole is admin', () => {
        render(<Header {...defaultProps} userRole="admin" />);
        // Check for specific admin buttons like Backup or Users
        // Note: The text is "Utenti" and "Backup" in Header.jsx
        expect(screen.getByText('Utenti')).toBeInTheDocument();
        expect(screen.getByText('Backup')).toBeInTheDocument();
    });

    it('hides admin actions when userRole is not admin', () => {
        render(<Header {...defaultProps} userRole="user" />);
        expect(screen.queryByText('Utenti')).not.toBeInTheDocument();
        expect(screen.queryByText('Backup')).not.toBeInTheDocument();
    });
});
