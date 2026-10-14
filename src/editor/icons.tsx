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
  | 'info';

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
  fit: <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />,
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
