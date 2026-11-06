// "Kablo gerilimi" açıklama kutusu (analiz düzeltmeleri, 2): RC dolmada çekmece açıkken kutu toprak
// sembolünü ve alt kabloyu kapatıyordu. Sığdır kutuyu dışarıda bırakır; değmeyen devrede görünüm aynı.
// Telefonda (v4 düzeltmeleri, 1) sağ alttaki gerilim çipi ve tam ekran düğmesi de dışarıda bırakılır.

import { describe, expect, it } from 'vitest';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { circuitHits, circuitShapes, fitAvoiding, phoneCornerRect, type Rect } from '../src/editor/legendFit';
import { fitView } from '../src/editor/view';
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
