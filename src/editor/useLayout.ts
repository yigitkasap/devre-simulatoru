// Ekran genişliğine göre düzen (tasarım: DS-Tipo ve Main kırılma noktaları):
//   < 900 px        telefon: üst şerit, alt çubuk ve tek alt sayfa; yatay telefonda (yükseklik
//                   < 500 px) sağda yan panel ve dikey çubuk (L01, L02)
//   ≥ 900 px, dokunmatik   tablet (T01, T02): 72 px araç şeridi, dokunmatik İnceleme paneli, alt çubuk
//   900–1279 px     sıkışık masaüstü: kütüphane 56 px şerit, açılır kart olarak açılır
//   1280–1439 px    masaüstü: kütüphane 232 px
//   ≥ 1440 px       masaüstü: kütüphane 256 px
// Dokunmatik ekranda yükseklik 500 px'in altındaysa (yatay tutulan büyük telefon, 932 px gibi)
// genişlik 900 px'i aşsa da telefon düzeni kullanılır.
// Masaüstünde sağdaki defter 500 px, sıkışık masaüstünde 400 px (v3); tablette İnceleme paneli 320–340 px.
// CSS tarafında aynı sınır `desk:` (≥ 900 px) önekidir (global.css → --breakpoint-desk).

import { useEffect, useState } from 'react';

export type LayoutKind = 'phone' | 'tablet' | 'compact' | 'desktop';

export interface Layout {
  readonly kind: LayoutKind;
  /** Telefon yatay tutuluyor (yan panel ve dikey çubuk). */
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
  if (coarse) return { kind: 'tablet', landscape: false, libraryWidth: 340, inspectorWidth: width < 1100 ? 320 : 340 };
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
