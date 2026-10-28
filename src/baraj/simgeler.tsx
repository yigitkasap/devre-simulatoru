// Baraj sayfasına özel küçük simgeler: durumun biçimi (doluluk kartında; daire, onay, üçgen, sekizgen:
// renk tek başına anlam taşımaz), su akışı okları (▼ ■ ▲) ve devre panelindeki "Tüm devre" simgesi.

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

/** "Tüm devre" sekmesi: üst üste üç kat. */
export function FloorsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <rect x="3" y="3" width="14" height="4" rx="1" />
      <rect x="3" y="8" width="14" height="4" rx="1" />
      <rect x="3" y="13" width="14" height="4" rx="1" />
    </svg>
  );
}
