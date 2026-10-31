// "Kablo gerilimi" açıklama kutusu (tuvalin sol alt köşesi) devrenin üstüne binmesin: Sığdır bu kutuyu
// görünür alanın dışında sayar (devre kutuya değecekse alttan ya da soldan pay bırakılır), kutu yine de
// devreye değiyorsa (kullanıcı yakınlaştırdı, kaydırdı) tek satıra küçülür. Saf işlevler (testler çağırır).

import type { Box } from '../model/catalog';
import { partBounds } from '../model/geometry';
import { GRID, type CircuitDoc } from '../model/types';
import { meterDisplayRect } from './PartView';
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
    if (part.type === 'voltmeter' || part.type === 'ammeter') boxes.push(meterDisplayRect(part, false));
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
 * Kutuyu (ızgara biriminde) ekrana sığdıran görünüm; devre sol alt köşedeki açıklama kutusuna değecekse
 * ya alttan (kutunun üst kenarına kadar) ya da soldan (sağ kenarına kadar) pay bırakılır: ikisinden
 * devrenin daha büyük göründüğü seçilir.
 */
export function fitAvoiding(shapes: CircuitShapes, box: Box, width: number, height: number, padding: number, legend: Rect | null): View {
  const plain = fitView(box, width, height, padding);
  if (!legend || !circuitHits(shapes, plain, legend)) return plain;
  const gap = 8;
  const bottom = Math.max(0, height - legend.y + gap - padding);
  const left = Math.max(0, legend.x + legend.w + gap - padding);
  const above = fitView(box, width, Math.max(1, height - bottom), padding);
  const beside = fitView(box, Math.max(1, width - left), height, padding);
  return above.scale >= beside.scale ? above : { ...beside, x: beside.x + left };
}
