// Örneklerin şema kalitesi: kablolar dik ve parçaların gövdesinden geçmez, parçalar üst üste
// binmez, yazıları birbirine ve gövdelere binmez, devre başına tek toprak sembolü vardır ve dönüş
// akımı kablodan döner (toprak hattı yalnızca toprak tuzağında çizilir). Kablo kesişmesi yalnızca
// topolojik olarak kaçınılmaz olan örneklerde, sayısı sınırlı olarak bulunur (docs/KARARLAR.md,
// "Örnek şemaları"). Parçaların yazılarının (ad, not, değer) üstünden kablo geçmez.

import { describe, expect, it } from 'vitest';
import { meterFlipped, partTextBoxes } from '../src/editor/PartView';
import { EXAMPLE_IDS, exampleDoc, type ExampleId } from '../src/examples';
import type { Box } from '../src/model/catalog';
import { buildFlowGraph } from '../src/model/flow';
import { partBounds, pinPositions } from '../src/model/geometry';
import type { CircuitDoc, Part, Point } from '../src/model/types';

/**
 * İzin verilen kesişme sayısı. Föyde olmayan eski (ek) yükselteçlerde osiloskobun giriş kablosu
 * besleme hattını keser (transistör, osiloskop ve besleme üç düğüme birden bağlıdır: K3,3);
 * JFET karakteristiğinde güç kaynağının uç sırası; barajda üç seviye bandı.
 */
const CROSSINGS: Partial<Record<ExampleId, number>> = {
  'jfet-karakteristik': 1,
  'fet-yukseltec-kuplajli': 1,
  'bjt-yukseltec-kuplajli': 1,
  'mosfet-yukseltec-rs': 1,
  'baraj-cubuk': 2,
  'baraj-tek-isik': 4,
  // İşlemsel yükselteçte uç sırası (−, V+, çıkış, V−, +): geri besleme V+ kablosunu, toprak hattı V−
  // kablosunu (ya da karşılaştırıcıda iki bölücünün kolları birbirini) kesmek zorunda.
  'opamp-evirmeyen': 2,
  'opamp-eviren': 2,
  'opamp-karsilastirici': 2,
  // Tetik kolu (TRIG'den S1 ve çekme direncine) zamanlama kondansatörünün toprak kablosunu keser.
  '555-monostabil': 1,
  // Köprü diyot tek gövde: uçlar çevresinde ~ + ~ − sırasıyla; kaynağın kabloları iki ~ ucuna, yükünküler
  // + ile − ucuna gider. Gövdenin dışından karşılıklı uçları birleştiren iki yol kesişmek zorunda.
  'kopru-diyot': 1,
  // Föydeki Şekil-5a gibi: köprünün − ucundan çıkışın alt ucuna giden kablo üretecin alt kablosunu keser.
  'kopru-dogrultmac': 1,
  // Föydeki Şekil-10 gibi üretecin alt kablosu X düğümünü keser; osiloskobun B (alt çıkış) ve COM (orta)
  // uçlarının sırası çıkışlarınkiyle ters.
  'gerilim-katlayici': 2,
  // Lojik devreler: her giriş hem beslemeye (anahtar) hem toprağa (aşağı çekme direnci) bağlı ve
  // entegrenin bacak sırası işlevine göre değil (girişler, çıkışlar ve kullanılmayan bacaklar
  // karışık): girişlerin hatları birbirinin dikey kolunu, kullanılmayan bacakları beslemeye ya da
  // toprağa bağlayan kablolar giriş hatlarını keser. Entegrenin öbür yanındaki bacağa giden hat
  // VCC kablosunu keser (VCC sağ üst köşede).
  've-kapisi': 1,
  'nand-kapilar': 2,
  'yarim-toplayici': 4,
  'sr-mandal': 2,
  // 7474'ün sol yanında CLR̄, D, CLK, PRĒ, Q, Q̄ sırası: Q̄ → D ve PRĒ'nin beslemesi saati keser.
  'frekans-bolucu': 4,
  // LED'ler sayım sırasıyla (Q0 … Q9), CD4017'nin bacakları Q5 Q1 Q0 Q2 Q6 Q7 Q3 / Q9 Q4 Q8 sırasıyla.
  'yuruyen-isik': 16,
  // Anahtarlar yukarıdan aşağı D C B A, CD4511'in girişleri B C L̅T̅ B̅L̅ LE D A: D'nin kablosu C'ninkini ve
  // B'ninkini, C'ninki B'ninkini keser (3); L̅T̅ ve B̅L̅'nin besleme kablosu B ile C'yi, LE'nin toprak
  // kablosu D ile A'yı keser (4); anahtarların toprak uçları besleme hattını keser (3, en alttaki hariç).
  // CD4511'in çıkış sırası f g a b c d e, göstergenin a … g: f ve g göstergenin çevresinden dolaşırken
  // ortak katodun toprak kablosunu keser (2).
  'bcd-7-segment': 12,
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

  /** Parçaların yazılarının (ad, not, değer) kutuları. */
  const textBoxes = (doc: CircuitDoc) =>
    doc.parts.flatMap((part) => {
      const others = doc.parts.filter((o) => o !== part).map(partBounds);
      return partTextBoxes(part, meterFlipped(part, others)).map((box) => ({ part, box }));
    });

  it('parçaların yazıları (ad, not, değer) birbirine ve başka parçaların gövdesine binmiyor', () => {
    for (const id of EXAMPLE_IDS) {
      const doc = exampleDoc(id)!;
      const texts = textBoxes(doc);
      for (const [i, a] of texts.entries()) {
        for (const b of texts.slice(i + 1)) {
          if (a.part !== b.part) expect(overlaps(a.box, b.box), `${id}: ${a.part.label} ile ${b.part.label} yazıları`).toBe(false);
        }
        for (const part of doc.parts) {
          if (part !== a.part) expect(overlaps(a.box, partBounds(part)), `${id}: ${a.part.label} yazısı ${part.label} gövdesinde`).toBe(false);
        }
      }
    }
  });

  /**
   * Kablo yazının üstünden geçmez: yazı kutusunun içinden geçen ya da içinde kalan kablo parçası (kutunun
   * kenarına değen sayılmaz). Kaçınılmaz olan istisna şimdilik yok.
   */
  it('kablolar parçaların yazılarının (ad, not, değer) üstünden geçmiyor', () => {
    const across = (b: Box, [a, c]: Segment) => {
      const box = segmentBox([a, c]);
      if (box.w === 0) return b.x < box.x && box.x < b.x + b.w && box.y < b.y + b.h && b.y < box.y + box.h;
      return b.y < box.y && box.y < b.y + b.h && box.x < b.x + b.w && b.x < box.x + box.w;
    };
    for (const id of EXAMPLE_IDS) {
      const doc = exampleDoc(id)!;
      const segs = segments(doc);
      for (const { part, box } of textBoxes(doc)) {
        for (const s of segs) expect(across(box, s), `${id}: ${s[0].x},${s[0].y}–${s[1].x},${s[1].y} kablosu ${part.label} yazısının üstünden`).toBe(false);
      }
    }
  });
});
