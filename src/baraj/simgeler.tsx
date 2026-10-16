// Baraj sayfasına özel küçük simgeler (tasarım: docs/tasarim/baraj): uyarı rozetinin biçimleri, prob
// damlası, su akışı okları, başa al, seviye numarası rozeti. Renk tek başına anlam taşımaz: uyarı
// simgesinin biçimi (daire, onay, üçgen, sekizgen) de durumu söyler.

import { LEVEL_COLORS, type LevelNo } from './seviye';

export type AlertKind = 'none' | 'normal' | 'warning' | 'danger';

export function AlertIcon({ kind, size = 20 }: { kind: AlertKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      {kind === 'none' && <circle cx="10" cy="10" r="7.5" fill="none" stroke="#8a95a3" strokeWidth="2" />}
      {kind === 'normal' && (
        <>
          <circle cx="10" cy="10" r="8.5" fill="#1b7d44" />
          <path d="M6 10.3l2.7 2.6L14 7.6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {kind === 'warning' && (
        <>
          <path d="M10 1.8L19 17.6H1Z" fill="#ffc107" stroke="#8a5a00" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M10 7v5" stroke="#1d2733" strokeWidth="2" strokeLinecap="round" />
          <circle cx="10" cy="14.9" r="1.2" fill="#1d2733" />
        </>
      )}
      {kind === 'danger' && (
        <>
          <path d="M6.7 1.5h6.6l4.7 4.7v6.6l-4.7 4.7H6.7L2 12.8V6.2Z" fill="#d92d20" />
          <path d="M10 5.6v5.4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="10" cy="14" r="1.3" fill="#fff" />
        </>
      )}
    </svg>
  );
}

/** Prob damlası: ıslakken dolu mavi, kuruyken boş. */
export function DropIcon({ wet, size = 16 }: { wet: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      {wet ? (
        <path d="M8 1.6C8 1.6 3 7.3 3 10.4a5 5 0 0 0 10 0C13 7.3 8 1.6 8 1.6Z" fill="#2f7fc4" />
      ) : (
        <path d="M8 2.2C8 2.2 3.5 7.6 3.5 10.4a4.5 4.5 0 0 0 9 0C12.5 7.6 8 2.2 8 2.2Z" fill="#fff" stroke="#8a95a3" strokeWidth="1.5" />
      )}
    </svg>
  );
}

/** Su akışı: aşağı üçgen (Boşalt), kare (Durdur), yukarı üçgen (Doldur). */
export function FlowIcon({ kind, size = 14 }: { kind: 'drain' | 'stop' | 'fill'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      {kind === 'drain' && <path d="M7 11.5L12.5 3H1.5Z" fill="currentColor" />}
      {kind === 'stop' && <rect x="2.5" y="2.5" width="9" height="9" rx="1.5" fill="currentColor" />}
      {kind === 'fill' && <path d="M7 2.5L12.5 11H1.5Z" fill="currentColor" />}
    </svg>
  );
}

export function ResetIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <path d="M4.5 10a5.5 5.5 0 1 0 1.8-4.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3.5 3v4.5H8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Seviye numarası rozeti (1 yeşil, 2 sarı, 3 kırmızı). */
export function LevelBadge({ level, size = 22 }: { level: LevelNo; size?: number }) {
  const c = LEVEL_COLORS[level];
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, background: c.badge, color: c.badgeInk, fontSize: Math.round(size * 0.6) }}
    >
      {level}
    </span>
  );
}
