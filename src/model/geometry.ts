// Geometri yardımcıları (ızgara biriminde).

import { CATALOG, type Box } from './catalog';
import type { Part, Point, Rotation } from './types';

export function pointKey(p: Point): string {
  return `${p.x},${p.y}`;
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Saat yönünde döndürme (ekranda y aşağı): 90° → (x, y) ↦ (−y, x). */
export function rotatePoint(p: Point, rotation: Rotation): Point {
  switch (rotation) {
    case 0:
      return p;
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
  }
}

export function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation;
}

/** Parçanın pinlerinin dünya konumları. */
export function pinPositions(part: Pick<Part, 'type' | 'x' | 'y' | 'rotation'>): Point[] {
  return CATALOG[part.type].pins.map((pin) => {
    const r = rotatePoint(pin, part.rotation);
    return { x: part.x + r.x, y: part.y + r.y };
  });
}

/** Döndürülmüş bir kutunun dünya koordinatındaki sınırları. */
export function rotatedBox(box: Box, rotation: Rotation, origin: Point): Box {
  const corners = [
    rotatePoint({ x: box.x, y: box.y }, rotation),
    rotatePoint({ x: box.x + box.w, y: box.y + box.h }, rotation),
  ];
  const x0 = Math.min(corners[0]!.x, corners[1]!.x);
  const x1 = Math.max(corners[0]!.x, corners[1]!.x);
  const y0 = Math.min(corners[0]!.y, corners[1]!.y);
  const y1 = Math.max(corners[0]!.y, corners[1]!.y);
  return { x: origin.x + x0, y: origin.y + y0, w: x1 - x0, h: y1 - y0 };
}

export function partBounds(part: Pick<Part, 'type' | 'x' | 'y' | 'rotation'>): Box {
  return rotatedBox(CATALOG[part.type].bounds, part.rotation, part);
}

export function boxContains(box: Box, p: Point): boolean {
  return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function boxFromPoints(a: Point, b: Point): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function unionBox(a: Box | null, b: Box): Box {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** p noktasının [a, b] doğru parçasına uzaklığı. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** p, [a, b] parçasının uçları HARİÇ bir noktası mı? (tamsayı koordinatlarda kesin) */
export function onSegmentInterior(p: Point, a: Point, b: Point): boolean {
  if (samePoint(p, a) || samePoint(p, b)) return false;
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (cross !== 0) return false;
  return (
    p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
  );
}

/** Parçanın üzerindeki en yakın ızgara noktası (yatay/dikey parçalarda). */
export function snapToSegment(p: Point, a: Point, b: Point): Point {
  if (a.y === b.y) {
    return { x: Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), Math.round(p.x))), y: a.y };
  }
  if (a.x === b.x) {
    return { x: a.x, y: Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), Math.round(p.y))) };
  }
  // Eğik parça: en yakın uç
  return Math.hypot(p.x - a.x, p.y - a.y) <= Math.hypot(p.x - b.x, p.y - b.y) ? a : b;
}
