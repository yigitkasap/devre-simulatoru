// Ekran genişliğine göre düzen (tasarım: DS-Tipo ve Main kırılma noktaları):
//   < 900 px        telefon (v3: DP1–DP4): üst çubuk, şema kutusu, altında defter, iki yüzen düğme;
//                   yatay telefonda (yükseklik < 500 px) aynı düzen, şema kutusu daha kısa
//   ≥ 900 px, dokunmatik   tablet: masaüstünün defter düzeni, dokunmatik boyutta (44 px)
//   900–1279 px     sıkışık masaüstü
//   ≥ 1280 px       masaüstü
// Dokunmatik ekranda yükseklik 500 px'in altındaysa (yatay tutulan büyük telefon, 932 px gibi)
// genişlik 900 px'i aşsa da telefon düzeni kullanılır.
// Sağdaki defter 1280 px ve üstünde 500 px, altında 400 px (v3; tablette de).
// CSS tarafında aynı sınır `desk:` (≥ 900 px) önekidir (global.css → --breakpoint-desk).

import { useEffect, useState } from 'react';

export type LayoutKind = 'phone' | 'tablet' | 'compact' | 'desktop';

export interface Layout {
  readonly kind: LayoutKind;
  /** Telefon yatay tutuluyor (şema kutusu daha kısa). */
  readonly landscape: boolean;
  /** Kütüphane açıkken genişliği (px). */
  readonly libraryWidth: number;
  /** Sağdaki İnceleme panelinin genişliği (px). */
  readonly inspectorWidth: number;
}

export const PHONE_MAX_WIDTH = 899;
/** Bu yüksekliğin altında ve genişlik yükseklikten büyükse yatay telefon düzeni. */
const LANDSCAPE_MAX_HEIGHT = 499;

function coarsePointer(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches === true;
}

function layoutFor(width: number, height: number): Layout {
  const short = height <= LANDSCAPE_MAX_HEIGHT && width > height;
  const coarse = coarsePointer();
  if (width <= PHONE_MAX_WIDTH || (short && coarse)) {
    return { kind: 'phone', landscape: short, libraryWidth: 256, inspectorWidth: 0 };
  }
  if (coarse) return { kind: 'tablet', landscape: false, libraryWidth: 340, inspectorWidth: width < 1280 ? 400 : 500 };
  if (width < 1280) return { kind: 'compact', landscape: false, libraryWidth: 256, inspectorWidth: 400 };
  return width < 1440
    ? { kind: 'desktop', landscape: false, libraryWidth: 232, inspectorWidth: 500 }
    : { kind: 'desktop', landscape: false, libraryWidth: 256, inspectorWidth: 500 };
}

export function useLayout(): Layout {
  const [layout, setLayout] = useState(() => layoutFor(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const update = () =>
      setLayout((current) => {
        const next = layoutFor(window.innerWidth, window.innerHeight);
        return next.kind === current.kind &&
          next.landscape === current.landscape &&
          next.libraryWidth === current.libraryWidth &&
          next.inspectorWidth === current.inspectorWidth
          ? current
          : next;
      });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return layout;
}
