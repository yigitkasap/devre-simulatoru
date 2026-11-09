// "Kablo gerilimi" açıklama kutusu (analiz düzeltmeleri, 2): RC dolmada çekmece açıkken kutu toprak
// sembolünü ve alt kabloyu kapatıyordu. Sığdır kutuyu dışarıda bırakır; değmeyen devrede görünüm aynı.
// Telefonda (v4 düzeltmeleri, 1) sağ alttaki gerilim çipi ve tam ekran düğmesi de dışarıda bırakılır.

import { describe, expect, it } from 'vitest';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { circuitHits, circuitShapes, fitAvoiding, phoneCornerRect, readableAvoiding, type Rect } from '../src/editor/legendFit';
import { fitView, PHONE_READABLE_SCALE, readableFit } from '../src/editor/view';
import { GRID } from '../src/model/types';
import type { Box } from '../src/model/catalog';
import { unionBox } from '../src/model/geometry';

/** Devrenin kutusu (Sığdır'ın kullandığı gibi etiketler için pay). */
function boxOf(shapes: ReturnType<typeof circuitShapes>): Box {
  let box: Box | null = null;
  for (const b of shapes.boxes) box = unionBox(box, b);
  for (const [xa, ya, xb, yb] of shapes.segments) box = unionBox(box, { x: Math.min(xa, xb), y: Math.min(ya, yb), w: Math.abs(xb - xa), h: Math.abs(yb - ya) });
  return { x: box!.x - 2, y: box!.y - 4, w: box!.w + 4, h: box!.h + 6 };
}

describe('Kablo gerilimi kutusu', () => {
  // Masaüstü, çekmece açık: tuval 940 × 460 px; kutu sol altta (12 px içeride) 206 × 100 px.
  const width = 940;
  const height = 460;
  const legend: Rect = { x: 12, y: height - 12 - 100, w: 206, h: 100 };

  it('RC dolma: düz sığdırmada kutu devreye değer; Sığdır kutuyu dışarıda bırakır, devre fazla küçülmez', () => {
    const shapes = circuitShapes(exampleDoc('rc-dolma')!);
    const box = boxOf(shapes);
    const plain = fitView(box, width, height, 48);
    expect(circuitHits(shapes, plain, legend)).toBe(true);
    const view = fitAvoiding(shapes, box, width, height, 48, legend);
    expect(circuitHits(shapes, view, legend)).toBe(false);
    expect(view.scale).toBeGreaterThan(plain.scale * 0.6);
    // Devre tuvalin içinde kalır.
    const g = 10 * view.scale;
    expect(box.x * g + view.x).toBeGreaterThanOrEqual(0);
    expect((box.x + box.w) * g + view.x).toBeLessThanOrEqual(width);
    expect((box.y + box.h) * g + view.y).toBeLessThanOrEqual(height);
  });

  it('kutuya değmeyen devrede görünüm düz sığdırmayla aynı; kutu yoksa (telefon) de', () => {
    const shapes = circuitShapes(exampleDoc('rc-dolma')!);
    const box = boxOf(shapes);
    const far: Rect = { x: 12, y: height + 200, w: 206, h: 100 };
    expect(fitAvoiding(shapes, box, width, height, 48, far)).toEqual(fitView(box, width, height, 48));
    expect(fitAvoiding(shapes, box, width, height, 48, null)).toEqual(fitView(box, width, height, 48));
  });
});

describe('Telefon: sağ alttaki gerilim çipi ve tam ekran düğmesi', () => {
  // Dikey telefonun şema kutusu (390 × 270 px) ve yatay telefonun kısa kutusu (844 × 120 px); Sığdır'ın kenar payı 20 px.
  const boxes = [
    { width: 390, height: 270 },
    { width: 844, height: 120 },
  ];
  it.each(EXAMPLE_IDS)('%s: Sığdır sonrası devre sağ alt köşeye (çip + düğme) değmiyor', (id) => {
    const shapes = circuitShapes(exampleDoc(id)!);
    const box = boxOf(shapes);
    for (const { width, height } of boxes) {
      const corner = phoneCornerRect(width, height);
      const view = fitAvoiding(shapes, box, width, height, 20, corner);
      expect(circuitHits(shapes, view, corner, 0)).toBe(false);
    }
  });
  it('köşe: 44 px düğme kenardan 10 px, çip için 120 px ve 8 px aralık', () => {
    expect(phoneCornerRect(390, 270)).toEqual({ x: 390 - 10 - 172, y: 270 - 10 - 44, w: 172, h: 44 });
  });
});

describe('Telefon: okunur yakınlık (telefon arayüzü taraması, 3)', () => {
  const corner = (w: number, h: number) => phoneCornerRect(w, h);
  it('LED ve ön direnç: 375 × 224 px şema kutusunda sığdırma %49; okunur sığdırma %90, devre ortada', () => {
    const shapes = circuitShapes(exampleDoc('led-on-direnc')!);
    const box = boxOf(shapes);
    const fitted = fitAvoiding(shapes, box, 375, 224, 20, corner(375, 224));
    expect(fitted.scale).toBeLessThan(0.6);
    const view = readableFit(fitted, box, 375, 224, 0, PHONE_READABLE_SCALE);
    expect(view.scale).toBe(PHONE_READABLE_SCALE);
    // Kutunun ortası alanın ortasında.
    expect((box.x + box.w / 2) * GRID * view.scale + view.x).toBeCloseTo(375 / 2, 6);
    expect((box.y + box.h / 2) * GRID * view.scale + view.y).toBeCloseTo(224 / 2, 6);
  });
  it('okunur yakınlıkta sığan devrede görünüm sığdırmayla aynı', () => {
    const fitted = { x: 10, y: 20, scale: 1.2 };
    expect(readableFit(fitted, { x: 0, y: 0, w: 10, h: 10 }, 390, 270, 0, PHONE_READABLE_SCALE)).toBe(fitted);
  });
  it.each(EXAMPLE_IDS)('%s: 390 × 270 px kutuda okunur yakınlıkta; sığıyorsa sağ alt köşeye değmeyen bir yere yaslanır', (id) => {
    const shapes = circuitShapes(exampleDoc(id)!);
    const box = boxOf(shapes);
    const c = corner(390, 270);
    const fitted = fitAvoiding(shapes, box, 390, 270, 20, c);
    const view = readableAvoiding(shapes, fitted, box, 390, 270, 0, 20, c, PHONE_READABLE_SCALE);
    expect(view.scale).toBeGreaterThanOrEqual(PHONE_READABLE_SCALE);
    const g = GRID * view.scale;
    const fits = box.w * g <= 390 - 40 && box.h * g <= 270 - 40;
    // Sığan devre köşeye değiyorsa dört konumun (orta, yukarı, sola, sol üst) hepsi değiyordur: orta seçilir.
    if (fits && circuitHits(shapes, view, c)) expect(view).toEqual(readableFit(fitted, box, 390, 270, 0, PHONE_READABLE_SCALE));
  });
  it('üstte ayrılan pay (bilgi kartı) alanın ortasını aşağı kaydırır', () => {
    const box = { x: 0, y: 0, w: 100, h: 100 };
    const view = readableFit({ x: 0, y: 0, scale: 0.3 }, box, 390, 270, 48, PHONE_READABLE_SCALE);
    expect(50 * GRID * view.scale + view.y).toBeCloseTo(48 + (270 - 48) / 2, 6);
  });
});
