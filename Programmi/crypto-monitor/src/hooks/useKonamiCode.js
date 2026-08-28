import { useEffect, useState } from 'react';

const KONAMI_CODE = [
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight'
];

export function useKonamiCode() {
    const [sequence, setSequence] = useState([]);
    const [activated, setActivated] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e) => {
            setSequence((prev) => {
                const newSequence = [...prev, e.code];

                // Keep only the last 10 keys
                if (newSequence.length > KONAMI_CODE.length) {
                    newSequence.shift();
                }

                // Check if sequence matches Konami Code
                if (newSequence.length === KONAMI_CODE.length) {
                    const isMatch = newSequence.every((key, index) => key === KONAMI_CODE[index]);
                    if (isMatch && !activated) {
                        setActivated(true);
                        console.log('%c🎮 CRYPTO UNLOCKED! 🎮', 'color: #fbbf24; font-size: 30px; font-weight: bold; text-shadow: 3px 3px 6px rgba(0,0,0,0.5);');
                        console.log('%c🚀 You found the secret! Cryptocurrency master mode activated!', 'color: #10b981; font-size: 16px;');

                        // Reset after 8 seconds
                        setTimeout(() => {
                            setActivated(false);
                            setSequence([]);
                        }, 8000);
                    }
                }

                return newSequence;
            });
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activated]);

    return activated;
}
