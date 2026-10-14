// Telefondaki kurulum yardımcıları (tasarım: P02, P03): "Zincirle ekle" ile eklenen parçanın yeri ve
// Bağla kipinde iki uç arasındaki kablonun yolu. Saf fonksiyonlar; arayüzden bağımsız test edilir.

import { CATALOG, type Box } from '../model/catalog';
import { pinKey } from '../model/connectivity';
import { partBounds, pinPositions, rotatedBox } from '../model/geometry';
import type { CircuitDoc, Point, Rotation } from '../model/types';
import { routeL } from '../model/wires';
import type { DeviceType } from '../sim/netlist';

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];
type Dir = { readonly x: number; readonly y: number };
const cw = (d: Dir): Dir => ({ x: -d.y, y: d.x });
const ccw = (d: Dir): Dir => ({ x: d.y, y: -d.x });

/** Kutular kesişiyor mu (kenarların değmesi sayılmaz). */
function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function pad(box: Box, p: number): Box {
  return { x: box.x - p, y: box.y - p, w: box.w + 2 * p, h: box.h + 2 * p };
}

/** Bir parçanın boştaki ilk ucu (zincirin devam edeceği uç); yoksa null. */
export function firstFreePin(partId: string, unconnected: ReadonlySet<string>, doc: CircuitDoc): number | null {
  const part = doc.parts.find((p) => p.id === partId);
  if (!part) return null;
  const count = CATALOG[part.type].pins.length;
  for (let i = 0; i < count; i++) if (unconnected.has(pinKey(partId, i))) return i;
  return null;
}

export interface ChainPlacement {
  readonly at: Point;
  readonly rotation: Rotation;
  /** Çapanın ucundan yeni parçanın 0. ucuna giden kablonun noktaları (ilk nokta çapa). */
  readonly wire: readonly Point[];
}

/**
 * Zincirle ekle: yeni parçanın 0. ucu, çapa ucunun 2 (sığmazsa 4, 6) birim ötesine gelir ve gövdesi
 * aynı yönde uzanır. Yön önce, çapanın gövdesinden dışarı bakan yönün saat yönünde 90° döndürülmüşüdür
 * (pil → direnç → LED → … devre bir dikdörtgen gibi kapanır); sonra düz devam, sonra öbür yana dönüş.
 * Toprak önce aşağı iner. Hiçbir yere sığmazsa null.
 */
export function chainPlacement(doc: CircuitDoc, type: DeviceType, anchor: { partId: string; pin: number }): ChainPlacement | null {
  const owner = doc.parts.find((p) => p.id === anchor.partId);
  const from = owner ? pinPositions(owner)[anchor.pin] : undefined;
  if (!owner || !from) return null;
  const ob = partBounds(owner);
  const ox = from.x - (ob.x + ob.w / 2);
  const oy = from.y - (ob.y + ob.h / 2);
  const out: Dir = Math.abs(ox) >= Math.abs(oy) ? { x: Math.sign(ox) || 1, y: 0 } : { x: 0, y: Math.sign(oy) || -1 };
  const occupied = doc.parts.map((p) => partBounds(p));
  const def = CATALOG[type];
  // Toprak her zaman önce aşağı iner.
  const dirs = type === 'ground' ? [{ x: 0, y: 1 }, cw(out), out, ccw(out)] : [cw(out), out, ccw(out)];
  for (const dir of dirs) {
    for (const gap of [2, 4, 6]) {
      // Gövdesi `dir` yönünde uzanan döndürme: gövdenin merkezi 0. ucun en çok o yönünde olsun.
      let best: { rotation: Rotation; pin: Point; score: number } | null = null;
      for (const rotation of ROTATIONS) {
        const pin = pinPositions({ type, x: 0, y: 0, rotation })[0]!;
        const box = rotatedBox(def.bounds, rotation, { x: 0, y: 0 });
        const score = (box.x + box.w / 2 - pin.x) * dir.x + (box.y + box.h / 2 - pin.y) * dir.y;
        if (!best || score > best.score + 1e-9) best = { rotation, pin, score };
      }
      if (!best) continue;
      const pin0 = { x: from.x + dir.x * gap, y: from.y + dir.y * gap };
      const at = { x: pin0.x - best.pin.x, y: pin0.y - best.pin.y };
      const box = partBounds({ type, x: at.x, y: at.y, rotation: best.rotation });
      if (occupied.some((o) => overlaps(pad(box, 0.5), o))) continue;
      return { at, rotation: best.rotation, wire: [from, pin0] };
    }
  }
  return null;
}

/** Yatay ya da dikey doğru parçası, kutunun içinden (kenarlarından değil) geçiyor mu? */
function crosses(a: Point, b: Point, box: Box): boolean {
  const e = 0.3;
  if (a.y === b.y) {
    const [x1, x2] = a.x < b.x ? [a.x, b.x] : [b.x, a.x];
    return a.y > box.y + e && a.y < box.y + box.h - e && x2 > box.x + e && x1 < box.x + box.w - e;
  }
  const [y1, y2] = a.y < b.y ? [a.y, b.y] : [b.y, a.y];
  return a.x > box.x + e && a.x < box.x + box.w - e && y2 > box.y + e && y1 < box.y + box.h - e;
}

/**
 * İki nokta arasındaki L biçimli kablo: iki köşe seçeneğinden parçaların gövdesinden daha az geçeni
 * (eşitse önce yatay giden). Dönen noktalar başlangıcı içermez (routeL gibi).
 */
export function routeAround(doc: CircuitDoc, from: Point, to: Point): Point[] {
  const boxes = doc.parts.map((p) => partBounds(p));
  const preferHorizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
  const options = [routeL(from, to, preferHorizontal), routeL(from, to, !preferHorizontal)];
  let best = options[0]!;
  let bestHits = Infinity;
  for (const option of options) {
    const points = [from, ...option];
    let hits = 0;
    for (let i = 0; i + 1 < points.length; i++) for (const box of boxes) if (crosses(points[i]!, points[i + 1]!, box)) hits++;
    if (hits < bestHits) {
      best = option;
      bestHits = hits;
    }
  }
  return best;
}
