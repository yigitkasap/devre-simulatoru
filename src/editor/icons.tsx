// Arayüz simgeleri (projeye özel, basit çizgi simgeler).

import type { ReactNode } from 'react';

export type IconName =
  | 'menu'
  | 'pointer'
  | 'wire'
  | 'rotate'
  | 'trash'
  | 'undo'
  | 'redo'
  | 'zoomIn'
  | 'zoomOut'
  | 'fit'
  | 'settings'
  | 'close'
  | 'search'
  | 'play'
  | 'pause'
  | 'stop'
  | 'file'
  | 'share'
  | 'chevron'
  | 'book';

const PATHS: Record<IconName, ReactNode> = {
  menu: <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />,
  pointer: <path d="M5 3.2v12.6l3.4-3.3 2.4 5.3 2.1-.9-2.4-5.3h4.8z" strokeLinejoin="round" />,
  wire: (
    <>
      <path d="M4 15.5h5v-11h7" />
      <circle cx="4" cy="15.5" r="1.7" fill="currentColor" />
      <circle cx="16" cy="4.5" r="1.7" fill="currentColor" />
    </>
  ),
  rotate: (
    <>
      <path d="M15.6 11.2a5.8 5.8 0 1 1-1.7-5.3" />
      <path d="M14.5 2.8v3.6h-3.6" strokeLinejoin="round" />
    </>
  ),
  trash: (
    <>
      <path d="M3.5 5.5h13M8 5.5V3.8h4v1.7" />
      <path d="M5.2 5.5l.8 11h8l.8-11" strokeLinejoin="round" />
      <path d="M8.5 8.5v5.5M11.5 8.5v5.5" />
    </>
  ),
  undo: <path d="M7.5 4.5L4 8l3.5 3.5M4 8h8a4.2 4.2 0 0 1 0 8.4H9" strokeLinejoin="round" />,
  redo: <path d="M12.5 4.5L16 8l-3.5 3.5M16 8H8a4.2 4.2 0 0 0 0 8.4h3" strokeLinejoin="round" />,
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
  fit: <path d="M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4" strokeLinejoin="round" />,
  settings: (
    <>
      <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />
      <circle cx="7" cy="5.5" r="1.8" fill="var(--color-panel)" />
      <circle cx="13" cy="10" r="1.8" fill="var(--color-panel)" />
      <circle cx="9" cy="14.5" r="1.8" fill="var(--color-panel)" />
    </>
  ),
  close: <path d="M5 5l10 10M15 5L5 15" />,
  search: (
    <>
      <circle cx="8.8" cy="8.8" r="5.3" />
      <path d="M12.7 12.7L17 17" />
    </>
  ),
  play: <path d="M6 4.2v11.6L15.5 10z" fill="currentColor" strokeLinejoin="round" />,
  pause: <path d="M6.5 4.5v11M13.5 4.5v11" strokeWidth={2.6} />,
  stop: <rect x="5" y="5" width="10" height="10" rx="1.2" fill="currentColor" />,
  file: (
    <>
      <path d="M5.5 2.8h6l3 3v11.4h-9z" strokeLinejoin="round" />
      <path d="M11.5 2.8v3h3M7.8 10h4.4M7.8 13h4.4" strokeLinejoin="round" />
    </>
  ),
  share: (
    <>
      <path d="M8.6 11.4a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9" />
      <path d="M11.4 8.6a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9" />
    </>
  ),
  chevron: <path d="M7.5 5l5 5-5 5" strokeLinejoin="round" />,
  book: (
    <>
      <path d="M10 5.2C8.4 4 6.2 3.6 3.5 3.8v11.4c2.7-.2 4.9.2 6.5 1.4 1.6-1.2 3.8-1.6 6.5-1.4V3.8C13.8 3.6 11.6 4 10 5.2z" strokeLinejoin="round" />
      <path d="M10 5.2v11.4" />
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
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
