// Ekran genişliğine göre düzen (tasarım: DS-Tipo ve Main kırılma noktaları):
//   < 900 px        telefon: kütüphane soldan açılan çekmece (6. aşamada alt çubuk ve alt sayfa)
//   900–1279 px     sıkışık masaüstü: kütüphane 56 px şerit, açılır kart olarak açılır
//   1280–1439 px    masaüstü: kütüphane 232 px
//   ≥ 1440 px       masaüstü: kütüphane 256 px
// İnceleme paneli ≥ 1440 px'te 336, altında 320 px.
// CSS tarafında aynı sınır `desk:` (≥ 900 px) önekidir (global.css → --breakpoint-desk).

import { useEffect, useState } from 'react';

export type LayoutKind = 'phone' | 'compact' | 'desktop';

export interface Layout {
  readonly kind: LayoutKind;
  /** Kütüphane açıkken genişliği (px). */
  readonly libraryWidth: number;
  /** Sağdaki İnceleme panelinin genişliği (px). */
  readonly inspectorWidth: number;
}

export const PHONE_MAX_WIDTH = 899;

function layoutFor(width: number): Layout {
  if (width <= PHONE_MAX_WIDTH) return { kind: 'phone', libraryWidth: 256, inspectorWidth: 0 };
  if (width < 1280) return { kind: 'compact', libraryWidth: 256, inspectorWidth: 320 };
  return width < 1440
    ? { kind: 'desktop', libraryWidth: 232, inspectorWidth: 320 }
    : { kind: 'desktop', libraryWidth: 256, inspectorWidth: 336 };
}

export function useLayout(): Layout {
  const [layout, setLayout] = useState(() => layoutFor(window.innerWidth));
  useEffect(() => {
    const update = () =>
      setLayout((current) => {
        const next = layoutFor(window.innerWidth);
        return next.kind === current.kind && next.libraryWidth === current.libraryWidth && next.inspectorWidth === current.inspectorWidth
          ? current
          : next;
      });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return layout;
}
