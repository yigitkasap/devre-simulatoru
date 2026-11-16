// "Yuvarlak gövde" (2026-11-16): LED, elektrolitik kondansatör, TO-18, NTC boncuğu ve buzzer eskiden ayak izi
// kuralına sığsın diye x'te ≈ 0,9, z'de ≈ 0,4 ölçekle eziliyor, daire 2:1 oval görünüyordu. 81 örnekte:
//   - yuvarlak gövdelerin x ve z ölçeği eşit (silindir ve küre biçimli hiçbir gövde eşit olmayan ölçekle ezilmez);
//   - çap yerleşime göre: olağan 1,5 delik (LED, elektrolitik), komşusuna değecekse ≈ 1 deliğe kadar küçülür;
//   - hiçbir iki gövde kesişmez; yuvarlak gövde başka bir parçanın bacağına ya da bir fişe değmez.

import { describe, expect, it } from 'vitest';
import { CylinderGeometry, Mesh, SphereGeometry, Vector3, type Object3D } from 'three';
import { BB, holeXZ, planBreadboard } from '../src/bench3d/breadboard';
import { PLUG } from '../src/bench3d/jumpers';
import { instrumentLeads } from '../src/bench3d/posts';
import { ROUND_GAP, roundSpec, sizeRoundBodies, type RoundItem, type RoundObstacle } from '../src/bench3d/roundBody';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';

// Modeller yazı dokusu çizer: düğümde boş bir tuval yeter (yalnızca geometri gerekir).
const ctx2d: unknown = new Proxy(
  {},
  {
    get: (_t, key) =>
      key === 'measureText' ? () => ({ width: 10 }) : key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : key === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => undefined,
    set: () => true,
  },
);
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d }) };

const { placeBoardParts } = await import('../src/bench3d/placement');

/** Yuvarlak gövdenin ölçüsü denetlenen parçası (parts.ts → named). */
const ROUND_MESH: Record<string, string> = { led: 'led-flans', capacitor: 'elektrolitik', npn: 'to18-flans', pnp: 'to18-flans', ntc: 'ntc', buzzer: 'buzzer' };

const all = EXAMPLE_IDS.map((id) => {
  const doc = exampleDoc(id)!;
  const plan = planBreadboard(doc);
  const { placements, conflicts } = placeBoardParts(doc, plan);
  const parts = doc.parts.flatMap((part) => {
    const placed = placements.get(part.id);
    return placed ? [{ part, placed, at: plan.onBoard.get(part.id)! }] : [];
  });
  return { id, doc, plan, parts, conflicts };
});

/** Nesnenin ve atalarının (model köküne kadar) x ve z ölçekleri eşit mi. */
function evenScale(o: Object3D): boolean {
  for (let n: Object3D | null = o; n; n = n.parent) if (Math.abs(n.scale.x - n.scale.z) > 1e-9) return false;
  return true;
}

const item = (id: string, x: number, z: number, max = 1.5, min = 1 - ROUND_GAP): RoundItem => ({ id, x, z, spec: { max, min } });

describe('Yuvarlak gövdelerin çapı (roundBody)', () => {
  it('çevresi boş gövde olağan çapında; komşu satırdaki iki gövde değmeyecek kadar küçülür (≈ 1 delik), aralarında boşluk kalır', () => {
    expect(sizeRoundBodies([item('a', 0, 0)], []).sizes.get('a')).toBe(1.5);
    const two = sizeRoundBodies([item('a', 0, 0), item('b', 0, 1)], []);
    expect(two.sizes.get('a')).toBeCloseTo(1 - ROUND_GAP, 9);
    expect(two.sizes.get('b')).toBeCloseTo(1 - ROUND_GAP, 9);
    expect(two.conflicts).toEqual([]);
    // İki delik arayla: 1,5 çap sığmaz (2 − aralık), ikisi eşit küçülür.
    const apart = sizeRoundBodies([item('a', 0, 0), item('b', 1.4, 0)], []);
    expect(apart.sizes.get('a')).toBeCloseTo(1.4 - ROUND_GAP, 9);
    expect(apart.sizes.get('a')).toBe(apart.sizes.get('b'));
  });

  it('sabit nesneye (komşu gövde kutusu, bacak, fiş) değmeyecek kadar küçülür; en küçük çapta da değiyorsa çakışma bildirilir', () => {
    const box: RoundObstacle = { kind: 'box', owner: 'r', name: 'R1', x0: -2, x1: 2, z0: 0.56, z1: 1.44 };
    const near = sizeRoundBodies([item('a', 0, 0)], [box]);
    expect(near.sizes.get('a')).toBeCloseTo(2 * (0.56 - ROUND_GAP), 9);
    expect(near.conflicts).toEqual([]);
    const tight = sizeRoundBodies([item('a', 0, 0)], [{ ...box, z0: 0.3 }]);
    expect(tight.sizes.get('a')).toBeCloseTo(1 - ROUND_GAP, 9);
    expect(tight.conflicts.map((c) => `${c.id}↔${c.other}`)).toEqual(['a↔R1']);
    // Kendi bacağı engel değil.
    expect(sizeRoundBodies([item('a', 0, 0)], [{ kind: 'circle', owner: 'a', name: 'a', x: 0.5, z: 0, r: 0.1 }]).sizes.get('a')).toBe(1.5);
    // Biri sabit nesne yüzünden küçükse öbürü kalan yeri alır.
    const uneven = sizeRoundBodies([item('a', 0, 0), item('b', 1.3, 0)], [{ kind: 'box', owner: 'r', name: 'R1', x0: -0.5, x1: 0.5, z0: -1.4, z1: -0.56 }]);
    expect(uneven.sizes.get('a')).toBeCloseTo(2 * (0.56 - ROUND_GAP), 9);
    expect(uneven.sizes.get('b')! / 2 + uneven.sizes.get('a')! / 2).toBeCloseTo(1.3 - ROUND_GAP, 9);
  });
});

describe('Yuvarlak gövdeler (81 örnek)', () => {
  it('x ve z ölçeği eşit: LED, elektrolitik, TO-18, NTC ve buzzer üstten bakınca daire; çapı yerleşimin seçtiği çap', () => {
    const bad: string[] = [];
    const seen = new Map<string, number>();
    for (const { id, parts } of all) {
      for (const { part, placed } of parts) {
        const spec = roundSpec(part);
        if (!spec) {
          expect(placed.round, `${id} ${part.label}`).toBeNull();
          continue;
        }
        seen.set(part.type, (seen.get(part.type) ?? 0) + 1);
        const round = placed.round!;
        let found = 0;
        placed.model.root.traverse((o) => {
          if (!(o instanceof Mesh)) return;
          // Gövdenin hiçbir parçası eşit olmayan ölçekle ezilmez.
          if (!evenScale(o)) bad.push(`${id} ${part.label}: "${o.name || o.geometry.type}" x ve z ölçeği farklı`);
          if (o.name !== ROUND_MESH[part.type]) return;
          found++;
          const scale = o.getWorldScale(new Vector3());
          const radius = o.geometry instanceof CylinderGeometry ? o.geometry.parameters.radiusTop : (o.geometry as SphereGeometry).parameters.radius;
          if (Math.abs(scale.x - scale.z) > 1e-9) bad.push(`${id} ${part.label}: ölçek ${scale.x.toFixed(3)} × ${scale.z.toFixed(3)}`);
          if (Math.abs(radius * scale.x - round.r) > 1e-6) bad.push(`${id} ${part.label}: yarıçap ${(radius * scale.x).toFixed(3)} ≠ ${round.r.toFixed(3)}`);
        });
        if (found !== 1) bad.push(`${id} ${part.label} (${part.type}): "${ROUND_MESH[part.type]}" bulunamadı`);
        if (round.r * 2 > spec.max + 1e-9 || round.r * 2 < spec.min - 1e-9) bad.push(`${id} ${part.label}: çap ${(2 * round.r).toFixed(2)} sınırların dışında`);
      }
    }
    expect(bad.slice(0, 30)).toEqual([]);
    // LED ve elektrolitik kondansatör pek çok örnekte; TO-18 (BC107) ve buzzer en az birinde.
    expect(seen.get('led')).toBeGreaterThan(30);
    expect(seen.get('capacitor')).toBeGreaterThan(10);
    expect(seen.get('npn')).toBeGreaterThan(0);
    expect(seen.get('buzzer')).toBeGreaterThan(0);
  });

  it('silindir ve küre biçimli hiçbir gövde eşit olmayan ölçekle ezilmez (tahtadaki bütün parçalar; çok katmanlı seramik damla dışında)', () => {
    const bad = new Set<string>();
    for (const { parts } of all) {
      for (const { part, placed } of parts) {
        placed.model.root.traverse((o) => {
          if (!(o instanceof Mesh) || !(o.geometry instanceof CylinderGeometry || o.geometry instanceof SphereGeometry)) return;
          // Daldırma kaplı çok katmanlı seramik kondansatör gerçekte de yassı bir damladır (parts.ts → 'mlcc').
          if (part.type === 'capacitor' && o.name === 'kondansator' && o.geometry instanceof SphereGeometry) return;
          if (Math.abs(o.scale.x - o.scale.z) > 1e-9 || !evenScale(o)) bad.add(`${part.type}: "${o.name || o.geometry.type}" ${o.scale.x.toFixed(2)} × ${o.scale.z.toFixed(2)}`);
        });
      }
    }
    expect([...bad]).toEqual([]);
  });

  it('hiçbir iki gövde kesişmez: yuvarlak gövde komşu gövdeye, başka parçanın bacağına ve fişlere değmez; en küçük çapta da değen yok', () => {
    const bad: string[] = [];
    for (const { id, doc, plan, parts, conflicts } of all) {
      for (const c of conflicts) bad.push(`${id}: ${c.id} ↔ ${c.other} (en küçük çapta ${c.overlap.toFixed(2)} birim iç içe)`);
      const plugs = plan.leads.flatMap((lead, i) => (new Set(instrumentLeads(doc, plan)).has(i) ? [] : [holeXZ(lead.hole, plan.cols)]));
      for (const a of parts) {
        const round = a.placed.round;
        if (!round) continue;
        const toBox = (x0: number, x1: number, z0: number, z1: number) => Math.hypot(Math.max(x0 - round.x, 0, round.x - x1), Math.max(z0 - round.z, 0, round.z - z1));
        for (const b of parts) {
          if (b === a) continue;
          const yMeet = a.placed.body.min.y < b.placed.body.max.y && b.placed.body.min.y < a.placed.body.max.y;
          const other = b.placed.round;
          const gap = other ? Math.hypot(round.x - other.x, round.z - other.z) - round.r - other.r : toBox(b.placed.body.min.x, b.placed.body.max.x, b.placed.body.min.z, b.placed.body.max.z) - round.r;
          if (yMeet && gap < ROUND_GAP - 1e-6) bad.push(`${id}: ${a.part.label} ↔ ${b.part.label} gövde aralığı ${gap.toFixed(3)}`);
          // Başka parçanın bacağı (deliği) gövdenin altında kalmaz.
          for (const h of [...b.at.holes, ...(b.at.extraHoles ?? [])]) {
            const { x, z } = holeXZ(h, plan.cols);
            if (Math.hypot(x - round.x, z - round.z) < round.r + 0.1) bad.push(`${id}: ${a.part.label} gövdesi ${b.part.label} bacağının üstünde`);
          }
        }
        for (const p of plugs) {
          const gap = toBox(p.x - PLUG.width / 2, p.x + PLUG.width / 2, p.z - PLUG.width / 2, p.z + PLUG.width / 2) - round.r;
          if (gap < ROUND_GAP - 1e-6) bad.push(`${id}: ${a.part.label} ↔ fiş ${gap.toFixed(3)}`);
        }
        // TO-18'in flanş sekmesi (dairenin dışına taşan tek çıkıntı) komşu gövdelere değmez.
        a.placed.model.root.traverse((o) => {
          if (o.name !== 'to18-sekme' || !(o instanceof Mesh)) return;
          o.geometry.computeBoundingBox();
          const g = o.geometry.boundingBox!;
          for (const k of [0, 1, 2, 3]) {
            const c = new Vector3(k & 1 ? g.max.x : g.min.x, 0, k & 2 ? g.max.z : g.min.z).applyMatrix4(o.matrixWorld);
            for (const b of parts) {
              if (b === a) continue;
              const other = b.placed.round;
              const box = b.placed.body;
              const gap = other ? Math.hypot(c.x - other.x, c.z - other.z) - other.r : Math.hypot(Math.max(box.min.x - c.x, 0, c.x - box.max.x), Math.max(box.min.z - c.z, 0, c.z - box.max.z));
              if (gap < ROUND_GAP) bad.push(`${id}: ${a.part.label} sekmesi ↔ ${b.part.label} ${gap.toFixed(3)}`);
            }
          }
        });
        // Gövde kartın üstünde, bacaklarının üstünde durur.
        if (a.placed.body.min.y < BB.height + 0.9) bad.push(`${id}: ${a.part.label} gövdesi karta çok yakın`);
      }
    }
    expect(bad.slice(0, 40)).toEqual([]);
  });

  it('çaplar: çevresi boş LED ve elektrolitik 1,5 delik; küçülenler yalnızca komşusu yakın olanlar (baraj-cubuk, yuruyen-isik, yarim-dalga, gerilim-katlayici dahil)', () => {
    const sizes = new Map<string, number[]>();
    for (const { id, parts } of all) for (const { part, placed } of parts) if (placed.round && (part.type === 'led' || part.type === 'capacitor')) sizes.set(id, [...(sizes.get(id) ?? []), 2 * placed.round.r]);
    const every = [...sizes.values()].flat();
    expect(Math.max(...every)).toBeCloseTo(1.5, 9);
    expect(Math.min(...every)).toBeGreaterThanOrEqual(1 - ROUND_GAP - 1e-9);
    // Çoğu gövde olağan çapında.
    expect(every.filter((d) => d > 1.49).length / every.length).toBeGreaterThan(0.5);
    for (const id of ['baraj-cubuk', 'yuruyen-isik', 'yarim-dalga', 'gerilim-katlayici']) expect(sizes.get(id)?.length ?? 0, id).toBeGreaterThan(0);
  });
});
