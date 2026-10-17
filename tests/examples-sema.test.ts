// Örneklerin şema kalitesi: kablolar dik ve parçaların gövdesinden geçmez, parçalar üst üste
// binmez, devre başına tek toprak sembolü vardır ve dönüş akımı kablodan döner (toprak hattı
// yalnızca toprak tuzağında çizilir). Kablo kesişmesi yalnızca topolojik olarak kaçınılmaz olan
// örneklerde, sayısı sınırlı olarak bulunur (README, "Örnek şemaları").

import { describe, expect, it } from 'vitest';
import { EXAMPLE_IDS, exampleDoc, type ExampleId } from '../src/examples';
import type { Box } from '../src/model/catalog';
import { buildFlowGraph } from '../src/model/flow';
import { partBounds, pinPositions } from '../src/model/geometry';
import type { CircuitDoc, Part, Point } from '../src/model/types';

/**
 * İzin verilen kesişme sayısı. Yükselteçlerde ve transistör anahtarda osiloskobun giriş kablosu
 * besleme hattını keser (transistör, osiloskop ve besleme üç düğüme birden bağlıdır: K3,3);
 * JFET karakteristiğinde güç kaynağının uç sırası; barajda üç seviye bandı.
 */
const CROSSINGS: Partial<Record<ExampleId, number>> = {
  'jfet-karakteristik': 1,
  'fet-yukseltec': 1,
  'bjt-yukseltec': 1,
  'mosfet-yukseltec': 1,
  'bjt-anahtar': 1,
  'baraj-cubuk': 2,
  'baraj-tek-isik': 4,
};

type Segment = readonly [Point, Point];

function segments(doc: CircuitDoc): Segment[] {
  return doc.wires.flatMap((w) => w.points.slice(1).map((p, i) => [w.points[i]!, p] as const));
}

/** Kabloların geçmemesi gereken gövde: sınır kutusu, kenarlardan biraz içeride (uç bacakları kenarda). */
function body(part: Part): Box {
  let box = partBounds(part);
  // Toprak sembolünün ucu kutunun içindedir; gövde ucun altında başlar.
  if (part.type === 'ground') box = { x: box.x, y: part.y + 0.4, w: box.w, h: box.y + box.h - (part.y + 0.4) };
  const e = 0.05;
  return { x: box.x + e, y: box.y + e, w: box.w - 2 * e, h: box.h - 2 * e };
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const segmentBox = ([a, b]: Segment): Box => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

function interior(p: Point, [a, b]: Segment): boolean {
  if (a.x === b.x && p.x === a.x) return Math.min(a.y, b.y) < p.y && p.y < Math.max(a.y, b.y);
  if (a.y === b.y && p.y === a.y) return Math.min(a.x, b.x) < p.x && p.x < Math.max(a.x, b.x);
  return false;
}

/** Köşesiz kesişen (birbirine bağlı olmayan) dik kablo parçaları. */
function crossings(segs: readonly Segment[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i]!;
      const t = segs[j]!;
      const vs = s[0].x === s[1].x;
      const vt = t[0].x === t[1].x;
      if (vs === vt) continue;
      const [v, h] = vs ? [s, t] : [t, s];
      const p = { x: v[0].x, y: h[0].y };
      if (interior(p, v) && interior(p, h)) out.push(p);
    }
  }
  return out;
}

describe('Örnek şemaları', () => {
  for (const id of EXAMPLE_IDS) {
    it(`${id}: dik kablolar, gövdeden geçmiyor, parçalar ayrık, tek toprak, akım kablodan döner`, () => {
      const doc = exampleDoc(id)!;
      const segs = segments(doc);
      for (const [a, b] of segs) {
        expect(a.x === b.x || a.y === b.y, `${id}: eğik kablo ${a.x},${a.y}–${b.x},${b.y}`).toBe(true);
        expect(a.x === b.x && a.y === b.y, `${id}: sıfır uzunlukta kablo`).toBe(false);
      }
      // Üst üste binen (aynı doğru üzerinde örtüşen) kablo parçası yok.
      for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          const [a, b] = [segmentBox(segs[i]!), segmentBox(segs[j]!)];
          const sameLine = (a.w === 0 && b.w === 0 && a.x === b.x) || (a.h === 0 && b.h === 0 && a.y === b.y);
          const length = a.w === 0 ? Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) : Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          expect(sameLine && length > 0, `${id}: üst üste kablolar`).toBe(false);
        }
      }
      // Bir pin bir kablonun ortasında kalmaz (orada bağlı olmazdı).
      for (const part of doc.parts) {
        for (const pin of pinPositions(part)) {
          expect(segs.some((s) => interior(pin, s)), `${id}: ${part.label} ucu kablonun ortasında`).toBe(false);
        }
      }
      for (const part of doc.parts) {
        const b = body(part);
        for (const s of segs) expect(overlaps(segmentBox(s), b), `${id}: kablo ${part.label} gövdesinden geçiyor`).toBe(false);
        for (const other of doc.parts) {
          if (other !== part) expect(overlaps(b, body(other)), `${id}: ${part.label} ile ${other.label} üst üste`).toBe(false);
        }
      }
      expect(doc.parts.filter((p) => p.type === 'ground')).toHaveLength(1);
      expect(crossings(segs).length, `${id}: kesişme sayısı`).toBeLessThanOrEqual(CROSSINGS[id] ?? 0);
      // Toprak hattı (iki toprak noktası arasında kablo yok) yalnızca toprak tuzağında.
      expect(buildFlowGraph(doc).segments.some((seg) => seg.earth), id).toBe(id === 'toprak-tuzagi');
    });
  }

  it('osiloskoplu örneklerde COM ucu kabloyla devreye bağlı', () => {
    for (const id of EXAMPLE_IDS) {
      const doc = exampleDoc(id)!;
      const ends = new Set(doc.wires.flatMap((w) => w.points.map((p) => `${p.x},${p.y}`)));
      for (const scope of doc.parts.filter((p) => p.type === 'oscilloscope')) {
        const com = pinPositions(scope)[2]!;
        expect(ends.has(`${com.x},${com.y}`), `${id}: ${scope.label} COM`).toBe(true);
      }
    }
  });
});
