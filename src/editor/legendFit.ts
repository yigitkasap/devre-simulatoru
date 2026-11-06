// Tuvalin alt köşesindeki kutular (masaüstünde sol alttaki yakınlaştırma grubu, telefonda sağ alttaki gerilim
// çipi ve tam ekran düğmesi) devrenin üstüne binmesin: Sığdır kutuyu görünür alanın dışında sayar (devre kutuya
// değecekse alttan ya da yandan pay bırakılır). Saf işlevler (testler çağırır).

import type { Box } from '../model/catalog';
import { partBounds } from '../model/geometry';
import { GRID, type CircuitDoc } from '../model/types';
import { METER_DISPLAY, meterDisplayRect } from './PartView';
import { fitView, type View } from './view';

/** Ekran dikdörtgeni (px, tuvalin sol üst köşesine göre). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Devrenin çizilen parçaları (ızgara biriminde): parça kutuları, ölçü aleti ekranları ve kablo parçaları. */
export interface CircuitShapes {
  readonly boxes: readonly Box[];
  readonly segments: readonly (readonly [number, number, number, number])[];
}

export function circuitShapes(doc: CircuitDoc): CircuitShapes {
  const boxes: Box[] = [];
  for (const part of doc.parts) {
    boxes.push(partBounds(part));
    if (METER_DISPLAY.has(part.type)) boxes.push(meterDisplayRect(part, false));
  }
  const segments: [number, number, number, number][] = [];
  for (const wire of doc.wires) {
    for (let i = 1; i < wire.points.length; i++) {
      const a = wire.points[i - 1]!;
      const b = wire.points[i]!;
      segments.push([a.x, a.y, b.x, b.y]);
    }
  }
  return { boxes, segments };
}

/** Devrenin bir parçası ya da kablosu, verilen görünümde ekran dikdörtgenine (pad px payla) değiyor mu. */
export function circuitHits(shapes: CircuitShapes, view: View, rect: Rect, pad = 6): boolean {
  const g = GRID * view.scale;
  const x0 = rect.x - pad;
  const y0 = rect.y - pad;
  const x1 = rect.x + rect.w + pad;
  const y1 = rect.y + rect.h + pad;
  const overlaps = (ax: number, ay: number, bx: number, by: number) => ax <= x1 && bx >= x0 && ay <= y1 && by >= y0;
  for (const b of shapes.boxes) {
    const ax = b.x * g + view.x;
    const ay = b.y * g + view.y;
    if (overlaps(ax, ay, ax + b.w * g, ay + b.h * g)) return true;
  }
  // Kablolar dik parçalardır: parçanın kutusu dikdörtgene değiyorsa kablo değer.
  for (const [xa, ya, xb, yb] of shapes.segments) {
    const ax = xa * g + view.x;
    const ay = ya * g + view.y;
    const bx = xb * g + view.x;
    const by = yb * g + view.y;
    if (overlaps(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by))) return true;
  }
  return false;
}

/**
 * Kutuyu (ızgara biriminde) ekrana sığdıran görünüm; devre alt köşedeki kutuya değecekse ya alttan (kutunun
 * üst kenarına kadar) ya da yandan (sol alttaki kutuda sağ kenarına, sağ alttakinde sol kenarına kadar) pay
 * bırakılır: ikisinden devrenin daha büyük göründüğü seçilir.
 */
export function fitAvoiding(shapes: CircuitShapes, box: Box, width: number, height: number, padding: number, legend: Rect | null): View {
  const plain = fitView(box, width, height, padding);
  if (!legend || !circuitHits(shapes, plain, legend)) return plain;
  const gap = 8;
  const right = legend.x + legend.w / 2 > width / 2;
  const bottom = Math.max(0, height - legend.y + gap - padding);
  const side = Math.max(0, right ? width - legend.x + gap - padding : legend.x + legend.w + gap - padding);
  const above = fitView(box, width, Math.max(1, height - bottom), padding);
  const beside = fitView(box, Math.max(1, width - side), height, padding);
  if (above.scale >= beside.scale) return above;
  return right ? beside : { ...beside, x: beside.x + side };
}

/** Telefon: sağ alttaki tam ekran düğmesi (44 px, kenardan 10 px) ve solundaki gerilim çipi (en çok 120 px). */
export const PHONE_CORNER = { margin: 10, button: 44, gap: 8, chip: 120 } as const;

/** Telefonda Sığdır'ın dışarıda bıraktığı sağ alt köşe (tuvalin koordinatlarında). */
export function phoneCornerRect(width: number, height: number): Rect {
  const { margin, button, gap, chip } = PHONE_CORNER;
  const w = chip + gap + button;
  return { x: width - margin - w, y: height - margin - button, w, h: button };
}
