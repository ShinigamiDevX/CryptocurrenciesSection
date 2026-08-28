export const saveToDisk = async (assets) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `crypto-monitor-auto-backup.json`;

        const response = await fetch('/api/backup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filename: 'crypto-monitor-auto-backup.json',
                data: {
                    assets,
                    timestamp: new Date().toISOString(),
                    version: '1.0'
                }
            })
        });

        if (!response.ok) throw new Error('Backup failed');
        return await response.json();
    } catch (error) {
        console.error('Auto-backup failed:', error);
        return null; // Fail silently in UI, maybe log
    }
};

export const loadFromDisk = async () => {
    try {
        const response = await fetch('/api/backup');
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Failed to load backup');

        const json = await response.json();
        return json.assets || null;
    } catch (error) {
        console.error('Load from disk failed:', error);
        return null;
    }
};

export const listBackups = async () => {
    try {
        const response = await fetch('/api/backup/list');
        if (!response.ok) throw new Error('Failed to list backups');
        return await response.json();
    } catch (error) {
        console.error('List backups failed:', error);
        return [];
    }
};

export const loadBackupFile = async (filename) => {
    try {
        const response = await fetch(`/api/backup/${filename}`);
        if (!response.ok) throw new Error('Failed to load backup file');
        const json = await response.json();
        return json.assets || null;
    } catch (error) {
        console.error('Load specific backup failed:', error);
        throw error;
    }
};

export const exportToJSON = (assets) => {
    const dataStr = JSON.stringify({
        assets,
        timestamp: new Date().toISOString(),
        version: '1.0'
    }, null, 2);

    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Create link and download
    const link = document.createElement('a');
    link.href = url;
    link.download = `crypto-monitor-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
