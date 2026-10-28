// Arayüz simgeleri (projeye özel, 20×20 çizgi simgeler; tasarım: C-UstCubuk, C-Kutuphane,
// C-SimCubugu, M09).

import type { ReactNode } from 'react';

export type IconName =
  | 'menu'
  | 'pointer'
  | 'wire'
  | 'rotate'
  | 'flip'
  | 'trash'
  | 'undo'
  | 'redo'
  | 'zoomIn'
  | 'zoomOut'
  | 'minus'
  | 'plus'
  | 'fit'
  | 'fullscreen'
  | 'fullscreenExit'
  | 'sideLeft'
  | 'sideRight'
  | 'settings'
  | 'help'
  | 'close'
  | 'search'
  | 'play'
  | 'pause'
  | 'stop'
  | 'file'
  | 'fileNew'
  | 'download'
  | 'upload'
  | 'share'
  | 'chevron'
  | 'chevronDown'
  | 'chevronUp'
  | 'collapseLeft'
  | 'parts'
  | 'book'
  | 'saved'
  | 'speed'
  | 'info'
  | 'chat'
  | 'more'
  | 'panel'
  | 'measure'
  | 'devices'
  | 'lock'
  | 'external'
  | 'sun'
  | 'moon'
  | 'themeSystem'
  | 'tag'
  | 'camera'
  | 'dots'
  | 'board'
  | 'perfboard'
  | 'chip'
  | 'printer'
  | 'list'
  | 'shield'
  | 'copy'
  | 'check'
  | 'warning';

const PATHS: Record<IconName, ReactNode> = {
  menu: <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />,
  pointer: <path d="M5 3l10 6-4.5 1.2L13 15l-2 1-2.4-4.6L5 14z" />,
  wire: (
    <>
      <path d="M3 15h5V5h9" />
      <circle cx="3" cy="15" r="1.6" />
      <circle cx="17" cy="5" r="1.6" />
    </>
  ),
  rotate: (
    <>
      <path d="M15.5 8.5A6 6 0 1 0 16 13" />
      <path d="M16 3.5v5h-5" />
    </>
  ),
  flip: (
    <>
      <path d="M10 3v14" />
      <path d="M7 6L3 10l4 4z" />
      <path d="M13 6l4 4-4 4z" />
    </>
  ),
  trash: <path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" />,
  undo: <path d="M8 5L4 9l4 4M4 9h8a4 4 0 0 1 0 8H9" />,
  redo: <path d="M12 5l4 4-4 4M16 9H8a4 4 0 0 0 0 8h3" />,
  zoomIn: (
    <>
      <circle cx="8.8" cy="8.8" r="5.3" />
      <path d="M12.7 12.7L17 17M6.5 8.8h4.6M8.8 6.5v4.6" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="8.8" cy="8.8" r="5.3" />
      <path d="M12.7 12.7L17 17M6.5 8.8h4.6" />
    </>
  ),
  minus: <path d="M5 10h10" />,
  plus: <path d="M5 10h10M10 5v10" />,
  fit: (
    <>
      <path d="M3 6.5V3h3.5M13.5 3H17v3.5M17 13.5V17h-3.5M6.5 17H3v-3.5" />
      <rect x="7" y="7" width="6" height="6" rx="1.2" />
    </>
  ),
  fullscreen: <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />,
  fullscreenExit: <path d="M7 3v4H3M13 3v4h4M17 13h-4v4M3 13h4v4" />,
  sideLeft: (
    <>
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M8 4v12" />
    </>
  ),
  sideRight: (
    <>
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M12 4v12" />
    </>
  ),
  settings: (
    <>
      <path d="M3 6h8M15 6h2M3 14h2M9 14h8" />
      <circle cx="13" cy="6" r="2" />
      <circle cx="7" cy="14" r="2" />
    </>
  ),
  help: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7.8 7.8a2.2 2.2 0 1 1 3.2 2c-.7.4-1 .9-1 1.7" />
      <circle cx="10" cy="14.4" r=".5" fill="currentColor" />
    </>
  ),
  close: <path d="M5 5l10 10M15 5L5 15" />,
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M13 13l4 4" />
    </>
  ),
  play: <path d="M6 4l10 6-10 6z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="5" y="4" width="3.2" height="12" rx="1" fill="currentColor" stroke="none" />
      <rect x="11.8" y="4" width="3.2" height="12" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  stop: <rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />,
  file: (
    <>
      <path d="M5.5 2.8h6l3 3v11.4h-9z" />
      <path d="M11.5 2.8v3h3M7.8 10h4.4M7.8 13h4.4" />
    </>
  ),
  fileNew: (
    <>
      <path d="M5 2h7l4 4v12H5z" />
      <path d="M12 2v4h4M10.5 9v6M7.5 12h6" />
    </>
  ),
  download: <path d="M10 3v10M6 9l4 4 4-4M4 16h12" />,
  upload: <path d="M10 13V3M6 7l4-4 4 4M4 16h12" />,
  share: <path d="M8.5 11.5l3-3M7 9L5.5 10.5a3 3 0 0 0 4 4L11 13M13 11l1.5-1.5a3 3 0 0 0-4-4L9 7" />,
  external: <path d="M11.5 4H16v4.5M16 4l-7 7M14 11.5V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5" />,
  chevron: <path d="M7.5 5l5 5-5 5" />,
  chevronDown: <path d="M5 8l5 5 5-5" />,
  chevronUp: <path d="M5 12l5-5 5 5" />,
  collapseLeft: <path d="M11 5l-5 5 5 5M15 5l-5 5 5 5" />,
  parts: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <path d="M14 11v6M11 14h6" />
    </>
  ),
  book: <path d="M3 4h5a2 2 0 0 1 2 2v11a2 2 0 0 0-2-2H3zM17 4h-5a2 2 0 0 0-2 2v11a2 2 0 0 1 2-2h5z" />,
  saved: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M6.5 10l2.5 2.5 4.5-5" />
    </>
  ),
  speed: (
    <>
      <circle cx="10" cy="11" r="7" />
      <path d="M10 11l4-3M10 4V2" />
    </>
  ),
  info: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v5" />
      <circle cx="10" cy="6.3" r=".5" fill="currentColor" />
    </>
  ),
  chat: <path d="M4 4h12v9H8l-4 3z" />,
  more: (
    <>
      <circle cx="4.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="2.5" />
      <path d="M3 11h14M8 14h4" />
    </>
  ),
  measure: (
    <>
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M6 12.5l2.5-3 2.5 2 3-4" />
    </>
  ),
  devices: (
    <>
      <rect x="2" y="3.5" width="16" height="13" rx="2" />
      <path d="M5 13V6.5h6.5V13z" />
      <path d="M5.5 10.5c1-2 2-2 3 0s2 2 2.5 0M14.5 7.5v.01M14.5 10.5v.01M14.5 13v.01" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </>
  ),
  sun: (
    <>
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3L6 14M14 6l1.3-1.3" />
    </>
  ),
  moon: <path d="M16.2 12.4A6.6 6.6 0 0 1 7.6 3.8a6.6 6.6 0 1 0 8.6 8.6z" />,
  tag: (
    <>
      <path d="M3 9.6V4a1 1 0 0 1 1-1h5.6l7.9 7.9-6.6 6.6z" />
      <circle cx="6.8" cy="6.8" r="1.2" />
    </>
  ),
  camera: (
    <>
      <path d="M3 7.2a1.5 1.5 0 0 1 1.5-1.5h2.1l1.4-2h4l1.4 2h2.1A1.5 1.5 0 0 1 17 7.2v7.8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15z" />
      <circle cx="10" cy="11" r="2.9" />
    </>
  ),
  dots: (
    <>
      <path d="M2.5 10h15" opacity={0.45} />
      <circle cx="5" cy="10" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  themeSystem: (
    <>
      <circle cx="10" cy="10" r="6.6" />
      <path d="M10 3.4a6.6 6.6 0 0 1 0 13.2z" fill="currentColor" stroke="none" />
    </>
  ),
  // Karta aktar (K1–K4, L1–L2): kart, delikli plaket, entegre, yazıcı, liste, denetim, kopyala, onay, uyarı.
  board: (
    <>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
      <path d="M6 12.5V9h3.5v3.5H13V7.5" />
      <circle cx="13" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  perfboard: (
    <>
      <rect x="3" y="4" width="14" height="12" rx="2" />
      {[7, 10, 13].map((x) => [8, 12].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.9" fill="currentColor" stroke="none" />))}
    </>
  ),
  chip: (
    <>
      <rect x="5.5" y="5.5" width="9" height="9" rx="1.2" />
      <path d="M8 3v2.5M12 3v2.5M8 14.5V17M12 14.5V17M3 8h2.5M3 12h2.5M14.5 8H17M14.5 12H17" />
    </>
  ),
  printer: (
    <>
      <path d="M6 7.5V3h8v4.5M6 14H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1h-2" />
      <rect x="6" y="11.5" width="8" height="5.5" rx="0.6" />
    </>
  ),
  list: <path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9M3.5 5.5h.5M3.5 10h.5M3.5 14.5h.5" />,
  shield: (
    <>
      <path d="M10 2.8l6 2.3v4.6c0 3.6-2.5 6.3-6 7.5-3.5-1.2-6-3.9-6-7.5V5.1z" />
      <path d="M7.2 10l2 2 3.6-3.8" />
    </>
  ),
  copy: (
    <>
      <rect x="7" y="7" width="9.5" height="9.5" rx="1.5" />
      <path d="M13 4.8V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13h.3" />
    </>
  ),
  check: <path d="M4.5 10.5l3.5 3.5 7.5-8" />,
  warning: (
    <>
      <path d="M10 3l7.5 13.5h-15z" />
      <path d="M10 8.5v3.5M10 14.3v.1" />
    </>
  ),
};

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
