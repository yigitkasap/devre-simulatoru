// Tam ekran kipi (masaüstü ve tablet): tarayıcı tam ekrana geçer (F11 gibi; Fullscreen API) ve
// yalnızca devre şeması kalır: sol (kütüphane / araç şeridi) ve sağ (İnceleme paneli) gizlenir, üst
// çubuktaki düğmelerle istenirse açılır. Esc ya da tarayıcının kendi çıkışı kipi de kapatır.
// Tarayıcı tam ekranı desteklemiyor ya da reddediyorsa (iPhone Safari, iframe) yalnızca paneller gizlenir.

import { useEffect, useRef, useState } from 'react';

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

function fullscreenElement(): Element | null {
  const d = document as WebkitDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

async function requestBrowserFullscreen(): Promise<boolean> {
  const el = document.documentElement as WebkitElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
    return fullscreenElement() !== null;
  } catch {
    return false;
  }
}

function exitBrowserFullscreen(): void {
  const d = document as WebkitDocument;
  if (!fullscreenElement()) return;
  try {
    const done = d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.();
    if (done instanceof Promise) done.catch(() => {});
  } catch {
    // Zaten çıkılmış.
  }
}

export interface FocusPanels {
  /** Sol taraf: kütüphane (masaüstü) ya da araç şeridi (tablet). */
  readonly left: boolean;
  /** Sağ taraf: İnceleme paneli. */
  readonly right: boolean;
}

export interface FocusMode {
  /** Tam ekran kipi açık mı (tarayıcı tam ekranı olmasa da). */
  readonly on: boolean;
  /** Kip açıkken istenerek açılan paneller; kip kapalıyken ikisi de true. */
  readonly panels: FocusPanels;
  readonly toggle: () => void;
  readonly showPanel: (side: keyof FocusPanels, open: boolean) => void;
}

const HIDDEN: FocusPanels = { left: false, right: false };
const SHOWN: FocusPanels = { left: true, right: true };

/** @param beforeEnter Panel gizlenmeden önce çağrılır (devre yeni alana sığsın diye). */
export function useFocusMode(beforeEnter: () => void): FocusMode {
  const [on, setOn] = useState(false);
  const [panels, setPanels] = useState<FocusPanels>(HIDDEN);
  /** Kip tarayıcı tam ekranıyla mı açıldı: tam ekrandan çıkılınca (Esc) kip de kapanır. */
  const browser = useRef(false);

  useEffect(() => {
    const onChange = () => {
      if (fullscreenElement() === null && browser.current) {
        browser.current = false;
        setOn(false);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const toggle = () => {
    if (on) {
      browser.current = false;
      setOn(false);
      exitBrowserFullscreen();
      return;
    }
    beforeEnter();
    setPanels(HIDDEN);
    setOn(true);
    void requestBrowserFullscreen().then((ok) => {
      browser.current = ok;
    });
  };

  return {
    on,
    panels: on ? panels : SHOWN,
    toggle,
    showPanel: (side, open) => setPanels((p) => ({ ...p, [side]: open })),
  };
}
