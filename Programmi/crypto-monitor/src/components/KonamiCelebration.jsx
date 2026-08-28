/* eslint-disable react-hooks/purity */
import React from 'react';
export default function KonamiCelebration({ active }) {
  if (!active) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'linear-gradient(45deg, rgba(59, 130, 246, 0.3), rgba(249, 115, 22, 0.3), rgba(16, 185, 129, 0.3))',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      animation: 'pulse 0.5s ease-in-out infinite',
      pointerEvents: 'none'
    }}>
      {/* Party Poppers - Corner positions shooting confetti */}
      {[
        { top: '10%', left: '10%', angle: 45 },
        { top: '10%', right: '10%', angle: 135 },
        { bottom: '20%', left: '15%', angle: -45 },
        { bottom: '20%', right: '15%', angle: -135 }
      ].map((pos, popperIdx) => (
        <React.Fragment key={`popper-group-${popperIdx}`}>
          {/* Popper Emoji */}
          <div style={{
            position: 'absolute',
            fontSize: '3rem',
            animation: 'pop 0.6s ease-out infinite',
            animationDelay: `${popperIdx * 0.15}s`,
            ...pos
          }}>
            🎊
          </div>

          {/* Confetti burst from this popper */}
          {Array.from({ length: 12 }).map((_, i) => {
            const spreadAngle = pos.angle + (i - 6) * 15; // Spread in cone
            const distance = 50 + Math.random() * 100;
            const radians = (spreadAngle * Math.PI) / 180;
            const endX = Math.cos(radians) * distance;
            const endY = Math.sin(radians) * distance;

            return (
              <div
                key={`burst-${popperIdx}-${i}`}
                style={{
                  position: 'absolute',
                  width: '8px',
                  height: '8px',
                  backgroundColor: ['#f7931a', '#627eea', '#23292f', '#0033ad', '#00ffa3', '#c3a634', '#26a17b', '#f3ba2f'][Math.floor(Math.random() * 8)],
                  borderRadius: Math.random() > 0.5 ? '50%' : '0',
                  animation: `burst 1s ease-out infinite`,
                  animationDelay: `${popperIdx * 0.15 + i * 0.05}s`,
                  '--end-x': `${endX}px`,
                  '--end-y': `${endY}px`,
                  opacity: 0,
                  ...pos
                }}
              />
            );
          })}
        </React.Fragment>
      ))}

      {/* Confetti Elements - Fast falling */}
      {Array.from({ length: 80 }).map((_, i) => (
        <div
          key={`confetti-${i}`}
          style={{
            position: 'absolute',
            top: '-10px',
            left: `${Math.random() * 100}%`,
            width: '12px',
            height: '12px',
            backgroundColor: ['#fbbf24', '#ef4444', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#f97316'][Math.floor(Math.random() * 7)],
            opacity: 0.9,
            borderRadius: Math.random() > 0.5 ? '50%' : '0',
            animation: `fall ${1 + Math.random() * 2}s linear infinite`,
            animationDelay: `${Math.random() * 1.5}s`,
            transform: `rotate(${Math.random() * 360}deg)`
          }}
        />
      ))}

      {/* Streamers/Festoni - Long ribbons */}
      {Array.from({ length: 15 }).map((_, i) => (
        <div
          key={`streamer-${i}`}
          style={{
            position: 'absolute',
            top: '-50px',
            left: `${5 + i * 6}%`,
            width: '4px',
            height: `${40 + Math.random() * 60}px`,
            background: `linear-gradient(to bottom, ${['#f7931a', '#627eea', '#23292f', '#0033ad', '#00ffa3'][Math.floor(Math.random() * 5)]}, transparent)`,
            opacity: 0.7,
            borderRadius: '2px',
            animation: `fallStreamer ${1.5 + Math.random() * 2}s ease-in infinite`,
            animationDelay: `${Math.random() * 1}s`,
            transform: `rotate(${-20 + Math.random() * 40}deg)`
          }}
        />
      ))}

      {/* Balloons - Rising from bottom */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={`balloon-${i}`}
          style={{
            position: 'absolute',
            bottom: '-50px',
            left: `${5 + i * 4.5}%`,
            fontSize: '4rem',
            animation: `rise ${3 + Math.random() * 3}s ease-in infinite`,
            animationDelay: `${Math.random() * 2}s`,
            filter: `hue-rotate(${Math.random() * 360}deg)`
          }}
        >
          🎈
        </div>
      ))}

      {/* Fireworks - Rotating in corners */}
      {[
        { top: '15%', left: '5%' },
        { top: '15%', right: '5%' },
        { bottom: '15%', left: '5%' },
        { bottom: '15%', right: '5%' }
      ].map((pos, i) => (
        <div key={`firework-${i}`} style={{
          position: 'absolute',
          fontSize: '3rem',
          animation: 'spin 2s linear infinite',
          animationDelay: `${i * 0.2}s`,
          ...pos
        }}>
          🎆
        </div>
      ))}

      {/* Sparkles - Random positions */}
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={`sparkle-${i}`}
          style={{
            position: 'absolute',
            top: `${10 + Math.random() * 80}%`,
            left: `${10 + Math.random() * 80}%`,
            fontSize: '1.5rem',
            animation: `twinkle ${0.5 + Math.random() * 1}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 2}s`,
            opacity: 0
          }}
        >
          ₿
        </div>
      ))}

      {/* Disco Ball - Center top */}
      <div style={{
        position: 'absolute',
        top: '5%',
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: '4rem',
        animation: 'spin 3s linear infinite'
      }}>
        🪩
      </div>

      {/* Explosions - Pulsing */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={`explosion-${i}`}
          style={{
            position: 'absolute',
            top: `${20 + Math.random() * 60}%`,
            left: `${10 + Math.random() * 80}%`,
            fontSize: '2.5rem',
            animation: 'pulse 0.8s ease-in-out infinite',
            animationDelay: `${Math.random() * 1.5}s`
          }}
        >
          💥
        </div>
      ))}

      {/* Golden Stars - Rotating */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={`goldstar-${i}`}
          style={{
            position: 'absolute',
            top: `${15 + Math.random() * 70}%`,
            left: `${5 + Math.random() * 90}%`,
            fontSize: '2rem',
            animation: `spin ${1.5 + Math.random() * 2}s linear infinite`,
            animationDelay: `${Math.random() * 1}s`
          }}
        >
          ₿
        </div>
      ))}

      {/* Regular Stars - Twinkling */}
      {Array.from({ length: 15 }).map((_, i) => (
        <div
          key={`star-${i}`}
          style={{
            position: 'absolute',
            top: `${10 + Math.random() * 80}%`,
            left: `${5 + Math.random() * 90}%`,
            fontSize: '1.8rem',
            animation: `twinkle ${0.6 + Math.random() * 1.2}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 1.5}s`,
            opacity: 0
          }}
        >
          ⭐
        </div>
      ))}

      <div style={{
        fontSize: '4rem',
        fontWeight: 'bold',
        color: 'white',
        textShadow: '3px 3px 10px rgba(0,0,0,0.8)',
        animation: 'bounce 0.5s ease-in-out infinite',
        zIndex: 10000
      }}>
        🎮 CRYPTO UNLOCKED! 🎮
      </div>
      <style>{`
        @keyframes fall {
          0% {
            transform: translateY(0) translateX(0) rotate(0deg);
          }
          25% {
            transform: translateY(25vh) translateX(${-20 + Math.random() * 40}px) rotate(180deg);
          }
          50% {
            transform: translateY(50vh) translateX(${-40 + Math.random() * 80}px) rotate(360deg);
          }
          75% {
            transform: translateY(75vh) translateX(${-20 + Math.random() * 40}px) rotate(540deg);
          }
          100% {
            transform: translateY(105vh) translateX(0) rotate(720deg);
            opacity: 0;
          }
        }
        @keyframes fallStreamer {
          0% {
            transform: translateY(0) rotate(${-30 + Math.random() * 60}deg);
          }
          50% {
            transform: translateY(50vh) rotate(${-60 + Math.random() * 120}deg) translateX(${-30 + Math.random() * 60}px);
          }
          100% {
            transform: translateY(105vh) rotate(${-90 + Math.random() * 180}deg);
            opacity: 0;
          }
        }
        @keyframes pop {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-10deg); }
          50% { transform: rotate(15deg); }
          75% { transform: rotate(-5deg); }
        }
        @keyframes burst {
          0% {
            transform: translate(0, 0) rotate(0deg);
            opacity: 1;
          }
          30% {
            opacity: 1;
            transform: translate(calc(var(--end-x) * 0.3), calc(var(--end-y) * 0.3)) rotate(120deg);
          }
          60% {
            opacity: 1;
            transform: translate(calc(var(--end-x) * 0.7), calc(var(--end-y) * 0.7)) rotate(240deg);
          }
          100% {
            transform: translate(var(--end-x), var(--end-y)) rotate(360deg);
            opacity: 0;
          }
        }
        @keyframes rise {
          0% {
            transform: translateY(0) rotate(0deg) translateX(0);
            opacity: 1;
          }
          25% {
            transform: translateY(-25vh) rotate(${-15 + Math.random() * 30}deg) translateX(${-30 + Math.random() * 60}px);
          }
          50% {
            transform: translateY(-50vh) rotate(${-30 + Math.random() * 60}deg) translateX(${-50 + Math.random() * 100}px);
          }
          75% {
            transform: translateY(-75vh) rotate(${-15 + Math.random() * 30}deg) translateX(${-30 + Math.random() * 60}px);
          }
          100% {
            transform: translateY(-110vh) rotate(0deg) translateX(0);
            opacity: 0;
          }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(90deg); }
          50% { transform: rotate(180deg); }
          75% { transform: rotate(270deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0; transform: rotate(0deg); }
          25% { opacity: 0.5; transform: rotate(90deg); }
          50% { opacity: 1; transform: rotate(180deg); }
          75% { opacity: 0.5; transform: rotate(270deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
